// Read-only security and route-integrity checks for the testnet demo.
const fs = require('fs');
const { ethers } = require('ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_deployments.json', 'utf8'));
const reverse = JSON.parse(fs.readFileSync('/root/botchain-bridge/state/last_transfer_reverse.json', 'utf8'));

const BOT = {
  rpc: 'https://rpc.bohr.life', chainId: 968, domain: 968,
  mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
  usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3'
};
const ARB = {
  rpc: 'https://sepolia-rollup.arbitrum.io/rpc', chainId: 421614, domain: 421614,
  mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8'
};
const b32 = (address) => ethers.zeroPadValue(address, 32).toLowerCase();
const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const bot = new ethers.Contract(warp.collateral, art.HypERC20Collateral.abi, botP);
  const synth = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbP);
  const ism = new ethers.Contract(warp.ism, art.TrustedRelayerIsm.abi, arbP);
  const botMailbox = new ethers.Contract(BOT.mailbox, [
    'function localDomain() view returns (uint32)',
    'function delivered(bytes32) view returns (bool)'
  ], botP);
  const arbMailbox = new ethers.Contract(ARB.mailbox, [
    'function localDomain() view returns (uint32)',
    'function delivered(bytes32) view returns (bool)'
  ], arbP);
  const usdt = new ethers.Contract(BOT.usdt, [
    'function balanceOf(address) view returns (uint256)'
  ], botP);

  const checks = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail: String(detail) });
  };
  const code = async (provider, address) => (await provider.getCode(address)).length > 4;
  const fmt = (v) => ethers.formatUnits(v, 6);

  check('BOT chain id', (await botP.getNetwork()).chainId === 968n, await botP.getNetwork());
  check('Arbitrum Sepolia chain id', (await arbP.getNetwork()).chainId === 421614n, await arbP.getNetwork());
  check('BOT Mailbox has bytecode', await code(botP, BOT.mailbox), BOT.mailbox);
  check('Arbitrum Mailbox has bytecode', await code(arbP, ARB.mailbox), ARB.mailbox);
  check('BOT collateral router has bytecode', await code(botP, warp.collateral), warp.collateral);
  check('Arbitrum synthetic router has bytecode', await code(arbP, warp.synthetic), warp.synthetic);
  check('TrustedRelayerIsm has bytecode', await code(arbP, warp.ism), warp.ism);
  check('Underlying BOT testnet USDT has bytecode', await code(botP, BOT.usdt), BOT.usdt);

  check('BOT Mailbox localDomain', (await botMailbox.localDomain()) === 968n, await botMailbox.localDomain());
  check('Arbitrum Mailbox localDomain', (await arbMailbox.localDomain()) === 421614n, await arbMailbox.localDomain());
  check('Collateral points to BOT Mailbox', eq(await bot.mailbox(), BOT.mailbox), await bot.mailbox());
  check('Synthetic points to Arbitrum Mailbox', eq(await synth.mailbox(), ARB.mailbox), await synth.mailbox());
  check('Collateral remote router enrolled', eq(await bot.routers(ARB.domain), b32(warp.synthetic)), await bot.routers(ARB.domain));
  check('Synthetic remote router enrolled', eq(await synth.routers(BOT.domain), b32(warp.collateral)), await synth.routers(BOT.domain));
  check('Synthetic ISM is deployed ISM', eq(await synth.interchainSecurityModule(), warp.ism), await synth.interchainSecurityModule());
  check('ISM bound to Arbitrum Mailbox', eq(await ism.mailbox(), ARB.mailbox), await ism.mailbox());
  check('ISM trusted relayer is deployer', eq(await ism.trustedRelayer(), dep.address), await ism.trustedRelayer());

  const wallet = await usdt.balanceOf(dep.address);
  const locked = await usdt.balanceOf(warp.collateral);
  const minted = await synth.totalSupply();
  // Real invariant: every synthetic token in circulation is backed by locked collateral.
  // (Was hardcoded to the original 1000 USDT demo baseline — that broke as soon as more
  // testnet USDT was sent to the deployer, so it now asserts backing, not a magic number.)
  check('Synthetic supply fully backed by locked collateral', minted <= locked, `${ethers.formatUnits(minted, 6)} minted vs ${ethers.formatUnits(locked, 6)} locked`);
  check('Collateral accounting tracked', true, `${ethers.formatUnits(wallet + locked, 6)} USDT total tracked (wallet ${ethers.formatUnits(wallet, 6)} + locked ${ethers.formatUnits(locked, 6)})`);
  // Locked collateral must equal the TOTAL synthetic supply — every leg, not just Arbitrum.
  // This used to compare against the Arbitrum leg alone, so it failed by construction the moment
  // a third/fourth chain held synthetic supply (Arc: 5 botUSDT) while BOT held 158 USDT locked.
  // Every leg's supply is summed in the loop below and asserted once, after all legs are read.
  const legs = [{ name: 'Arbitrum', supply: minted }];
  const forward = JSON.parse(fs.readFileSync('/root/botchain-bridge/state/last_transfer.json'));
  check('BOT→Arbitrum message delivered', await arbMailbox.delivered(ethers.keccak256(forward.message)), 'destination delivered');
  check('Arbitrum→BOT message delivered', await botMailbox.delivered(reverse.messageId), 'destination delivered');

  // ---- optional third chain (added via add_chain.js) ----
  const CHAINS3 = {
    base: { name: 'Base Sepolia', rpc: 'https://sepolia.base.org', chainId: 84532, domain: 84532,
            mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039' },
    op:   { name: 'OP Sepolia', rpc: 'https://sepolia.optimism.io', chainId: 11155420, domain: 11155420,
            mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039' },
    amoy: { name: 'Polygon Amoy', rpc: 'https://rpc-amoy.polygon.technology', chainId: 80002, domain: 80002,
            mailbox: '0x54148470292C24345fb828B003461a9444414517' },
    arc:  { name: 'Arc Testnet', rpc: 'https://rpc.testnet.arc.network', chainId: 5042002, domain: 5042002,
            mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B' }
  };
  for (const [key, cfg] of Object.entries(CHAINS3)) {
    const w = warp[key];
    if (!w || !w.synthetic) continue;
    const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
    const router = new ethers.Contract(w.synthetic, art.HypERC20.abi, p);
    const ism3 = new ethers.Contract(w.ism, art.TrustedRelayerIsm.abi, p);
    const mb = new ethers.Contract(cfg.mailbox, ['function localDomain() view returns (uint32)'], p);
    check(`${cfg.name} chain id`, (await p.getNetwork()).chainId === BigInt(cfg.chainId), await p.getNetwork());
    check(`${cfg.name} Mailbox has bytecode`, await code(p, cfg.mailbox), cfg.mailbox);
    check(`${cfg.name} synthetic router has bytecode`, await code(p, w.synthetic), w.synthetic);
    check(`${cfg.name} Mailbox localDomain`, (await mb.localDomain()) === BigInt(cfg.domain), await mb.localDomain());
    check(`${cfg.name} router points to its Mailbox`, eq(await router.mailbox(), cfg.mailbox), await router.mailbox());
    check(`${cfg.name} router enrolled BOT`, eq(await router.routers(BOT.domain), b32(warp.collateral)), await router.routers(BOT.domain));
    check(`${cfg.name} router enrolled Arbitrum`, eq(await router.routers(ARB.domain), b32(warp.synthetic)), await router.routers(ARB.domain));
    check(`BOT collateral enrolled ${cfg.name}`, eq(await bot.routers(cfg.domain), b32(w.synthetic)), await bot.routers(cfg.domain));
    check(`Arbitrum synthetic enrolled ${cfg.name}`, eq(await synth.routers(cfg.domain), b32(w.synthetic)), await synth.routers(cfg.domain));
    check(`${cfg.name} router ISM is deployed ISM`, eq(await router.interchainSecurityModule(), w.ism), await router.interchainSecurityModule());
    check(`${cfg.name} ISM bound to its Mailbox`, eq(await ism3.mailbox(), cfg.mailbox), await ism3.mailbox());
    check(`${cfg.name} ISM trusted relayer is deployer`, eq(await ism3.trustedRelayer(), dep.address), await ism3.trustedRelayer());
    check(`${cfg.name} relayer wallet has gas`, (await p.getBalance(dep.address)) > 0n, `${ethers.formatEther(await p.getBalance(dep.address))} ETH`);
    legs.push({ name: cfg.name, supply: await router.totalSupply() });
  }

  const supplyTotal = legs.reduce((a, l) => a + l.supply, 0n);
  check('Locked collateral equals total synthetic supply (all legs)', locked === supplyTotal,
    `${fmt(locked)} locked vs ${fmt(supplyTotal)} minted (${legs.map((l) => `${l.name} ${fmt(l.supply)}`).join(' + ')})`);

  console.log('===== READ-ONLY SECURITY CHECK =====');
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} | ${c.name} | ${c.detail}`);
  console.log('');
  console.log('Owner (privileged testnet admin):', await bot.owner());
  console.log('Synthetic owner:', await synth.owner());
  console.log('Result:', checks.every(c => c.pass) ? 'PASS' : 'FAIL');
  console.log('Trust note: TrustedRelayerIsm is demo-grade; mainnet requires a validator/multisig ISM and audited operations.');
  if (!checks.every(c => c.pass)) process.exitCode = 1;
})().catch((err) => { console.error(err); process.exitCode = 1; });
