const { ethers } = require('ethers');
const fs = require('fs');

// Deployer for the BOT Chain testnet Hyperlane deployment. Testnet gas only.
const w = ethers.Wallet.createRandom();
const out = [
  'BOT CHAIN TESTNET DEPLOYER — Hyperlane core deployment. Testnet gas only.',
  'Faucet: https://faucet.botchain.ai/basic (10 tBOT / 24h). Never use for real funds.',
  '',
  'address:    ' + w.address,
  'privateKey: ' + w.privateKey,
  'mnemonic:   ' + w.mnemonic.phrase,
  '',
].join('\n') + '\n';

fs.writeFileSync('/root/botchain-bridge/deployer.key', out, { mode: 0o600 });
fs.chmodSync('/root/botchain-bridge/deployer.key', 0o600);
fs.writeFileSync('/root/botchain-bridge/deployer.json', JSON.stringify({
  address: w.address, privateKey: w.privateKey, mnemonic: w.mnemonic.phrase,
}, null, 2), { mode: 0o600 });
fs.chmodSync('/root/botchain-bridge/deployer.json', 0o600);

console.log('DEPLOYER ADDRESS:', w.address);
