// Relay the already-dispatched message from the BOT->Arb transfer, then verify balances.
const fs = require('fs');
const { ethers } = require('/root/copyentries/node_modules/ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_deployments.json', 'utf8'));

const TX = '0xd8130dd5e7c31919f2aafdcf4773af2f5e72c86fa3a0205d83875687f20d3043';
const BOT = { rpc: 'https://rpc.bohr.life', mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
              usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3', explorer: 'https://scan.bohr.life/tx/' };
const ARB = { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8',
              explorer: 'https://sepolia.arbiscan.io/tx/' };

const MAILBOX_ABI = [
  'function process(bytes _metadata, bytes _message) payable',
  'function delivered(bytes32) view returns (bool)',
];

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const arbW = new ethers.Wallet(dep.privateKey, arbP);
  const arbMailbox = new ethers.Contract(ARB.mailbox, MAILBOX_ABI, arbW);
  const synthetic = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbW);
  const botUsdt = new ethers.Contract(BOT.usdt, ['function balanceOf(address) view returns (uint256)'], botP);

  const rc = await botP.getTransactionReceipt(TX);
  // Mailbox Dispatch: 4 topics, message bytes in data
  const mbLog = rc.logs.find((l) => l.address.toLowerCase() === BOT.mailbox.toLowerCase() && l.topics.length === 4);
  if (!mbLog) throw new Error('mailbox dispatch log not found');
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const message = coder.decode(['bytes'], mbLog.data)[0];
  const messageId = mbLog.topics[1];
  const destination = parseInt(mbLog.topics[2], 16);

  console.log('dispatch tx   :', BOT.explorer + TX);
  console.log('messageId     :', messageId);
  console.log('destination   :', destination, '(Arbitrum Sepolia = 421614)');
  console.log('message bytes :', (message.length - 2) / 2);

  const before = await synthetic.balanceOf(dep.address);
  console.log('\nbotUSDT on Arb before relay:', ethers.formatUnits(before, 6));

  console.log('\nrelaying via Mailbox.process() on Arbitrum Sepolia ...');
  const tx = await arbMailbox.process('0x', message);
  await tx.wait();
  console.log('  ', ARB.explorer + tx.hash);
  console.log('  delivered():', await arbMailbox.delivered(messageId));

  const after = await synthetic.balanceOf(dep.address);
  console.log('\n=== RESULT ===');
  console.log('USDT still on BOT  :', ethers.formatUnits(await botUsdt.balanceOf(dep.address), 6), '(was 1000, 100 locked)');
  console.log('botUSDT on Arb     :', ethers.formatUnits(before, 6), '->', ethers.formatUnits(after, 6));
  console.log('delta              :', ethers.formatUnits(after - before, 6));
  fs.writeFileSync('/root/botchain-bridge/state/last_transfer.json', JSON.stringify({ messageId, message, relayTx: tx.hash, sourceTx: TX }, null, 2));
})();
