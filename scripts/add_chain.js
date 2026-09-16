// Add another chain to the BOT testnet USDT warp route (Hyperlane).
//   node add_chain.js --preflight [--target=base]     read-only readiness check
//   node add_chain.js --deploy    [--target=base]     deploy ISM + synthetic, wire all sides
//
// Target chain gets a SYNTHETIC leg (HypERC20 "botUSDT"), so it needs gas only —
// no testnet USDT faucet needed on the new chain.
//
// Wiring produced:  BOT (collateral) <-> NEW (synthetic)  and  Arb (synthetic) <-> NEW (synthetic)
const fs = require('fs');
const { ethers } = require('ethers');

const ROOT = '/root/botchain-bridge';
const art = JSON.parse(fs.readFileSync(`${ROOT}/contracts/warp_artifacts.json`, 'utf8'));
const dep = JSON.parse(fs.readFileSync(`${ROOT}/deployer.json`, 'utf8'));
const warpPath = `${ROOT}/contracts/warp_deployments.json`;
const warp = JSON.parse(fs.readFileSync(warpPath, 'utf8'));

const CHAIN_META = {
  bot: { name: 'BOT Chain testnet', domain: 968, rpc: 'https://rpc.bohr.life',
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
         router: warp.collateral, explorer: 'https://scan.bohr.life/tx/', kind: 'collateral' },
  arb: { name: 'Arbitrum Sepolia', domain: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
         mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8',
         router: warp.synthetic, explorer: 'https://sepolia.arbiscan.io/tx/', kind: 'synthetic' },
  base: { name: 'Base Sepolia', domain: 84532, rpc: 'https://sepolia.base.org',
          mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039',
          router: warp.base?.synthetic, explorer: 'https://sepolia.basescan.org/tx/', kind: 'synthetic' },
  arc: { name: 'Arc Testnet', domain: 5042002, rpc: 'https://rpc.testnet.arc.network',
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
         router: warp.arc?.synthetic, explorer: 'https://testnet.arcscan.app/tx/', kind: 'synthetic' },
};
function deployedPeers(targetKey) {
  return Object.fromEntries(Object.entries(CHAIN_META).filter(([k, c]) => k !== targetKey && c.router));
}
let EXISTING = {};  // filled after --target is parsed

// Canonical Hyperlane core (mailbox addresses verified live via eth_getCode).
const TARGETS = {
  base: { key: 'base', name: 'Base Sepolia', domain: 84532, chainIdHex: '0x14a34',
          rpc: 'https://sepolia.base.org', mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039',
          explorer: 'https://sepolia.basescan.org/tx/', symbol: 'botUSDT', decimals: 6,
          registryFile: 'basesepolia' },
  op:   { key: 'op', name: 'OP Sepolia', domain: 11155420, chainIdHex: '0xaa37dc',
          rpc: 'https://sepolia.optimism.io', mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039',
          explorer: 'https://sepolia-optimism.etherscan.io/tx/', symbol: 'botUSDT', decimals: 6,
          registryFile: 'optimismsepolia' },
  amoy: { key: 'amoy', name: 'Polygon Amoy', domain: 80002, chainIdHex: '0x13882',
          rpc: 'https://rpc-amoy.polygon.technology', mailbox: '0x54148470292C24345fb828B003461a9444414517',
          explorer: 'https://amoy.polygonscan.com/tx/', symbol: 'botUSDT', decimals: 6,
          registryFile: 'polygonamoy' },
  arc:  { key: 'arc', name: 'Arc Testnet', domain: 5042002, chainIdHex: '0x4cef52',
          rpc: 'https://rpc.testnet.arc.network', mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
          explorer: 'https://testnet.arcscan.app/tx/', symbol: 'botUSDT', decimals: 6,
          registryFile: 'arctestnet' },
};

const argTarget = (process.argv.find((a) => a.startsWith('--target=')) || '--target=base').split('=')[1];
const T = TARGETS[argTarget];
EXISTING = deployedPeers(argTarget);
const MODE = process.argv.includes('--deploy') ? 'deploy' : 'preflight';
const b32 = (a) => ethers.zeroPadValue(a, 32);

function providers() {
  const out = { new: new ethers.JsonRpcProvider(T.rpc, undefined, { staticNetwork: true }) };
  for (const [k, c] of Object.entries(EXISTING)) out[k] = new ethers.JsonRpcProvider(c.rpc, undefined, { staticNetwork: true });
  return out;
}

