const fs = require('fs');
const s = fs.readFileSync('/root/botchain-bridge/node_modules/@hyperlane-xyz/cli/bundle/index.js', 'utf8');

function ctx(needle, before = 200, after = 900, max = 3) {
  console.log('\n' + '='.repeat(20), needle, '='.repeat(20));
  let i = -1, n = 0;
  while ((i = s.indexOf(needle, i + 1)) !== -1 && n < max) {
    console.log(s.slice(Math.max(0, i - before), i + after).replace(/\n\s*\n/g, '\n'));
    console.log('---');
    n++;
  }
  if (n === 0) console.log('not found');
}

ctx('No warp route found with ID', 900, 100);
ctx('warp_routes', 300, 600, 4);
