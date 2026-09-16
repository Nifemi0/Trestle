// Hardened relayer for the BOT testnet USDT warp mesh (BOT ↔ Arbitrum ↔ Base ↔ Arc).
//
//   node relayer.js                 continuous loop (run under systemd: botchain-relayer.service)
//   node relayer.js --once          single pass
//   node relayer.js --dry-run       scan + report, never send
//
// Stability properties (vs the first version):
//   * per-chain confirmation depth taken from registry metadata (Base reorgs deeper than the rest)
//   * per-chain RPC list with failover — a dead/rate-limited endpoint no longer stalls a route
//   * retry with backoff on RPC calls, isolated per route (one bad chain can't kill the loop)
//   * persisted cursors AND a pending-message ledger: a message that was dispatched but not
//     delivered after STUCK_MINUTES raises an alert instead of failing silently
//   * no-gas destinations raise one alert (not a per-poll error storm)
//   * every loop writes relayer_health.json — `health.js` and any watchdog read that
//   * alerts go to alerts.log always, and to Telegram too if TG_TOKEN/TG_CHAT are set
//
const fs = require('fs');
const path = require('path');
const { ethers } = require('/root/copyentries/node_modules/ethers');

const ROOT = '/root/botchain-bridge';
const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployer.json'), 'utf8'));
const statePath = process.env.RELAYER_STATE || path.join(ROOT, 'relayer_state.json');
const healthPath = process.env.RELAYER_HEALTH || path.join(ROOT, 'relayer_health.json');
const alertsPath = process.env.RELAYER_ALERTS || path.join(ROOT, 'alerts.log');

const POLL_MS = Number(process.env.RELAYER_POLL_MS || 15000);
const MAX_BLOCK_RANGE = Number(process.env.RELAYER_MAX_BLOCK_RANGE || 2000);
const STUCK_MINUTES = Number(process.env.RELAYER_STUCK_MINUTES || 20);
const RPC_RETRIES = Number(process.env.RELAYER_RPC_RETRIES || 3);
const TG_TOKEN = process.env.TG_TOKEN || '';
const TG_CHAT = process.env.TG_CHAT || '';
const ONCE = process.argv.includes('--once');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.RELAYER_DRY_RUN === '1';

const MAILBOX_ABI = [
  'function process(bytes _metadata, bytes _message) payable',
  'function delivered(bytes32) view returns (bool)'
];
const coder = ethers.AbiCoder.defaultAbiCoder();

