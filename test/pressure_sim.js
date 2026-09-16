const { ethers } = require('ethers');
const { CHAINS, dispatchFromLog, b32 } = require('../src/relayer.js');

const CASES = Number(process.argv.find(a => a.startsWith('--cases='))?.split('=')[1] || 1_000_000);
const SEED = Number(process.argv.find(a => a.startsWith('--seed='))?.split('=')[1] || 0x71e57e1);
const coder = ethers.AbiCoder.defaultAbiCoder();

// Fast deterministic PRNG (Mulberry32) so failures are reproducible.
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
const rnd = mulberry32(SEED >>> 0);
const randInt = (n) => Math.floor(rnd() * n);
const keys = Object.keys(CHAINS).filter(k => CHAINS[k].router);
const routes = [];
for (const a of keys) for (const b of keys) if (a !== b) routes.push([a, b]);

function randHex(bytes) {
  let out = '0x';
  for (let i = 0; i < bytes; i++) out += randInt(256).toString(16).padStart(2, '0');
  return out;
}
function randAddress() { return randHex(20); }
function u32(n) { return Number(n >>> 0).toString(16).padStart(8, '0'); }
function msg({ origin, sender, destination, recipient, body = '0x1234' }) {
  return '0x' + '01' + u32(randInt(0xffffffff)) + u32(origin) + b32(sender).slice(2) + u32(destination) + b32(recipient).slice(2) + body.replace(/^0x/, '');
}
function logFor(source, destination, message, overrides = {}) {
  return {
    address: overrides.address || source.mailbox,
    topics: overrides.topics || [randHex(32), randHex(32), '0x' + destination.domain.toString(16).padStart(64, '0'), randHex(32)],
    data: overrides.data !== undefined ? overrides.data : coder.encode(['bytes'], [message]),
    blockNumber: overrides.blockNumber ?? randInt(20_000_000),
    transactionHash: overrides.transactionHash || randHex(32),
    index: overrides.index ?? randInt(64),
  };
}
function chooseRoute() {
  const [s, d] = routes[randInt(routes.length)];
  return [s, d, CHAINS[s], CHAINS[d]];
}

const counters = {
  cases: 0,
  expectedAccept: 0,
  accepted: 0,
  falsePositive: 0,
  falseNegative: 0,
  malformedRejected: 0,
  forgedEventOnlyRejected: 0,
  wrongSenderRejected: 0,
  wrongRecipientRejected: 0,
  wrongOriginRejected: 0,
  wrongDestinationRejected: 0,
  wrongMailboxRejected: 0,
  wrongTopicsRejected: 0,
};
const failureSamples = [];
const routeAccepted = Object.fromEntries(routes.map(([s,d]) => [`${s}->${d}`, 0]));
const start = process.hrtime.bigint();
const memStart = process.memoryUsage().rss;

for (let i = 0; i < CASES; i++) {
  const [sKey, dKey, source, destination] = chooseRoute();
  const bucket = randInt(100);
  let expected = false;
  let log;
  let category = 'unknown';

  if (bucket < 5) { // valid Trestle route message
    category = 'valid';
    expected = true;
    const m = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: destination.router, body: randHex(randInt(64)) });
    log = logFor(source, destination, m);
  } else if (bucket < 20) { // forged event destination topic but random sender
    category = 'wrongSender';
    const m = msg({ origin: source.domain, sender: randAddress(), destination: destination.domain, recipient: destination.router });
    log = logFor(source, destination, m);
  } else if (bucket < 35) {
    category = 'wrongRecipient';
    const m = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: randAddress() });
    log = logFor(source, destination, m);
  } else if (bucket < 50) {
    category = 'wrongOrigin';
    const m = msg({ origin: source.domain + 1 + randInt(10_000), sender: source.router, destination: destination.domain, recipient: destination.router });
    log = logFor(source, destination, m);
  } else if (bucket < 65) {
    category = 'wrongDestination';
    const m = msg({ origin: source.domain, sender: source.router, destination: destination.domain + 1 + randInt(10_000), recipient: destination.router });
    log = logFor(source, destination, m);
  } else if (bucket < 78) {
    category = 'wrongMailbox';
    const m = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: destination.router });
    log = logFor(source, destination, m, { address: randAddress() });
  } else if (bucket < 88) {
    category = 'wrongTopics';
    const m = msg({ origin: source.domain, sender: source.router, destination: destination.domain, recipient: destination.router });
    log = logFor(source, destination, m, { topics: [randHex(32), randHex(32)] });
  } else if (bucket < 95) {
    category = 'forgedEventOnly';
    // Event says correct destination, but message body says random route. This is the old bug class.
    const other = CHAINS[keys[randInt(keys.length)]];
    const m = msg({ origin: other.domain, sender: randAddress(), destination: destination.domain, recipient: destination.router });
    log = logFor(source, destination, m);
  } else {
    category = 'malformed';
    log = logFor(source, destination, '0x', { data: randInt(2) ? randHex(randInt(90)) : '0xdeadbeef' });
  }

  let item = null;
  try { item = dispatchFromLog(log, source, destination); } catch (err) {
    failureSamples.push({ i, category, thrown: err.message });
    counters.falsePositive++;
    continue;
  }
  const accepted = !!item;
  counters.cases++;
  if (expected) counters.expectedAccept++;
  if (accepted) counters.accepted++;
  if (accepted && expected) routeAccepted[`${sKey}->${dKey}`]++;
  if (accepted !== expected) {
    if (accepted) counters.falsePositive++; else counters.falseNegative++;
    if (failureSamples.length < 10) failureSamples.push({ i, category, expected, accepted, route: `${sKey}->${dKey}`, item });
  }
  if (!expected && !accepted) {
    if (category === 'malformed') counters.malformedRejected++;
    if (category === 'forgedEventOnly') counters.forgedEventOnlyRejected++;
    if (category === 'wrongSender') counters.wrongSenderRejected++;
    if (category === 'wrongRecipient') counters.wrongRecipientRejected++;
    if (category === 'wrongOrigin') counters.wrongOriginRejected++;
    if (category === 'wrongDestination') counters.wrongDestinationRejected++;
    if (category === 'wrongMailbox') counters.wrongMailboxRejected++;
    if (category === 'wrongTopics') counters.wrongTopicsRejected++;
  }
}

const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
const memEnd = process.memoryUsage().rss;
const minRouteAccepted = Math.min(...Object.values(routeAccepted));
const maxRouteAccepted = Math.max(...Object.values(routeAccepted));
const result = {
  seed: SEED >>> 0,
  routes: routes.length,
  counters,
  routeAccepted,
  minRouteAccepted,
  maxRouteAccepted,
  elapsedMs: Math.round(elapsedMs),
  casesPerSecond: Math.round(CASES / (elapsedMs / 1000)),
  rssDeltaMB: Number(((memEnd - memStart) / 1024 / 1024).toFixed(2)),
  failureSamples,
  pass: counters.cases === CASES && counters.falsePositive === 0 && counters.falseNegative === 0 && counters.accepted === counters.expectedAccept && minRouteAccepted > 0,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
