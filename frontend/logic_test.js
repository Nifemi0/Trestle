// Headless logic test for frontend/app.js — no browser needed.
// Stubs window/document/ethers and asserts the 4-chain routing logic behaves.
const fs = require('fs');
const vm = require('vm');

const ids = ['connect','notice','balance','destination-balance','transfer-status','activity-list',
  'from-select','to-select','from-icon','from-name','from-domain','from-network','to-icon','to-name',
  'to-domain','to-network','amount','amount-symbol','source-balance-label','destination-balance-label',
  'route-count','flip-route','refresh'];
const els = {};
const handlers = {};
const mkEl = (id) => ({
  id, textContent: '', innerHTML: '', className: '', hidden: false, disabled: false, value: '1.00',
  style: {}, onclick: null,
  addEventListener(ev, fn) { handlers[`${id}:${ev}`] = fn; },
});
for (const id of ids) els[id] = mkEl(id);

// ethers stub: only what app.js touches at load time
const ethers = {
  JsonRpcProvider: function () { return {}; },
  BrowserProvider: function () { return {}; },
  Contract: function () { return {}; },
  formatUnits: (v) => String(v),
  parseUnits: (v) => BigInt(Math.round(Number(v) * 1e6)),
  zeroPadValue: (a) => a,
};
const window = { ethers };            // no window.ethereum -> wallet paths stay dormant
const document = { getElementById: (id) => els[id] || mkEl(id) };
const localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
let fetched = 0;
const fetch = async () => { fetched++; return { json: async () => ({ recent: [] }) }; };
const sandbox = { window, document, localStorage, fetch, console, setTimeout: () => {}, Promise, BigInt, JSON, Number, Math, Date, String, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('/root/botchain-bridge/frontend/config.js', 'utf8'), sandbox, { filename: 'config.js' });
vm.runInContext(fs.readFileSync('/root/botchain-bridge/frontend/app.js', 'utf8'), sandbox, { filename: 'app.js' });

const api = window.__trestle;
let fails = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!cond) fails++;
};

check('CONFIG has 4 chains', Object.keys(api.CONFIG).length === 4, Object.keys(api.CONFIG).join(','));
check('every chain has domain+router+token+chainId', Object.values(api.CONFIG).every((c) => c.domain && c.router && c.token && c.chainId && c.rpc && c.explorer));
check('default route is bot -> arb', api.getRoute().from === 'bot' && api.getRoute().to === 'arb');
check('route count rendered as 12', els['route-count'].textContent === '12', els['route-count'].textContent);
const fromOpts = (els['from-select'].innerHTML.match(/<option/g) || []).length;
const toOpts = (els['to-select'].innerHTML.match(/<option/g) || []).length;
check('FROM select lists 4 chains', fromOpts === 4, String(fromOpts));
check('TO select lists 3 (excludes source)', toOpts === 3, String(toOpts));
check('TO select excludes bot', !/value="bot"/.test(els['to-select'].innerHTML));
check('labels show BOT Chain -> Arbitrum', els['from-name'].textContent === 'BOT Chain' && els['to-name'].textContent === 'Arbitrum',
  `${els['from-name'].textContent} -> ${els['to-name'].textContent}`);
check('source balance label mentions USDT', /USDT balance/.test(els['source-balance-label'].textContent), els['source-balance-label'].textContent);
check('amount symbol reflects source token', els['amount-symbol'].textContent === 'USDT', els['amount-symbol'].textContent);
check('flip-route handler registered', typeof handlers['flip-route:click'] === 'function');
check('from-select change handler registered', typeof handlers['from-select:change'] === 'function');
check('activity feed fetched on load', fetched === 1, String(fetched));

// flip route -> arb -> bot, and the TO list must drop bot / include base+arc
handlers['flip-route:click']();
check('flip swapped route to arb -> bot', api.getRoute().from === 'arb' && api.getRoute().to === 'bot', JSON.stringify(api.getRoute()));
check('after flip, TO select excludes arb', !/value="arb"/.test(els['to-select'].innerHTML));
check('after flip, TO select includes base', /value="base"/.test(els['to-select'].innerHTML));
check('after flip, TO select includes arc', /value="arc"/.test(els['to-select'].innerHTML));
check('after flip, amount symbol is botUSDT', els['amount-symbol'].textContent === 'botUSDT', els['amount-symbol'].textContent);

// pick arc as destination via the selector
els['to-select'].value = 'arc';
handlers['to-select:change']();
check('selecting arc as destination works', api.getRoute().to === 'arc', JSON.stringify(api.getRoute()));
check('destination label switched to Arc', /Arc/.test(els['to-name'].textContent), els['to-name'].textContent);
check('arc domain rendered', String(els['to-domain'].textContent) === '5042002', String(els['to-domain'].textContent));

// source change to base must rebuild destinations and never equal the source
els['from-select'].value = 'base';
handlers['from-select:change']();
check('source switched to base', api.getRoute().from === 'base', JSON.stringify(api.getRoute()));
check('destination never equals source', api.getRoute().to !== 'base');
check('availableDestinations excludes source', !api.availableDestinations().includes('base'), api.availableDestinations().join(','));

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
