// Compile Hyperlane's own warp-route contracts (HypERC20 = synthetic, HypERC20Collateral = collateral)
// straight from the vendored sources in @hyperlane-xyz/core, so we deploy the audited
// contracts rather than hand-rolled ones.
const fs = require('fs');
const path = require('path');

const CORE = '/root/botchain-bridge/node_modules/@hyperlane-xyz/core';
const OZ = path.join(CORE, 'dependencies/@openzeppelin-contracts-4.9.3');

const TARGETS = [
  'contracts/token/HypERC20.sol',
  'contracts/token/HypERC20Collateral.sol',
];

async function main() {
  const solc = require('/root/botchain-bridge/node_modules/solc');
  const input = { language: 'Solidity', sources: {}, settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    remappings: [
      `@openzeppelin/contracts/=${OZ}/contracts/`,
      `@openzeppelin/contracts-upgradeable/=${CORE}/dependencies/@openzeppelin-contracts-upgradeable-4.9.3/contracts/`,
      '@hyperlane-xyz/core/=' + CORE + '/',
    ],
  }};

  for (const t of TARGETS) {
    input.sources[t] = { content: fs.readFileSync(path.join(CORE, t), 'utf8') };
  }

  const findImports = (p) => {
    // solc hands back absolute paths once remappings are applied — read those directly.
    const direct = path.isAbsolute(p) ? p : null;
    const candidates = direct ? [direct] : [CORE, OZ, path.join(CORE, 'dependencies')].map((b) => path.join(b, p));
    for (const f of candidates) {
      if (fs.existsSync(f)) return { contents: fs.readFileSync(f, 'utf8') };
    }
    return { error: 'not found: ' + p };
  };

  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) {
    console.log('COMPILE ERRORS:', errs.length);
    errs.slice(0, 12).forEach(e => console.log(' -', (e.formattedMessage || e.message).split('\n').slice(0, 4).join(' | ')));
    return;
  }
  console.log('compiled clean.');
  const save = {};
  for (const [file, contracts] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(contracts)) {
      if (['HypERC20', 'HypERC20Collateral'].includes(name)) {
        save[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
        console.log(`${name}: abi=${c.abi.length} entries, bytecode=${c.evm.bytecode.object.length / 2} bytes`);
      }
    }
  }
  fs.writeFileSync('/root/botchain-bridge/warp_artifacts.json', JSON.stringify(save));
  console.log('saved -> /root/botchain-bridge/warp_artifacts.json');
}
main();
