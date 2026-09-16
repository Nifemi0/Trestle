const fs = require('fs');
const path = require('path');
const CORE = '/root/botchain-bridge/node_modules/@hyperlane-xyz/core';
const OZ = path.join(CORE, 'dependencies/@openzeppelin-contracts-4.9.3');

// existing artifacts
const art = JSON.parse(fs.readFileSync('/root/botchain-bridge/warp_artifacts.json', 'utf8'));
for (const [n, a] of Object.entries(art)) {
  const ctor = a.abi.find((x) => x.type === 'constructor');
  console.log(`${n} constructor:`, ctor ? JSON.stringify(ctor.inputs) : '(none)');
}

// find the ISM source
const cands = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/TrustedRelayer.*\.sol$/.test(f.name)) cands.push(p);
  }
})(path.join(CORE, 'contracts'));
console.log('\nISM sources found:', cands.map((c) => c.replace(CORE + '/', '')));

(async () => {
  const solc = require('/root/botchain-bridge/node_modules/solc');
  const rel = cands.map((c) => c.replace(CORE + '/', ''));
  const input = { language: 'Solidity', sources: {}, settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    remappings: [
      `@openzeppelin/contracts/=${OZ}/contracts/`,
      `@openzeppelin/contracts-upgradeable/=${CORE}/dependencies/@openzeppelin-contracts-upgradeable-4.9.3/contracts/`,
      '@hyperlane-xyz/core/=' + CORE + '/',
    ] } };
  for (const r of rel) input.sources[r] = { content: fs.readFileSync(path.join(CORE, r), 'utf8') };
  const findImports = (p) => {
    const c = path.isAbsolute(p) ? [p] : [CORE, OZ, path.join(CORE, 'dependencies')].map((b) => path.join(b, p));
    for (const f of c) if (fs.existsSync(f)) return { contents: fs.readFileSync(f, 'utf8') };
    return { error: 'nf ' + p };
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) { errs.slice(0, 6).forEach((e) => console.log('ERR', (e.formattedMessage || '').split('\n')[0])); return; }
  for (const [, cs] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(cs)) {
      if (/^TrustedRelayer/.test(name)) {
        art[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
        const ctor = c.abi.find((x) => x.type === 'constructor');
        console.log(`\n${name} constructor:`, ctor ? JSON.stringify(ctor.inputs) : '(none)');
        console.log(`${name} abi=${c.abi.length} bytecode=${c.evm.bytecode.object.length / 2}b`);
      }
    }
  }
  fs.writeFileSync('/root/botchain-bridge/warp_artifacts.json', JSON.stringify(art));
  console.log('\nartifacts now:', Object.keys(art).join(', '));
})();
