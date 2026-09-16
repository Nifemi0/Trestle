// Local accounting pressure model for the 4-chain collateral/synthetic bridge.
// No RPC, no real txs. It stress-tests invariant logic under random route pressure.
// Model: BOT is collateral. Arb/Base/Arc are synthetic legs. Moving from BOT locks collateral + mints synth.
// Moving synth->BOT burns synth + unlocks. Moving synth->synth burns source + mints destination.

const CASES = Number(process.argv.find(a => a.startsWith('--cases='))?.split('=')[1] || 1_000_000);
const SEED = Number(process.argv.find(a => a.startsWith('--seed='))?.split('=')[1] || 0xacc017);
function mulberry32(a) { return function() { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
const rnd = mulberry32(SEED >>> 0);
const randInt = n => Math.floor(rnd() * n);
const chains = ['bot','arb','base','arc'];
const synths = ['arb','base','arc'];
const routes = [];
for (const a of chains) for (const b of chains) if (a !== b) routes.push([a,b]);
let walletBot = 1_000_000_000_000n; // 1,000,000 USDT in 6 decimals simulated user float
let locked = 0n;
const supply = { arb: 0n, base: 0n, arc: 0n };
let skippedNoBalance = 0;
const routeCounts = Object.fromEntries(routes.map(([a,b]) => [`${a}->${b}`,0]));
const failures = [];
function totalSynth() { return supply.arb + supply.base + supply.arc; }
function check(i, route) {
  if (locked !== totalSynth()) failures.push({ i, route, locked: locked.toString(), totalSynth: totalSynth().toString(), supply: {...supply} });
  if (locked < 0n || walletBot < 0n || synths.some(k => supply[k] < 0n)) failures.push({ i, route, negative: true });
}
const start = process.hrtime.bigint();
for (let i=0;i<CASES;i++) {
  const [from,to] = routes[randInt(routes.length)];
  const route = `${from}->${to}`;
  const amount = BigInt(1 + randInt(10_000_000)); // up to 10 USDT each in 6 decimals
  if (from === 'bot') {
    if (walletBot < amount) { skippedNoBalance++; continue; }
    walletBot -= amount; locked += amount; supply[to] += amount;
  } else if (to === 'bot') {
    if (supply[from] < amount) { skippedNoBalance++; continue; }
    supply[from] -= amount; locked -= amount; walletBot += amount;
  } else {
    if (supply[from] < amount) { skippedNoBalance++; continue; }
    supply[from] -= amount; supply[to] += amount;
  }
  routeCounts[route]++;
  if ((i & 0x3fff) === 0) check(i, route);
}
check(CASES, 'final');
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
const result = {
  seed: SEED >>> 0,
  cases: CASES,
  executed: Object.values(routeCounts).reduce((a,b)=>a+b,0),
  skippedNoBalance,
  locked: locked.toString(),
  totalSynth: totalSynth().toString(),
  supply: Object.fromEntries(Object.entries(supply).map(([k,v]) => [k, v.toString()])),
  routeCounts,
  elapsedMs: Math.round(elapsedMs),
  casesPerSecond: Math.round(CASES/(elapsedMs/1000)),
  failures: failures.slice(0,10),
  pass: failures.length === 0 && locked === totalSynth(),
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
