const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://rpc.bohr.life');
const D = '0x9d2B7AF30C1511828f0aea6146A8627739f9d65b';
const USDT = '0x75edC9335175Fc0552D51D48439F229c10420fe3';
const erc = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

(async () => {
  console.log('address:', D);
  console.log('native tBOT:', ethers.formatEther(await p.getBalance(D)));
  const bal = erc.decodeFunctionResult('balanceOf', await p.call({ to: USDT, data: erc.encodeFunctionData('balanceOf', [D]) }))[0];
  let dec = 18n;
  try { dec = erc.decodeFunctionResult('decimals', await p.call({ to: USDT, data: erc.encodeFunctionData('decimals') }))[0]; } catch (e) {}
  console.log(`USDT (${USDT}):`, ethers.formatUnits(bal, Number(dec)), '(decimals', dec.toString() + ')');
})();
