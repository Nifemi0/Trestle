const { ethers } = require('/root/copyentries/node_modules/ethers');
const TX = '0xd8130dd5e7c31919f2aafdcf4773af2f5e72c86fa3a0205d83875687f20d3043';
const p = new ethers.JsonRpcProvider('https://rpc.bohr.life', undefined, { staticNetwork: true });

(async () => {
  const rc = await p.getTransactionReceipt(TX);
  console.log('status:', rc.status, '| logs:', rc.logs.length);
  const known = {
    '0x5a4a7f8b7b5a4e1c3d0f3ff5f0c8e2e6d9b7b0f2b3c1d4e5f6a7b8c9d0e1f2a3': 'fake',
  };
  const mb = new ethers.Interface([
    'event Dispatch(bytes32 indexed messageId, uint32 indexed destination, bytes32 indexed recipient, bytes message)',
    'event DispatchId(bytes32 indexed messageId)',
  ]);
  for (const [i, log] of rc.logs.entries()) {
    let parsed = '';
    try { const x = mb.parseLog(log); if (x) parsed = x.name + ' ' + JSON.stringify(x.args).slice(0, 120); } catch (e) {}
    console.log(`\n[${i}] addr=${log.address}`);
    console.log(`    topic0=${log.topics[0]}`);
    console.log(`    topics=${log.topics.length} dataLen=${(log.data.length - 2) / 2} bytes${parsed ? '\n    parsed: ' + parsed : ''}`);
  }
})();