(async () => {
  if (!T) { console.error('unknown --target'); process.exit(2); }
  console.log(`=== add_chain ${MODE} :: ${T.name} (domain ${T.domain}) ===\n`);
  const P = providers();
  const newW = new ethers.Wallet(dep.privateKey, P.new);

  // ---------- preflight ----------
  const code = await P.new.getCode(T.mailbox);
  const balance = await P.new.getBalance(dep.address);
  const gasPrice = (await P.new.getFeeData()).gasPrice ?? 0n;
  console.log(`mailbox ${T.mailbox} bytecode: ${(code.length - 2) / 2} bytes ${code === '0x' ? '<-- MISSING' : 'OK'}`);
  console.log(`deployer ${dep.address}`);
  console.log(`  ${T.name.padEnd(16)} ${ethers.formatEther(balance)} ETH  ${balance === 0n ? '<-- NO GAS (blocker)' : 'OK'}`);
  for (const [k, c] of Object.entries(EXISTING)) {
    console.log(`  ${c.name.padEnd(16)} ${ethers.formatEther(await P[k].getBalance(dep.address))} gas`);
  }
  const deployCost = 3_000_000n * gasPrice + 1_200_000n * gasPrice; // synthetic + ISM, rough 2 tx
  const wireCost = 900_000n * gasPrice * 2n;                      // 2 enroll txs on target
  console.log(`  est. target-chain cost: ${ethers.formatEther(deployCost + wireCost)} ETH (gas ${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);

  // existing enrollments on both current routers
  for (const [k, c] of Object.entries(EXISTING)) {
    const r = new ethers.Contract(c.router, art[c.kind === 'collateral' ? 'HypERC20Collateral' : 'HypERC20'].abi, P[k]);
    const cur = await r.routers(T.domain);
    console.log(`  ${c.name} knows ${T.name}: ${set(cur) === '0' ? 'no (will enroll)' : cur.slice(0, 12) + '…' }`);
  }
  if (warp[T.key] && warp[T.key].synthetic) {
    console.log(`\nNOTE: ${T.name} already deployed at ${warp[T.key].synthetic} — deploy would redeploy. Aborting.`);
    process.exit(3);
  }
  if (MODE === 'preflight') {
    console.log('\npreflight done. deploy with:  node add_chain.js --deploy --target=' + T.key);
    return;
  }
  if (balance === 0n) { console.error(`\nBLOCKED: send testnet ETH to ${dep.address} on ${T.name} then rerun --deploy`); process.exit(4); }

  // ---------- deploy ----------
  const deploy = async (wallet, key, abiName, args) => {
    const f = new ethers.ContractFactory(art[abiName].abi, art[abiName].bytecode, wallet);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`  ${abiName} = ${addr}\n    ${T.explorer}${c.deploymentTransaction().hash}`);
    warp[T.key] = { ...(warp[T.key] || {}), [key]: addr };
    fs.writeFileSync(warpPath, JSON.stringify(warp, null, 2));
    return c;
  };

  console.log(`\n--- deploying on ${T.name} ---`);
  const ism = await deploy(newW, 'ism', 'TrustedRelayerIsm', [T.mailbox, dep.address]);
  const synth = await deploy(newW, 'synthetic', 'HypERC20', [T.decimals, 1n, 1n, T.mailbox]);

  const ismAddr = await ism.getAddress();
  console.log('\nsetting ISM on the new synthetic router ...');
  let tx = await synth.setInterchainSecurityModule(ismAddr);
  await tx.wait();
  console.log('  ok:', T.explorer + tx.hash);

  console.log('\n--- enrolling remote routers ---');
  for (const c of Object.values(EXISTING)) {
    tx = await synth.enrollRemoteRouter(c.domain, b32(c.router));
    await tx.wait(); console.log(`  new -> ${c.name} :`, T.explorer + tx.hash);
  }

  const newAddr = await synth.getAddress();
  for (const c of Object.values(EXISTING)) {
    const peerProvider = new ethers.JsonRpcProvider(c.rpc, undefined, { staticNetwork: true });
    const peerWallet = new ethers.Wallet(dep.privateKey, peerProvider);
    const peerRouter = new ethers.Contract(c.router, art[c.kind === 'collateral' ? 'HypERC20Collateral' : 'HypERC20'].abi, peerWallet);
    tx = await peerRouter.enrollRemoteRouter(T.domain, b32(newAddr));
    await tx.wait(); console.log(`  ${c.name} -> new :`, c.explorer + tx.hash);
  }

  fs.writeFileSync(warpPath, JSON.stringify(warp, null, 2));
  console.log('\n=== done ===\n' + JSON.stringify(warp, null, 2));
  console.log(`\nAdd to relayer.js CHAINS/ROUTES: ${T.key} domain ${T.domain}, mailbox ${T.mailbox}`);
})();

function set(hex) { return (hex || '0x').toUpperCase(); }
