// Final state of the BOT Chain testnet <-> Arbitrum Sepolia USDT warp route.
const fs = require('fs');
const { ethers } = require('/root/copyentries/node_modules/ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_deployments.json', 'utf8'));

const BOT = { rpc: 'https://rpc.bohr.life', mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
              usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3', domain: 968 };
const ARB = { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', mailbox: '0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8', domain: 421614 };

(async () => {
  const botP = new ethers.JsonRpcProvider(BOT.rpc, undefined, { staticNetwork: true });
  const arbP = new ethers.JsonRpcProvider(ARB.rpc, undefined, { staticNetwork: true });

  const usdt = new ethers.Contract(BOT.usdt, ['function balanceOf(address) view returns (uint256)'], botP);
  const collateral = new ethers.Contract(warp.collateral, ['function balanceOf(address) view returns (uint256)',
    'function routers(uint32) view returns (bytes32)'], botP);
  const synthetic = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbP);
  const arbMailbox = new ethers.Contract(ARB.mailbox, ['function delivered(bytes32) view returns (bool)'], arbP);

  const t = JSON.parse(fs.readFileSync('/root/botchain-bridge/last_transfer.json', 'utf8'));

  console.log('===== WARP ROUTE STATE =====');
  console.log('deployer                 :', dep.address);
  console.log('');
  console.log('BOT Chain testnet (968)');
  console.log('  USDT in wallet         :', ethers.formatUnits(await usdt.balanceOf(dep.address), 6));
  console.log('  USDT LOCKED in vault   :', ethers.formatUnits(await usdt.balanceOf(warp.collateral), 6));
  console.log('  remote router enrolled :', await collateral.routers(ARB.domain));
  console.log('');
  console.log('Arbitrum Sepolia (421614)');
  console.log('  botUSDT (synthetic)    :', ethers.formatUnits(await synthetic.balanceOf(dep.address), 6));
  console.log('  total synthetic supply :', ethers.formatUnits(await synthetic.totalSupply(), 6));
  console.log('  remote router enrolled :', await synthetic.routers(BOT.domain));
  console.log('');
  console.log('message 1 delivered      :', await arbMailbox.delivered(ethers.keccak256(t.message)));
  console.log('');
  console.log('===== EXPLORER TX HASHES =====');
  console.log('BOT  deploy collateral   : https://scan.bohr.life/tx/0x6039a23db299d0bb883a143c04a50a03cd959f3bddabf7f705f6bd15266680e0');
  console.log('Arb  deploy synthetic    : https://sepolia.arbiscan.io/tx/0x854179aa050414f54d137fe0208c55235d8f5b916338446c498d45e61a45d9b3');
  console.log('BOT  transferRemote 100  : https://scan.bohr.life/tx/0xd8130dd5e7c31919f2aafdcf4773af2f5e72c86fa3a0205d83875687f20d3043');
  console.log('Arb  relay/process       : https://sepolia.arbiscan.io/tx/0x80c25dffe561fb5ac1a5c32c6fcdb3504379aa236dbfdf3dffc4fb6fd35f43ed');
  console.log('Arb  transferRemote 40   : https://sepolia.arbiscan.io/tx/0x56d2d227424b262aefe970e697fa7b0fb2b1fbd6b722c348a908b346a45fe4de');
  console.log('BOT  relay/process       : https://scan.bohr.life/tx/0x69e400d5d66ec3a0e9043405b55a0e1889b4158a500dd345299dcefdd22ff95d');
})();
