const { ethers } = require('/root/copyentries/node_modules/ethers');
const D = '0x9d2B7AF30C1511828f0aea6146A8627739f9d65b';

const CHAINS = [
  ['BOT Chain testnet      (968)',    'https://rpc.bohr.life'],
  ['Arbitrum Sepolia      (421614)', 'https://sepolia-rollup.arbitrum.io/rpc'],
  ['Base Sepolia          (84532)',  'https://sepolia.base.org'],
  ['OP Sepolia            (11155420)', 'https://sepolia.optimism.io'],
  ['BSC testnet           (97)',     'https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
  ['Polygon Amoy          (80002)',  'https://rpc-amoy.polygon.technology'],
  ['Linea Sepolia         (59141)',  'https://rpc.sepolia.linea.build'],
];

(async () => {
  for (const [label, url] of CHAINS) {
    try {
      const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
      const b = await p.getBalance(D);
      const has = b > 0n ? '  <-- HAS GAS' : '';
      console.log(`${label}  ${ethers.formatEther(b)}${has}`);
    } catch (e) {
      console.log(`${label}  probe failed: ${(e.shortMessage || e.message).slice(0, 60)}`);
    }
  }
})();
