// End-to-end transfer across any of the wired chains.
//   node transfer.js --from=bot --to=base --amount=25
//   node transfer.js --from=base --to=bot --amount=25
//
// From BOT the source token is the canonical testnet USDT (collateral: approve + lock).
// From base/arb it's the synthetic botUSDT (burn). Destination can be any enrolled chain.
// Recipient defaults to the deployer address, so balance changes are self-evident.
const fs = require('fs');
const { ethers } = require('ethers');
const ROOT = '/root/botchain-bridge';
const art = JSON.parse(fs.readFileSync(`${ROOT}/contracts/warp_artifacts.json`, 'utf8'));
const dep = JSON.parse(fs.readFileSync(`${ROOT}/deployer.json`, 'utf8'));
const warp = JSON.parse(fs.readFileSync(`${ROOT}/contracts/warp_deployments.json`, 'utf8'));

const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${dflt}`).split('=')[1];
const FROM = arg('from', 'bot'), TO = arg('to', 'base'), AMOUNT = arg('amount', '25');
const RECIPIENT = arg('recipient', dep.address);

const CHAINS = {
  bot: { name: 'BOT Chain testnet', domain: 968, rpc: 'https://rpc.bohr.life',
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B', explorer: 'https://scan.bohr.life/tx/',
         kind: 'collateral', router: warp.collateral, token: '0x75edC9335175Fc0552D51D48439F229c10420fe3', symbol: 'USDT' },
  arb: { name: 'Arbitrum Sepolia', domain: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
         mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8', explorer: 'https://sepolia.arbiscan.io/tx/',
         kind: 'synthetic', router: warp.synthetic, token: warp.synthetic, symbol: 'botUSDT' },
  base: { name: 'Base Sepolia', domain: 84532, rpc: 'https://sepolia.base.org',
          mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039', explorer: 'https://sepolia.basescan.org/tx/',
          kind: 'synthetic', router: warp.base.synthetic, token: warp.base.synthetic, symbol: 'botUSDT' },
  arc: { name: 'Arc Testnet', domain: 5042002, rpc: 'https://rpc.testnet.arc.network',
         mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B', explorer: 'https://testnet.arcscan.app/tx/',
         kind: 'synthetic', router: warp.arc.synthetic, token: warp.arc.synthetic, symbol: 'botUSDT' },
};
const ERC20 = ['function approve(address,uint256) returns(bool)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)'];
const ROUTER = [
  'function transferRemote(uint32,bytes32,uint256) payable returns (bytes32)',
  'function quoteDispatch(uint32,bytes32,uint256) view returns (uint256)',
  'function routers(uint32) view returns (bytes32)',
];

(async () => {
  const S = CHAINS[FROM], D = CHAINS[TO];
  if (!S || !D) { console.error('unknown --from/--to (bot|arb|base)'); process.exit(2); }
  const pS = new ethers.JsonRpcProvider(S.rpc, undefined, { staticNetwork: true });
  const pD = new ethers.JsonRpcProvider(D.rpc, undefined, { staticNetwork: true });
  const wS = new ethers.Wallet(dep.privateKey, pS);
  const amount = ethers.parseUnits(AMOUNT, 6);

  const router = new ethers.Contract(S.router, ROUTER, wS);
  const token = new ethers.Contract(S.token, ERC20, wS);
  const enrolled = await router.routers(D.domain);
  if (enrolled === ethers.ZeroHash) { console.error(`${S.name} has no router enrolled for ${D.name} (domain ${D.domain})`); process.exit(3); }

  const before = { src: await token.balanceOf(dep.address), dst: await new ethers.Contract(D.token, ERC20, pD).balanceOf(RECIPIENT) };
  console.log(`${S.name} -> ${D.name} | ${AMOUNT} ${S.symbol} | wallet ${S.name}: ${ethers.formatUnits(before.src, 6)} | ${D.name} balance: ${ethers.formatUnits(before.dst, 6)}`);
  const gas = await pS.getFeeData();
  const bal = await pS.getBalance(dep.address);
  if (bal === 0n) { console.error(`no gas on ${S.name} for ${dep.address}`); process.exit(4); }

  if (S.kind === 'collateral') {
    const allowance = await token.allowance(dep.address, S.router);
    if (allowance < amount) {
      const ap = await token.approve(S.router, amount, { gasLimit: 120000n });
      await ap.wait();
      console.log(`approve: ${S.explorer}${ap.hash}`);
    }
  }

  let value = 0n;
  try {
    value = await router.quoteDispatch(D.domain, ethers.zeroPadValue(RECIPIENT, 32), amount);
    console.log(`IGP quote: ${ethers.formatEther(value)} ${S.kind === 'collateral' ? 'tBOT' : 'ETH'}`);
  } catch (e) { console.log('quoteDispatch unavailable, sending without value'); }

  const est = await router.transferRemote.estimateGas(D.domain, ethers.zeroPadValue(RECIPIENT, 32), amount, { value });
  const tx = await router.transferRemote(D.domain, ethers.zeroPadValue(RECIPIENT, 32), amount, { value, gasLimit: (est * 3n) / 2n });
  console.log(`transferRemote: ${S.explorer}${tx.hash}`);
  const rc = await tx.wait();
  console.log(`  status ${rc.status} gasUsed ${rc.gasUsed}`);

  // read the dispatched message id straight out of the source mailbox logs.
  // Hyperlane's DispatchId event has 4 topics (messageId, destination, sender) and the
  // message in data — same shape the relayer uses, so we decode it the same way instead of
  // relying on an ABI fragment that may not match the deployed core version.
  const coder = ethers.AbiCoder.defaultAbiCoder();
  let messageId = null;
  for (const log of rc.logs) {
    if (log.address.toLowerCase() !== S.mailbox.toLowerCase() || log.topics.length !== 4) continue;
    try {
      const message = coder.decode(['bytes'], log.data)[0];
      messageId = ethers.keccak256(message);
    } catch { /* not the dispatch log */ }
  }
  console.log(`messageId: ${messageId}`);

  const dMailbox = new ethers.Contract(D.mailbox, ['function delivered(bytes32) view returns (bool)'], pD);
  const dToken = new ethers.Contract(D.token, ERC20, pD);
  console.log('waiting for the relayer to deliver ...');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const nowDst = await dToken.balanceOf(RECIPIENT);
    const flag = messageId ? await dMailbox.delivered(messageId).catch(() => false) : false;
    if (nowDst >= before.dst + amount || flag) {
      const after = { src: await token.balanceOf(dep.address), dst: nowDst };
      console.log(`DELIVERED on ${D.name}${flag ? ' (mailbox.delivered = true)' : ' (destination balance updated)'}`);
      console.log(`  ${S.name} wallet: ${ethers.formatUnits(before.src, 6)} -> ${ethers.formatUnits(after.src, 6)} ${S.symbol}`);
      console.log(`  ${D.name} balance: ${ethers.formatUnits(before.dst, 6)} -> ${ethers.formatUnits(after.dst, 6)} ${D.symbol}`);
      return;
    }
  }
  console.error('NOT delivered within 4 minutes — check the relayer log');
  process.exit(5);
})();
