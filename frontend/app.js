// Trestle — 4-chain USDT bridge UI (BOT testnet ↔ Arbitrum / Base / Arc Sepolia-testnets).
// Any-to-any through the Hyperlane warp mesh: every chain below is enrolled with every other.
const { ethers } = window;

const CONFIG = {
  bot:  { key:'bot',  name:'BOT Chain', network:'BOT testnet', domain:968, chainId:'0x3c8',
          rpc:'https://rpc.bohr.life', explorer:'https://scan.bohr.life/tx/', icon:'B', kind:'bot',
          token:'0x75edC9335175Fc0552D51D48439F229c10420fe3', router:'0xb2BFd514997773eBe9AF77E83e153e3A5405CEB6',
          tokenLabel:'USDT', native:{symbol:'tBOT', decimals:18} },
  arb:  { key:'arb',  name:'Arbitrum', network:'Sepolia', domain:421614, chainId:'0x66eee',
          rpc:'https://sepolia-rollup.arbitrum.io/rpc', explorer:'https://sepolia.arbiscan.io/tx/', icon:'A', kind:'arb',
          token:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6', router:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6',
          tokenLabel:'botUSDT', native:{symbol:'ETH', decimals:18} },
  base: { key:'base', name:'Base', network:'Sepolia', domain:84532, chainId:'0x14a34',
          rpc:'https://sepolia.base.org', explorer:'https://sepolia.basescan.org/tx/', icon:'B', kind:'base',
          token:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6', router:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6',
          tokenLabel:'botUSDT', native:{symbol:'ETH', decimals:18} },
  arc:  { key:'arc',  name:'Arc', network:'Testnet', domain:5042002, chainId:'0x4cef52',
          rpc:'https://rpc.testnet.arc.network', explorer:'https://testnet.arcscan.app/tx/', icon:'C', kind:'arc',
          token:'0x73E7fa23EE5743959A24143B6f51D2B5D9ffC784', router:'0x73E7fa23EE5743959A24143B6f51D2B5D9ffC784',
          tokenLabel:'botUSDT', native:{symbol:'USDC', decimals:18} },
};
const CHAIN_ORDER = ['bot','arb','base','arc'];
const COUNTERPARTY = { bot:'any', arb:'any', base:'any', arc:'any' };  // full mesh

const ERC20 = ['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'];
const ROUTER_ABI = [
  'function transferRemote(uint32,bytes32,uint256) payable returns (bytes32)',
  'function quoteDispatch(uint32,bytes32,uint256) view returns (uint256)',
];

const readProviders = {};
for (const k of CHAIN_ORDER) {
  readProviders[k] = new ethers.JsonRpcProvider(CONFIG[k].rpc, { chainId: CONFIG[k].domain, name: k }, { staticNetwork: true });
}

let provider, signer, account;
let fromKey = 'bot', toKey = 'arb';
const WALLET_STORAGE_KEY = 'trestle_wallet_connected';
const ROUTE_STORAGE_KEY = 'trestle_route';
const LEGACY_WALLET_STORAGE_KEY = 'relayline_wallet_connected';
const LEGACY_ROUTE_STORAGE_KEY = 'relayline_route';
const $ = (id) => document.getElementById(id);
const button = $('connect'), notice = $('notice'), balance = $('balance'),
      destinationBalance = $('destination-balance'), statusBox = $('transfer-status'),
      activityList = $('activity-list'), fromSelect = $('from-select'), toSelect = $('to-select');

const source = () => CONFIG[fromKey];
const destination = () => CONFIG[toKey];
function say(text, error = false) { notice.textContent = text; notice.style.color = error ? '#ff6b5a' : '#a5a69f'; }