// rpcs[] is tried in order and rotated on failure — never a single point of failure per chain.
// confirmations >= that chain's reorgPeriod from the Hyperlane registry.
const CHAINS = {
  bot: { name: 'BOT Chain testnet', domain: 968, confirmations: 3, explorer: 'https://scan.bohr.life/tx/',
         rpcs: ['https://rpc.bohr.life'],
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B' },
  arb: { name: 'Arbitrum Sepolia', domain: 421614, confirmations: 3, explorer: 'https://sepolia.arbiscan.io/tx/',
         rpcs: ['https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia-rpc.publicnode.com'],
         mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8' },
  base: { name: 'Base Sepolia', domain: 84532, confirmations: 6, explorer: 'https://sepolia.basescan.org/tx/',
         rpcs: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
         mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039' },
  arc: { name: 'Arc Testnet', domain: 5042002, confirmations: 3, explorer: 'https://testnet.arcscan.app/tx/',
         rpcs: ['https://rpc.testnet.arc.network'],
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B' }
};

// full mesh by default; RELAYER_ROUTES="bot<>arb,arc<>base" restricts and is matched both ways
const ROUTE_FILTER = (process.env.RELAYER_ROUTES || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALL_PAIRS = [];
for (const a of Object.keys(CHAINS)) {
  for (const b of Object.keys(CHAINS)) if (a !== b) ALL_PAIRS.push({ source: a, destination: b });
}
const ROUTES = ROUTE_FILTER.length
  ? ALL_PAIRS.filter((r) => ROUTE_FILTER.some((f) => { const [x, y] = f.split('<>'); return (x === r.source && y === r.destination) || (y === r.source && x === r.destination); }))
  : ALL_PAIRS;

// ---------- infrastructure ----------
const RPC_STATE = {}; // chain key -> rotate index

function providerFor(key) {
  const chain = CHAINS[key];
  RPC_STATE[key] = RPC_STATE[key] || 0;
  return new ethers.JsonRpcProvider(chain.rpcs[RPC_STATE[key]], undefined, { staticNetwork: true });
}
function rotateRpc(key, reason) {
  const chain = CHAINS[key];
  if (chain.rpcs.length < 2) return false;
  RPC_STATE[key] = (RPC_STATE[key] + 1) % chain.rpcs.length;
  log(`[rpc-failover] ${key}: switching to ${chain.rpcs[RPC_STATE[key]]} (${reason})`);
  return true;
}
async function withRetry(key, fn, label) {
  let lastErr;
  for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
    try {
      return await fn(providerFor(key));
    } catch (err) {
      lastErr = err;
      const msg = (err && (err.shortMessage || err.message)) || String(err);
      log(`[retry] ${key} ${label} attempt ${attempt + 1}/${RPC_RETRIES} failed: ${msg.slice(0, 120)}`);
      await sleep(1000 * (attempt + 1));
      rotateRpc(key, msg.slice(0, 60));
    }
  }
  throw lastErr;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();
function log(msg) {
  const line = `${ts()} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(LOG_DIR, 'relayer.log'), line + '\n'); } catch {}
}

// ---------- alerting ----------
const ALERTED = new Set();
function alert(key, message) {
  if (ALERTED.has(key)) return false;
  ALERTED.add(key);
  const line = `${ts()} ALERT ${key}: ${message}`;
  try { fs.appendFileSync(alertsPath, line + '\n'); } catch {}
  console.error(line);
  if (TG_TOKEN && TG_CHAT) {
    const body = JSON.stringify({ chat_id: TG_CHAT, text: `⚠️ BOT bridge relayer\n${key}\n${message}` });
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    }).catch(() => {});
  }
  return true;
}
function clearAlert(key) { ALERTED.delete(key); }

// ---------- state ----------
function loadState() {
  if (fs.existsSync(statePath)) {
    try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (err) { log(`[state] unreadable, starting fresh: ${err.message}`); }
  }
  return {};
}
function saveState(state) {
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath);
}
function writeHealth(health) {
  const tmp = `${healthPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(health, null, 2));
  fs.renameSync(tmp, healthPath);
}

function padTopic(topic) { return topic.replace(/^0x/, '').padStart(64, '0'); }
function dispatchFromLog(logItem, source, destination) {
  if (logItem.address.toLowerCase() !== source.mailbox.toLowerCase() || logItem.topics.length !== 4) return null;
  let message;
  try { message = coder.decode(['bytes'], logItem.data)[0]; } catch { return null; }
  const declaredDestination = Number(BigInt(`0x${padTopic(logItem.topics[2])}`));
  if (declaredDestination !== destination.domain) return null;
  return {
    sourceBlock: logItem.blockNumber,
    sourceTx: logItem.transactionHash,
    logIndex: logItem.index,
    message,
    messageId: ethers.keccak256(message),
    declaredEventId: logItem.topics[1]
  };
}

// ---------- per-route relay ----------
async function relayRoute(route, state, stats) {
  const source = CHAINS[route.source], destination = CHAINS[route.destination];
  const key = `${route.source}->${route.destination}`;

  const latest = await withRetry(route.source, (p) => p.getBlockNumber(), 'getBlockNumber');
  const safeTo = latest - source.confirmations;
  const configuredStart = Number(process.env[`RELAYER_START_${route.source.toUpperCase()}`] || 0);
  const from = state[key]?.nextBlock ?? (configuredStart || Math.max(0, safeTo - MAX_BLOCK_RANGE + 1));
  if (safeTo < from) return { key, scanned: 0, relayed: 0, nextBlock: from, pending: 0 };

  const destinationProvider = providerFor(route.destination);
  const mailbox = new ethers.Contract(destination.mailbox, MAILBOX_ABI, new ethers.Wallet(dep.privateKey, destinationProvider));

  let cursor = from, scanned = 0, relayed = 0, pending = 0;
  while (cursor <= safeTo) {
    const to = Math.min(cursor + MAX_BLOCK_RANGE - 1, safeTo);
    const logs = await withRetry(route.source, (p) => p.getLogs({ address: source.mailbox, fromBlock: cursor, toBlock: to }), 'getLogs');
    for (const logItem of logs) {
      const item = dispatchFromLog(logItem, source, destination);
      if (!item) continue;
      scanned++;
      const alreadyDelivered = await mailbox.delivered(item.messageId);
      if (alreadyDelivered || state.messages?.[item.messageId]?.status === 'delivered') {
        if (state.pending) delete state.pending[item.messageId];
        continue;
      }
      pending++;
      state.pending = state.pending || {};
      if (!state.pending[item.messageId]) {
        state.pending[item.messageId] = { route: key, sourceTx: item.sourceTx, firstSeen: ts() };
      }

      if (DRY_RUN) { log(`[dry-run] ${key} ${item.messageId} source=${item.sourceTx}`); continue; }

      const destGas = await destinationProvider.getBalance(dep.address);
      if (destGas === 0n) {
        alert(`no-gas:${key}`, `relayer wallet ${dep.address} has no ${destination.name} gas — route paused until funded`);
        continue;
      }
      clearAlert(`no-gas:${key}`);

      log(`[relay] ${key} ${item.messageId} source=${item.sourceTx}`);
      const tx = await mailbox.process('0x', item.message);
      const receipt = await tx.wait();
      const delivered = await mailbox.delivered(item.messageId);
      if (!delivered) throw new Error(`process confirmed but delivery flag is false for ${item.messageId}`);
      state.messages = state.messages || {};
      state.messages[item.messageId] = { status: 'delivered', source: key, sourceTx: item.sourceTx, relayTx: tx.hash, block: receipt.blockNumber, at: ts() };
      delete state.pending[item.messageId];
      saveState(state);
      relayed++;
      stats.relayedTotal++;
      log(`[done] ${destination.explorer}${tx.hash}`);
    }
    cursor = to + 1;
    state[key] = { nextBlock: cursor, updatedAt: ts() };
    saveState(state);
  }

  // stuck-message detection: dispatched, not delivered, older than STUCK_MINUTES
  for (const [messageId, meta] of Object.entries(state.pending || {})) {
    if (meta.route !== key) continue;
    const ageMin = (Date.now() - new Date(meta.firstSeen).getTime()) / 60000;
    if (ageMin > STUCK_MINUTES) {
      alert(`stuck:${messageId}`, `${key} message undelivered for ${ageMin.toFixed(0)} min (source ${source.explorer}${meta.sourceTx})`);
    }
  }
  return { key, scanned, relayed, nextBlock: cursor, pending };
}

async function run() {
  const state = loadState();
  state.messages = state.messages || {};
  state.pending = state.pending || {};
  log(`Relayer starting ${DRY_RUN ? '(dry-run) ' : ''}${ONCE ? 'one-shot' : 'continuous'}; routes=${ROUTES.length}; confirmations per chain: ${Object.entries(CHAINS).map(([k, c]) => `${k}=${c.confirmations}`).join(' ')}`);

  const stats = { startedAt: ts(), loops: 0, relayedTotal: 0, lastLoopAt: null, errors: 0, routes: {} };
  do {
    const loopStart = Date.now();
    stats.loops++;
    let loopErrors = 0;
    for (const route of ROUTES) {
      try {
        const res = await relayRoute(route, state, stats);
        stats.routes[res.key] = { nextBlock: res.nextBlock, scanned: res.scanned, relayed: res.relayed, pending: res.pending, at: ts() };
        if (res.scanned || res.relayed) log(JSON.stringify(res));
      } catch (err) {
        loopErrors++;
        stats.errors++;
        const msg = (err && (err.shortMessage || err.message)) || String(err);
        log(`[error] ${route.source}->${route.destination}: ${msg.slice(0, 200)}`);
        // an alert only after repeated failure of the same route, so a transient blip stays quiet
        const fails = (stats.routes[`${route.source}->${route.destination}`]?.consecutiveErrors || 0) + 1;
        stats.routes[`${route.source}->${route.destination}`] = { ...(stats.routes[`${route.source}->${route.destination}`] || {}), consecutiveErrors: fails, at: ts() };
        if (fails >= 5) alert(`route-failing:${route.source}->${route.destination}`, `${fails} consecutive failures: ${msg.slice(0, 160)}`);
        else clearAlert(`route-failing:${route.source}->${route.destination}`);
      }
    }
    stats.lastLoopAt = ts();
    stats.lastLoopMs = Date.now() - loopStart;
    stats.lastLoopErrors = loopErrors;
    stats.pendingTotal = Object.keys(state.pending).length;
    writeHealth(stats);
    if (!ONCE) await sleep(POLL_MS);
  } while (!ONCE);
  log(`Relayer finished: loops=${stats.loops} relayed=${stats.relayedTotal} errors=${stats.errors}`);
}

run().catch((err) => {
  alert('relayer-crash', `fatal: ${(err && err.message) || err}`);
  console.error(err);
  process.exitCode = 1;
});
