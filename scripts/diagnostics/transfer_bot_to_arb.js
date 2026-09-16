// Stage 2: live transfer BOT testnet -> Arbitrum Sepolia, relay the Hyperlane message, verify.
const fs = require('fs');
const { ethers } = require('ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_deployments.json', 'utf8'));

const BOT = { rpc: 'https://rpc.bohr.life', mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
              usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3', domain: 968, explorer: 'https://scan.bohr.life/tx/' };
const ARB = { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8',
              domain: 421614, explorer: 'https://sepolia.arbiscan.io/tx/' };

const AMOUNT = 100n * 10n ** 6n; // 100 USDT

const MAILBOX_ABI = [
  'event Dispatch(bytes32 indexed messageId, uint32 indexed destination, bytes32 indexed recipient, bytes message)',
  'function process(bytes _metadata, bytes _message) payable',
  'function delivered(bytes32) view returns (bool)',
];

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });
  const botW = new ethers.Wallet(dep.privateKey, botP);
  const arbW = new ethers.Wallet(dep.privateKey, arbP);
  const b32 = (a) => ethers.zeroPadValue(a, 32);

  const usdt = new ethers.Contract(BOT.usdt, ['function approve(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)'], botW);
  const collateral = new ethers.Contract(warp.collateral, art.HypERC20Collateral.abi, botW);
  const synthetic = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbW);
  const botMailbox = new ethers.Contract(BOT.mailbox, MAILBOX_ABI, botP);
  const arbMailbox = new ethers.Contract(ARB.mailbox, MAILBOX_ABI, arbW);

  console.log('deployer:', dep.address);
  console.log('USDT on BOT before:', ethers.formatUnits(await usdt.balanceOf(dep.address), 6));
  console.log('botUSDT on Arb before:', ethers.formatUnits(await synthetic.balanceOf(dep.address), 6));

  console.log('\n1) approve collateral to pull 100 USDT ...');
  let tx = await usdt.approve(warp.collateral, AMOUNT);
  await tx.wait();
  console.log('   ', BOT.explorer + tx.hash);

  console.log('\n2) transferRemote(BOT -> Arbitrum Sepolia, 100 USDT) ...');
  tx = await collateral.transferRemote(ARB.domain, b32(dep.address), AMOUNT);
  const rc = await tx.wait();
  console.log('   ', BOT.explorer + tx.hash);

  // pull the dispatched message out of the receipt
  let message = null, messageId = null;
  for (const log of rc.logs) {
    try {
      const p = botMailbox.interface.parseLog(log);
      if (p && p.name === 'Dispatch') { message = p.args.message; messageId = p.args.messageId; }
    } catch (e) {}
  }
  if (!message) throw new Error('no Dispatch event found in the transfer receipt');
  console.log('   messageId:', messageId);
  console.log('   message bytes:', message.length, 'chars');

  const beforeArb = await synthetic.balanceOf(dep.address);

  console.log('\n3) relay: Mailbox.process() on Arbitrum Sepolia (we are the trusted relayer) ...');
  tx = await arbMailbox.process('0x', message);
  await tx.wait();
  console.log('   ', ARB.explorer + tx.hash);
  console.log('   delivered flag:', await arbMailbox.delivered(messageId));

  const afterArb = await synthetic.balanceOf(dep.address);
  console.log('\n=== RESULT ===');
  console.log('USDT on BOT after:      ', ethers.formatUnits(await usdt.balanceOf(dep.address), 6));
  console.log('botUSDT on Arb before:  ', ethers.formatUnits(beforeArb, 6));
  console.log('botUSDT on Arb after:   ', ethers.formatUnits(afterArb, 6));
  console.log('delta on Arbitrum:      ', ethers.formatUnits(afterArb - beforeArb, 6));
  fs.writeFileSync('/root/botchain-bridge/state/last_transfer.json', JSON.stringify({ messageId, message, hash: tx.hash }, null, 2));
})();