function fillSelect(sel, options, selected) {
  sel.innerHTML = options
    .map((k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${CONFIG[k].name} · ${CONFIG[k].network}</option>`)
    .join('');
}
function availableDestinations() { return CHAIN_ORDER.filter((k) => k !== fromKey); }
function refreshDestinations() {
  const options = availableDestinations();
  if (!options.includes(toKey)) toKey = options[0];
  fillSelect(toSelect, options, toKey);
}
function persistRoute() {
  try {
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ fromKey, toKey }));
    localStorage.removeItem(LEGACY_ROUTE_STORAGE_KEY);
  } catch {}
}
function restoreRoute() {
  try {
    const raw = localStorage.getItem(ROUTE_STORAGE_KEY) || localStorage.getItem(LEGACY_ROUTE_STORAGE_KEY) || 'null';
    const saved = JSON.parse(raw);
    if (saved && CONFIG[saved.fromKey] && CONFIG[saved.toKey] && saved.fromKey !== saved.toKey) {
      fromKey = saved.fromKey; toKey = saved.toKey;
      persistRoute();
    }
  } catch {}
}

function setSteps(active = -1, done = false) {
  const names = ['Wallet confirmed', 'Source transaction confirmed', 'Relayer detected message', 'Destination delivered'];
  statusBox.hidden = false;
  statusBox.innerHTML = names.map((n, i) =>
    `<div class="status-step ${i < active || done ? 'done' : ''} ${i === active && !done ? 'active' : ''}"><span>${i < active || done ? '✓' : i + 1}</span>${n}</div>`).join('');
}
function setRouteLabels() {
  const r = { source: source(), destination: destination() };
  const fields = [
    ['from-icon', r.source.icon], ['from-name', r.source.name], ['from-domain', r.source.domain],
    ['from-network', r.source.network], ['to-icon', r.destination.icon], ['to-name', r.destination.name],
    ['to-domain', r.destination.domain], ['to-network', r.destination.network],
  ];
  fields.forEach(([id, v]) => { $(id).textContent = v; });
  $('from-icon').className = `chain-icon ${r.source.kind}`;
  $('to-icon').className = `chain-icon ${r.destination.kind}`;
  $('amount-symbol').textContent = r.source.tokenLabel;
  $('source-balance-label').textContent = `${r.source.name} ${r.source.tokenLabel} balance`;
  $('destination-balance-label').textContent = `${r.destination.name} ${r.destination.tokenLabel}`;
  $('route-count').textContent = String(CHAIN_ORDER.length * (CHAIN_ORDER.length - 1));
  persistRoute();
}

async function ensureChain(chain) {
  const current = (await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase();
  if (current === chain.chainId) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
  } catch (e) {
    const unknown = e.code === 4902 || e.code === -32602 || e.code === -32603 || /unrecognized|unknown chain|not added/i.test(e.message || '');
    if (!unknown) throw e;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: chain.chainId,
      chainName: `${chain.name} ${chain.network}`,
      nativeCurrency: { name: chain.native.symbol, symbol: chain.native.symbol, decimals: chain.native.decimals },
      rpcUrls: [chain.rpc],
      blockExplorerUrls: [chain.explorer.replace(/tx\/$/, '')],
    }] });
    const after = (await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase();
    if (after !== chain.chainId) await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
  }
}

async function updateBalances() {
  if (!account) return null;
  const s = source(), d = destination();
  const srcToken = new ethers.Contract(s.token, ERC20, provider);
  const dstToken = new ethers.Contract(d.token, ERC20, readProviders[d.key]);
  const [a, b] = await Promise.all([srcToken.balanceOf(account), dstToken.balanceOf(account)]);
  balance.textContent = `${ethers.formatUnits(a, 6)} ${s.tokenLabel}`;
  destinationBalance.textContent = `${ethers.formatUnits(b, 6)} ${d.tokenLabel}`;
  return { source: a, destination: b };
}

async function connect() {
  if (!window.ethereum) { say('No EVM wallet detected. Open this page in MetaMask or Rabby.', true); return; }
  try {
    const s = source();
    say(`Connect your wallet on ${s.name} ${s.network}…`);
    await ensureChain(s);
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    localStorage.setItem(WALLET_STORAGE_KEY, '1');
    await updateBalances();
    button.innerHTML = `Bridge ${account.slice(0, 6)}…${account.slice(-4)} <span>↗</span>`;
    button.onclick = bridge;
    say(`Connected on ${s.name}. You can start a testnet transfer.`);
  } catch (e) { say(e.shortMessage || e.message || 'Wallet connection cancelled.', true); }
}

async function restoreWallet() {
  const shouldRestore = localStorage.getItem(WALLET_STORAGE_KEY) === '1' || localStorage.getItem(LEGACY_WALLET_STORAGE_KEY) === '1';
  if (!window.ethereum || !shouldRestore) return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (!accounts.length) return;
    provider = new ethers.BrowserProvider(window.ethereum);
    account = accounts[0];
    signer = await provider.getSigner();
    const chain = (await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase();
    if (chain === source().chainId) {
      localStorage.setItem(WALLET_STORAGE_KEY, '1');
      localStorage.removeItem(LEGACY_WALLET_STORAGE_KEY);
      await updateBalances();
      button.innerHTML = `Bridge ${account.slice(0, 6)}…${account.slice(-4)} <span>↗</span>`;
      button.onclick = bridge;
      say(`Wallet reconnected on ${source().name}.`);
    } else {
      say(`Wallet connected. Switch to ${source().name} to continue.`);
    }
  } catch { localStorage.removeItem(WALLET_STORAGE_KEY); }
}

async function waitForDestination(before, amount, d) {
  const token = new ethers.Contract(d.token, ['function balanceOf(address) view returns(uint256)'], readProviders[d.key]);
  for (let i = 0; i < 30; i++) {
    await new Promise((x) => setTimeout(x, 5000));
    const now = await token.balanceOf(account);
    if (now >= before + amount) return true;
  }
  return false;
}

async function bridge() {
  try {
    const s = source(), d = destination();
    await ensureChain(s);
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    const text = $('amount').value;
    if (!text || Number(text) <= 0) throw Error('Enter a valid amount.');
    const amount = ethers.parseUnits(text, 6);
    const before = await updateBalances();
    if (before.source < amount) throw Error(`Insufficient ${s.tokenLabel} on ${s.name}.`);
    setSteps(0);
    button.disabled = true;

    const srcToken = new ethers.Contract(s.token, ERC20, signer);
    const srcRouter = new ethers.Contract(s.router, ROUTER_ABI, signer);

    // collateral leg (BOT side) pulls the real token -> needs an allowance first
    if (s.key === 'bot') {
      const allowance = await srcToken.allowance(account, s.router);
      if (allowance < amount) {
        say('Confirm the USDT approval in your wallet…');
        const approval = await srcToken.approve(s.router, amount);
        await approval.wait();
      }
    }

    // a chain whose mailbox requires an interchain-gas payment needs the quote attached
    let value = 0n;
    try {
      const quoted = await srcRouter.quoteDispatch(d.domain, ethers.zeroPadValue(account, 32), amount);
      if (quoted && quoted > 0n) value = quoted;
    } catch { /* no IGP configured on this route — send with no value */ }

    say('Confirm the bridge transaction in your wallet…');
    button.textContent = 'Confirm transfer…';
    const tx = await srcRouter.transferRemote(d.domain, ethers.zeroPadValue(account, 32), amount, { value });
    setSteps(1);
    say(`Source submitted: ${tx.hash.slice(0, 10)}…`);
    await tx.wait();
    setSteps(2);
    say('Source confirmed. Automatic relayer is watching the message…');

    const delivered = await waitForDestination(before.destination, amount, d);
    if (!delivered) throw Error('Source succeeded, but destination is still pending. Refresh activity and balance shortly.');
    setSteps(3, true);
    say(`Delivered on ${d.name}. Your ${d.tokenLabel} balance has updated.`);
    await updateBalances();
    setTimeout(refresh, 1000);
  } catch (e) {
    say(e.shortMessage || e.message || 'Transfer failed.', true);
  } finally {
    button.disabled = false;
    button.innerHTML = `Bridge ${account ? account.slice(0, 6) + '…' + account.slice(-4) : 'wallet'} <span>↗</span>`;
  }
}

function render(data) {
  const rows = (data.recent || []).map((x) => {
    const iconClass = CONFIG[x.destinationKey]?.kind || CONFIG[x.sourceKey]?.kind || (x.direction.includes('BOT') ? 'bot' : 'arb');
    return `<div class="activity-item"><span class="chain-icon ${iconClass}">↗</span><span class="route">${x.direction}</span><span class="status">Delivered</span><span class="time">${x.time || 'recent'}</span>${x.relayTx ? `<a class="tx" target="_blank" rel="noreferrer" href="${x.explorer}">tx ↗</a>` : ''}</div>`;
  }).join('');
  activityList.innerHTML = rows || '<div class="activity-item"><span class="route">No new transfers yet</span><span class="time">Relayer is watching</span></div>';
}
async function refresh() {
  activityList.innerHTML = '<div class="skeleton"></div><div class="skeleton short"></div>';
  try { const r = await fetch('/api/status', { cache: 'no-store' }); render(await r.json()); }
  catch { activityList.innerHTML = '<div class="activity-item"><span class="route">Status unavailable</span><span class="time">Refresh to retry</span></div>'; }
}

// --- wiring ---
fromSelect.addEventListener('change', async () => {
  fromKey = fromSelect.value;
  refreshDestinations();
  setRouteLabels();
  statusBox.hidden = true;
  if (account) { try { await ensureChain(source()); provider = new ethers.BrowserProvider(window.ethereum); signer = await provider.getSigner(); await updateBalances(); } catch (e) { say(e.shortMessage || e.message, true); } }
});
toSelect.addEventListener('change', () => { toKey = toSelect.value; setRouteLabels(); statusBox.hidden = true; });
$('flip-route').addEventListener('click', async () => {
  const prevFrom = fromKey;
  fromKey = toKey; toKey = prevFrom;
  fillSelect(fromSelect, CHAIN_ORDER, fromKey);
  refreshDestinations();
  setRouteLabels();
  statusBox.hidden = true;
  button.onclick = account ? bridge : connect;
  if (account) { try { await ensureChain(source()); provider = new ethers.BrowserProvider(window.ethereum); signer = await provider.getSigner(); await updateBalances(); say(`Route reversed. Wallet is ready on ${source().name}.`); } catch (e) { say(e.shortMessage || e.message, true); } }
  else say(`Connect your wallet on ${source().name}.`);
});

restoreRoute();
fillSelect(fromSelect, CHAIN_ORDER, fromKey);
refreshDestinations();
setRouteLabels();
button.addEventListener('click', connect);
$('refresh').addEventListener('click', refresh);
refresh();
restoreWallet();

if (window.ethereum) {
  window.ethereum.on('accountsChanged', async (xs) => {
    if (xs[0]) { account = xs[0]; localStorage.setItem(WALLET_STORAGE_KEY, '1'); if (provider) await updateBalances(); }
    else {
      account = null; signer = null;
      localStorage.removeItem(WALLET_STORAGE_KEY);
      localStorage.removeItem(LEGACY_WALLET_STORAGE_KEY);
      button.innerHTML = 'Connect wallet <span>↗</span>'; button.onclick = connect;
      balance.textContent = 'Connect wallet'; destinationBalance.textContent = '—'; say('Wallet disconnected.');
    }
  });
  window.ethereum.on('chainChanged', () => { if (account) { provider = new ethers.BrowserProvider(window.ethereum); signer = null; say(`Network changed. Select ${source().name} when you are ready.`); } });
}

window.__trestle = { CONFIG, CHAIN_ORDER, availableDestinations, getRoute: () => ({ from: fromKey, to: toKey }) };   // landing.js reads the chain table from here
