// Stage 3: reverse direction — Arbitrum Sepolia -> BOT Chain testnet (burn on Arb, release on BOT).
const fs = require('fs');
const { ethers } = require('/root/copyentries/node_modules/ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_deployments.json', 'utf8'));

const BOT = { rpc: 'https://rpc.bohr.life', mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
              usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3', domain: 968, explorer: 'https://scan.bohr.life/tx/' };
const ARB = { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8',
              domain: 421614, explorer: 'https://sepolia.arbiscan.io/tx/' };
const AMOUNT = 40n * 10n ** 6n; // send 40 of the 100 back

const MAILBOX_ABI = ['function process(bytes _metadata, bytes _message) payable', 'function delivered(bytes32) view returns (bool)'];

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const botW = new ethers.Wallet(dep.privateKey, botP);
  const arbW = new ethers.Wallet(dep.privateKey, arbP);
  const b32 = (a) => ethers.zeroPadValue(a, 32);

  const synthetic = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbW);
  const botUsdt = new ethers.Contract(BOT.usdt, ['function balanceOf(address) view returns (uint256)'], botP);
  const arbMailbox = new ethers.Contract(ARB.mailbox, MAILBOX_ABI, arbP);
  const botMailbox = new ethers.Contract(BOT.mailbox, MAILBOX_ABI, botW);

  const u0 = (await botUsdt.balanceOf(dep.address));
  const s0 = (await synthetic.balanceOf(dep.address));
  console.log('start  | USDT on BOT:', ethers.formatUnits(u0, 6), '| botUSDT on Arb:', ethers.formatUnits(s0, 6));

  console.log('\n1) transferRemote(Arb -> BOT, 40 botUSDT) — synthetic burns on Arb ...');
  let tx = await synthetic.transferRemote(BOT.domain, b32(dep.address), AMOUNT);
  let rc = await tx.wait();
  console.log('   ', ARB.explorer + tx.hash);

  const coder = ethers.AbiCoder.defaultAbiCoder();
  const mbLog = rc.logs.find((l) => l.address.toLowerCase() === ARB.mailbox.toLowerCase() && l.topics.length === 4);
  if (!mbLog) throw new Error('no dispatch log on Arb');
  const message = coder.decode(['bytes'], mbLog.data)[0];
  const messageId = mbLog.topics[1];
  console.log('   messageId:', messageId, '| bytes:', (message.length - 2) / 2);

  console.log('\n2) relay: Mailbox.process() on BOT Chain testnet ...');
  tx = await botMailbox.process('0x', message);
  await tx.wait();
  console.log('   ', BOT.explorer + tx.hash);
  console.log('   delivered:', await botMailbox.delivered(messageId));

  const u1 = (await botUsdt.balanceOf(dep.address));
  const s1 = (await synthetic.balanceOf(dep.address));
  console.log('\n=== RESULT ===');
  console.log('USDT on BOT:    ', ethers.formatUnits(u0, 6), '->', ethers.formatUnits(u1, 6), ` (${u1 - u0 >= 0n ? '+' : ''}${ethers.formatUnits(u1 - u0, 6)})`);
  console.log('botUSDT on Arb: ', ethers.formatUnits(s0, 6), '->', ethers.formatUnits(s1, 6), ` (${ethers.formatUnits(s1 - s0, 6)})`);
  fs.writeFileSync('/root/botchain-bridge/last_transfer_reverse.json', JSON.stringify({ messageId, arbTx: tx.hash }, null, 2));
})();
