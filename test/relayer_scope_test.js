const { ethers } = require('ethers');
const { CHAINS, dispatchFromLog, b32 } = require('../src/relayer.js');
const coder = ethers.AbiCoder.defaultAbiCoder();

function u32(n) { return Number(n).toString(16).padStart(8, '0'); }
function msg({ origin, sender, destination, recipient, body = '0x1234' }) {
  return '0x' + '01' + '00000001' + u32(origin) + b32(sender).slice(2) + u32(destination) + b32(recipient).slice(2) + body.replace(/^0x/, '');
}
function logFor(source, destination, message) {
  return {
    address: source.mailbox,
    topics: ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + destination.domain.toString(16).padStart(64, '0'), '0x' + '33'.repeat(32)],
    data: coder.encode(['bytes'], [message]),
    blockNumber: 1,
    transactionHash: '0x' + '44'.repeat(32),
    index: 0
  };
}
let fails = 0;
function check(name, cond, detail = '') { console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`); if (!cond) fails++; }
const source = CHAINS.bot;
const destination = CHAINS.arb;
const valid = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: destination.router });
check('accepts Trestle router -> router message', !!dispatchFromLog(logFor(source, destination, valid), source, destination));
const wrongSender = msg({ origin: source.domain, sender: ethers.Wallet.createRandom().address, destination: destination.domain, recipient: destination.router });
check('rejects same-domain message from non-router sender', !dispatchFromLog(logFor(source, destination, wrongSender), source, destination));
const wrongRecipient = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: ethers.Wallet.createRandom().address });
check('rejects same-domain message to non-router recipient', !dispatchFromLog(logFor(source, destination, wrongRecipient), source, destination));
const wrongOrigin = msg({ origin: 999999, sender: source.router, destination: destination.domain, recipient: destination.router });
check('rejects message with mismatched origin in body', !dispatchFromLog(logFor(source, destination, wrongOrigin), source, destination));
console.log(fails === 0 ? '\nRELAYER SCOPE CHECKS PASSED' : `\n${fails} RELAYER SCOPE CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
