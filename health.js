#!/usr/bin/env node
// Bridge health check. Silent when everything is fine (the watchdog pattern), prints a short
// report only when something needs attention. Exit code is always 0 unless the check itself
// crashes, so a Hermes cron job can deliver stdout verbatim and stay quiet otherwise.
//
//   node health.js            report problems only
//   node health.js --verbose  always print the full status
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('/root/copyentries/node_modules/ethers');

const ROOT = '/root/botchain-bridge';
const VERBOSE = process.argv.includes('--verbose');
const STALE_MS = Number(process.env.HEALTH_STALE_MS || 120000);      // relayer heartbeat window
const STUCK_MIN = Number(process.env.RELAYER_STUCK_MINUTES || 20);
const LAG_WARN = Number(process.env.HEALTH_LAG_BLOCKS || 5000);

const warp = JSON.parse(fs.readFileSync(path.join(ROOT, 'warp_deployments.json'), 'utf8'));

// minimum gas we want the relayer/deployer to keep on each chain (native units, decimal string)
const CHAINS = {
  bot:  { name: 'BOT Chain testnet', rpc: 'https://rpc.bohr.life', minGas: '1.0',  token: 'tBOT',
          synthetic: warp.collateral, kind: 'collateral' },
  arb:  { name: 'Arbitrum Sepolia', rpc: 'https://sepolia-rollup.arbitrum.io/rpc', minGas: '0.005', token: 'ETH',
          synthetic: warp.synthetic },
  base: { name: 'Base Sepolia', rpc: 'https://sepolia.base.org', minGas: '0.005', token: 'ETH',
          synthetic: warp.base?.synthetic },
  arc:  { name: 'Arc Testnet', rpc: 'https://rpc.testnet.arc.network', minGas: '2.0', token: 'USDC',
          synthetic: warp.arc?.synthetic }
};

const problems = [];
const ok = [];
const add = (list, msg) => list.push(msg);

(async () => {
  const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployer.json'), 'utf8'));

  // 1. relayer process + heartbeat
  let running = false;
  try { running = execSync('pgrep -f "node /root/botchain-bridge/relayer.js" || true').toString().trim() !== ''; } catch {}
  if (!running) add(problems, 'relayer: NOT RUNNING (systemctl status botchain-relayer)');
  else add(ok, 'relayer: running');

  const healthPath = path.join(ROOT, 'relayer_health.json');
  let health = null;
  if (fs.existsSync(healthPath)) {
    health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    const age = Date.now() - new Date(health.lastLoopAt).getTime();
    if (age > STALE_MS) add(problems, `relayer heartbeat STALE: last loop ${(age / 1000).toFixed(0)}s ago (limit ${STALE_MS / 1000}s)`);
    else add(ok, `relayer heartbeat fresh (${(age / 1000).toFixed(0)}s ago, loops ${health.loops})`);
    if (health.pendingTotal > 0) {
      const pending = readPending();
      const stuck = pending.filter((p) => (Date.now() - new Date(p.firstSeen).getTime()) / 60000 > STUCK_MIN);
      if (stuck.length) add(problems, `STUCK messages: ${stuck.length} undelivered > ${STUCK_MIN} min — ${stuck.map((s) => `${s.route} ${s.sourceTx?.slice(0, 12)}…`).join(', ')}`);
      else add(ok, `${health.pendingTotal} message(s) in flight (all under ${STUCK_MIN} min)`);
    }
  } else {
    add(problems, 'relayer_health.json missing — the hardened relayer never completed a loop');
  }

  // 2. alerts written since the last check
  const alertsPath = path.join(ROOT, 'alerts.log');
  if (fs.existsSync(alertsPath)) {
    const lines = fs.readFileSync(alertsPath, 'utf8').trim().split('\n').filter(Boolean);
    const recent = lines.slice(-5).filter((l) => Date.now() - new Date(l.slice(0, 24)).getTime() < 24 * 3600 * 1000);
    if (recent.length) add(problems, `alerts.log (last 24h):\n    ${recent.join('\n    ')}`);
  }

  // 3. gas per chain + route lag
  for (const [key, cfg] of Object.entries(CHAINS)) {
    if (!cfg.synthetic) continue;
    try {
      const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
      const bal = await p.getBalance(dep.address);
      const min = ethers.parseEther(cfg.minGas);
      if (bal < min) add(problems, `${cfg.name}: relayer gas LOW — ${ethers.formatEther(bal)} ${cfg.token} (want ≥ ${cfg.minGas})`);
      else add(ok, `${cfg.name}: gas ${ethers.formatEther(bal)} ${cfg.token}`);

      if (health?.routes) {
        const head = await p.getBlockNumber();
        for (const [rk, rv] of Object.entries(health.routes)) {
          if (!rk.startsWith(`${key}->`) || !rv.nextBlock) continue;
          const lag = head - rv.nextBlock;
          if (lag > LAG_WARN) add(problems, `cursor lag on ${rk}: ${lag} blocks behind head`);
        }
      }
    } catch (err) {
      add(problems, `${cfg.name}: RPC check failed — ${(err.shortMessage || err.message).slice(0, 90)}`);
    }
  }

  // 4. collateral invariant: locked USDT on BOT == sum of synthetic supplies
  try {
    const bot = new ethers.JsonRpcProvider(CHAINS.bot.rpc, undefined, { staticNetwork: true });
    const erc20 = ['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)'];
    const usdt = new ethers.Contract('0x75edC9335175Fc0552D51D48439F229c10420fe3', erc20, bot);
    const locked = await usdt.balanceOf(warp.collateral);
    let minted = 0n;
    for (const key of ['arb', 'base', 'arc']) {
      if (!CHAINS[key].synthetic) continue;
      const p = new ethers.JsonRpcProvider(CHAINS[key].rpc, undefined, { staticNetwork: true });
      minted += await new ethers.Contract(CHAINS[key].synthetic, erc20, p).totalSupply();
    }
    if (locked === minted) add(ok, `accounting: locked ${ethers.formatUnits(locked, 6)} == minted ${ethers.formatUnits(minted, 6)}`);
    else add(problems, `ACCOUNTING MISMATCH: locked ${ethers.formatUnits(locked, 6)} vs minted ${ethers.formatUnits(minted, 6)}`);
  } catch (err) {
    add(problems, `accounting check failed: ${(err.shortMessage || err.message).slice(0, 90)}`);
  }

  if (problems.length) {
    console.log('BOT bridge health');
    for (const p of problems) console.log(`PROBLEM ${p}`);
    if (VERBOSE) for (const o of ok) console.log(`ok      ${o}`);
  } else if (VERBOSE) {
    console.log('BOT bridge health: OK');
    for (const o of ok) console.log(`ok      ${o}`);
  }
})();

function readPending() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'relayer_state.json'), 'utf8'));
    return Object.entries(state.pending || {}).map(([messageId, meta]) => ({ messageId, ...meta }));
  } catch { return []; }
}
