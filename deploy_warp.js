// Stage 1: deploy the USDT warp route (Hyperlane's own contracts) and enroll both sides.
//   BOT Chain testnet (968)      -> HypERC20Collateral wrapping the testnet USDT
//   Arbitrum Sepolia (421614)    -> HypERC20 (synthetic) + TrustedRelayerIsm
const fs = require('fs');
const { ethers } = require('/root/copyentries/node_modules/ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));

const BOT = { name: 'botchaintestnet', chainId: 968, domain: 968, rpc: 'https://rpc.bohr.life',
              mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B', usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3',
              explorer: 'https://scan.bohr.life/tx/' };
const ARB = { name: 'arbitrumsepolia', chainId: 421614, domain: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
              mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8', explorer: 'https://sepolia.arbiscan.io/tx/' };

const out = { bot: {}, arb: {} };
const save = () => fs.writeFileSync('/root/botchain-bridge/warp_deployments.json', JSON.stringify(out, null, 2));

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const botW = new ethers.Wallet(dep.privateKey, botP);
  const arbW = new ethers.Wallet(dep.privateKey, arbP);

  const deploy = async (wallet, chain, key, abiName, args) => {
    const f = new ethers.ContractFactory(art[abiName].abi, art[abiName].bytecode, wallet);
    console.log(`\nDeploying ${abiName} on ${chain.name} ...`);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`  ${abiName} = ${addr}`);
    console.log(`  ${chain.explorer}${c.deploymentTransaction().hash}`);
    out[key] = addr; save();
    return c;
  };

  // ---------- BOT side: collateral ----------
  const botCollateral = await deploy(botW, BOT, 'collateral', 'HypERC20Collateral',
    [BOT.usdt, 1n, 1n, BOT.mailbox]);

  // ---------- Arbitrum side: ISM + synthetic ----------
  const ism = await deploy(arbW, ARB, 'ism', 'TrustedRelayerIsm', [ARB.mailbox, dep.address]);
  const arbSynthetic = await deploy(arbW, ARB, 'synthetic', 'HypERC20', [6, 1n, 1n, ARB.mailbox]);

  // ---------- wire them up ----------
  const b32 = (a) => ethers.zeroPadValue(a, 32);

  console.log('\nSetting ISM on the Arbitrum synthetic router ...');
  let tx = await arbSynthetic.setInterchainSecurityModule(out.ism);
  await tx.wait();
  console.log('  ok:', ARB.explorer + tx.hash);

  console.log('\nEnrolling routers both directions ...');
  tx = await botCollateral.enrollRemoteRouter(ARB.domain, b32(out.synthetic));
  await tx.wait();
  console.log('  BOT collateral -> knows Arb synthetic:', BOT.explorer + tx.hash);

  tx = await arbSynthetic.enrollRemoteRouter(BOT.domain, b32(out.collateral));
  await tx.wait();
  console.log('  Arb synthetic  -> knows BOT collateral:', ARB.explorer + tx.hash);

  console.log('\n=== warp route deployed ===');
  console.log(JSON.stringify(out, null, 2));
  save();
})();
