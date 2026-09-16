const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://rpc.bohr.life');
const D = '0x9d2B7AF30C1511828f0aea6146A8627739f9d65b';

const DEPLOYED = {
  mailbox: '0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B',
  proxyAdmin: '0xaA9Bd5264cD7a3dD15486C3ACf2711e603Fe02C4',
  interchainAccountRouter: '0x3A9A15F398B7D6cBccCC31F78B3f82eA6037b19E',
  validatorAnnounce: '0x0096349c24b512AE2EE7fCdF27D49e98De8839C7',
  merkleTreeHook: '0x4A23Cc6587d1a2610D165ef3d3ca31231ADe04A1',
  staticMerkleRootMultisigIsmFactory: '0x045d2632c411a1394FeCb776A235431ecD0EB49D',
  domainRoutingIsmFactory: '0x32AE9a3a7aE66C2E9Bc276b2c2593eC1c87dE2eA',
  testRecipient: '0xd1094242e50A9419b334503806a1Ec94CA296Ec6',
};

const MAILBOX_ABI = [
  'function localDomain() view returns (uint32)',
  'function owner() view returns (address)',
  'function defaultIsm() view returns (address)',
  'function defaultHook() view returns (address)',
  'function requiredHook() view returns (address)',
  'function nonce() view returns (uint32)',
];

(async () => {
  console.log('=== Mailbox sanity check on BOT Chain testnet (968) ===');
  const c = new ethers.Contract(DEPLOYED.mailbox, MAILBOX_ABI, p);
  console.log('localDomain :', (await c.localDomain()).toString());
  console.log('owner       :', await c.owner());
  console.log('defaultIsm  :', await c.defaultIsm());
  console.log('defaultHook :', await c.defaultHook());
  console.log('requiredHook:', await c.requiredHook());
  console.log('nonce       :', (await c.nonce()).toString());

  console.log('\n=== code present for every deployed contract ===');
  for (const [name, addr] of Object.entries(DEPLOYED)) {
    const code = await p.getCode(addr);
    console.log(`  ${name.padEnd(34)} ${addr}  ${code.length > 3 ? 'LIVE (' + ((code.length - 2) / 2) + ' bytes)' : 'NO CODE'}`);
  }
  console.log('\nremaining tBOT:', ethers.formatEther(await p.getBalance(D)));
})();
