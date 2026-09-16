const fs = require('fs');
const { ethers } = require('ethers');
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_artifacts.json', 'utf8'));
const dep = JSON.parse(fs.readFileSync('/root/botchain-bridge/deployer.json', 'utf8'));
const warp = JSON.parse(fs.readFileSync('/root/botchain-bridge/contracts/warp_deployments.json', 'utf8'));

const botP = new ethers.JsonRpcProvider('https://rpc.bohr.life', undefined, { staticNetwork: true });
const arbP = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc', undefined, { staticNetwork: true });

(async () => {
  const usdt = new ethers.Contract('0x75edC9335175Fc0552D51D48439F229c10420fe3',
    ['function balanceOf(address) view returns (uint256)'], botP);
  const synth = new ethers.Contract(warp.synthetic, art.HypERC20.abi, arbP);

  console.log('deployer  :', dep.address);
  console.log('collateral:', warp.collateral, '(BOT testnet)');
  console.log('synthetic :', warp.synthetic, '(Arbitrum Sepolia)');
  console.log('');
  console.log('USDT  wallet          :', ethers.formatUnits(await usdt.balanceOf(dep.address), 6));
  console.log('USDT  held by vault   :', ethers.formatUnits(await usdt.balanceOf(warp.collateral), 6));
  console.log('botUSDT wallet        :', ethers.formatUnits(await synth.balanceOf(dep.address), 6));
  console.log('botUSDT total supply  :', ethers.formatUnits(await synth.totalSupply(), 6));
  console.log('');
  console.log('accounting check -> wallet + vault:', ethers.formatUnits((await usdt.balanceOf(dep.address)) + (await usdt.balanceOf(warp.collateral)), 6));
})();
