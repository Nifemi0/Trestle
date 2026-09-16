// Resume/reconcile wiring after a partial add_chain.js run (e.g. the ISM set tx reverted).
// Idempotent: only sends the transactions that are actually missing, with explicit gas limits
// (the original failure was a reverted setInterchainSecurityModule on Base — replaying the same
// call succeeds, so it was a gas/estimate problem, not a state problem).
//   node resume_chain.js [--target=base]
const fs = require('fs');
const { ethers } = require('/root/copyentries/node_modules/ethers');
const ROOT = '/root/botchain-bridge';
const art = JSON.parse(fs.readFileSync(`${ROOT}/warp_artifacts.json`, 'utf8'));
const dep = JSON.parse(fs.readFileSync(`${ROOT}/deployer.json`, 'utf8'));
const warpPath = `${ROOT}/warp_deployments.json`;
const warp = JSON.parse(fs.readFileSync(warpPath, 'utf8'));

const TARGETS = {
  base: { key: 'base', name: 'Base Sepolia', domain: 84532, rpc: 'https://sepolia.base.org',
          mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039', explorer: 'https://sepolia.basescan.org/tx/' },
  op:   { key: 'op', name: 'OP Sepolia', domain: 11155420, rpc: 'https://sepolia.optimism.io',
          mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039', explorer: 'https://sepolia-optimism.etherscan.io/tx/' },
  amoy: { key: 'amoy', name: 'Polygon Amoy', domain: 80002, rpc: 'https://rpc-amoy.polygon.technology',
          mailbox: '0x54148470292C24345fb828B003461a9444414517', explorer: 'https://amoy.polygonscan.com/tx/' },
  arc:  { key: 'arc', name: 'Arc Testnet', domain: 5042002, rpc: 'https://rpc.testnet.arc.network',
          mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B', explorer: 'https://testnet.arcscan.app/tx/' },
};
const key = (process.argv.find((a) => a.startsWith('--target=')) || '--target=base').split('=')[1];
const T = TARGETS[key];
const b32 = (a) => ethers.zeroPadValue(a, 32);
const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';

const BOT = { name: 'BOT Chain testnet', domain: 968, rpc: 'https://rpc.bohr.life',
              mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B', router: warp.collateral,
              explorer: 'https://scan.bohr.life/tx/' };
const ARB = { name: 'Arbitrum Sepolia', domain: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
              mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8', router: warp.synthetic,
              explorer: 'https://sepolia.arbiscan.io/tx/' };
// every other chain already in the route is a peer of the target — wire ALL pairs, not just
// hub-and-spoke, so the mesh stays fully connected as chains are added.
const PEERS = [BOT, ARB];
if (warp.base && warp.base.synthetic) {
  PEERS.push({ name: 'Base Sepolia', domain: 84532, rpc: 'https://sepolia.base.org',
               mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039', router: warp.base.synthetic,
               explorer: 'https://sepolia.basescan.org/tx/', ismAbi: art.TrustedRelayerIsm.abi });
}
// peer routers use the synthetic ABI; BOT is the collateral side
const abiFor = (c) => (c.router === warp.collateral ? art.HypERC20Collateral.abi : art.HypERC20.abi);

(async () => {
  const w = warp[T.key];
  if (!w || !w.synthetic) { console.error(`no ${T.key} deployment in warp_deployments.json`); process.exit(2); }
  const pNew = new ethers.JsonRpcProvider(T.rpc, undefined, { staticNetwork: true });
  const pBot = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const pArb = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const newW = new ethers.Wallet(dep.privateKey, pNew);
  const botW = new ethers.Wallet(dep.privateKey, pBot);
  const arbW = new ethers.Wallet(dep.privateKey, pArb);

  const synth = new ethers.Contract(w.synthetic, art.HypERC20.abi, newW);
  const botR = new ethers.Contract(BOT.router, art.HypERC20Collateral.abi, botW);
  const arbR = new ethers.Contract(ARB.router, art.HypERC20.abi, arbW);

  const send = async (label, contract, fn, args, explorer, chainName) => {
    console.log(`\n[${chainName}] ${label}`);
    const est = await contract[fn].estimateGas(...args);
    console.log(`  gas estimate ${est}`);
    const tx = await contract[fn](...args, { gasLimit: (est * 3n) / 2n });
    const rc = await tx.wait();
    console.log(`  status ${rc.status}  gasUsed ${rc.gasUsed}  ${explorer}${tx.hash}`);
    if (rc.status !== 1) throw new Error(`${label} failed`);
    return tx;
  };

  // 1. ISM on the new synthetic router
  const currentIsm = await synth.interchainSecurityModule();
  if (eq(currentIsm, w.ism)) console.log(`[${T.name}] ISM already set -> ${w.ism}`);
  else {
    console.log(`[${T.name}] ISM currently ${currentIsm} (zero=${eq(currentIsm, ZERO)})`);
    await send('setInterchainSecurityModule', synth, 'setInterchainSecurityModule', [w.ism], T.explorer, T.name);
  }

  // 2. new router -> every peer
  for (const c of PEERS) {
    const cur = await synth.routers(c.domain);
    if (eq(cur, b32(c.router))) console.log(`[${T.name}] already enrolled ${c.name}`);
    else await send(`enrollRemoteRouter(${c.name})`, synth, 'enrollRemoteRouter', [c.domain, b32(c.router)], T.explorer, T.name);
  }

  // 3. every peer -> new router
  const ctx = [];
  for (const c of PEERS) {
    const provider = new ethers.JsonRpcProvider(c.rpc, undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(dep.privateKey, provider);
    const contract = new ethers.Contract(c.router, abiFor(c), wallet);
    const cur = await contract.routers(T.domain);
    if (eq(cur, b32(w.synthetic))) console.log(`[${c.name}] already enrolled ${T.name}`);
    else await send(`enrollRemoteRouter(${T.name})`, contract, 'enrollRemoteRouter', [T.domain, b32(w.synthetic)], c.explorer, c.name);
    ctx.push({ c, contract });
  }

  // 4. verify
  console.log('\n=== verification ===');
  const rows = [[`${T.name} ISM`, await synth.interchainSecurityModule(), w.ism],
                [`${T.name} mailbox`, await synth.mailbox(), T.mailbox]];
  for (const c of PEERS) rows.push([`${T.name} -> ${c.name}`, await synth.routers(c.domain), b32(c.router)]);
  for (const { c, contract } of ctx) rows.push([`${c.name} -> ${T.name}`, await contract.routers(T.domain), b32(w.synthetic)]);
  let ok = true;
  for (const [l, got, want] of rows) {
    const pass = eq(got, want);
    ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${l} | ${got}`);
  }
  console.log(`\nresult: ${ok ? 'PASS' : 'FAIL'}`);
  fs.writeFileSync(warpPath, JSON.stringify(warp, null, 2));
})();
