// Trestle landing content: the twelve-route matrix, the route-facts rail,
// the live relayer heartbeat, and scroll reveals. Reads the chain table that
// app.js already publishes (window.__trestle) so there is one
// source of truth for chain data.
(() => {
  const api = window.__trestle || window.__trestleConfig;
  if (!api) return;
  const { CONFIG, CHAIN_ORDER } = api;
  const getRoute = api.getRoute || (() => ({ from: 'bot', to: 'arb' }));

  // ---- twelve-route matrix -------------------------------------------------
  const matrix = document.getElementById('route-matrix');
  if (matrix) {
    const rows = [];
    for (const from of CHAIN_ORDER) {
      for (const to of CHAIN_ORDER) {
        if (from === to) continue;
        const f = CONFIG[from], t = CONFIG[to];
        rows.push(
          `<div class="matrix-row">
             <span class="cell-chain"><span class="chain-icon ${f.kind}">${f.icon}</span>${f.name} ${f.network}</span>
             <span class="cell-chain"><span class="chain-icon ${t.kind}">${t.icon}</span>${t.name} ${t.network}</span>
             <span class="cell-domain">${f.domain} → ${t.domain}</span>
             <span class="cell-asset">${f.tokenLabel} → ${t.tokenLabel}</span>
             <span class="cell-status">live</span>
           </div>`);
      }
    }
    matrix.innerHTML = rows.join('');
  }

  // ---- enrolled chains (right rail) ---------------------------------------
  const chainList = document.getElementById('chain-list');
  if (chainList) {
    chainList.innerHTML = CHAIN_ORDER.map((k) => {
      const c = CONFIG[k];
      return `<li><span class="chain-icon ${c.kind}">${c.icon}</span>
                <span>${c.name}<span class="net">${c.network}</span></span>
                <span class="dom">${c.domain}</span></li>`;
    }).join('');
  }

  // ---- route-facts rail follows the selected route ------------------------
  const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '—');
  function paintFacts() {
    const { from, to } = getRoute();
    const f = CONFIG[from], t = CONFIG[to];
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('fact-source', `${f.tokenLabel} · ${f.name}`);
    set('fact-dest', `${t.tokenLabel} · ${t.name}`);
    set('fact-token', short(f.token));
    set('fact-router', short(f.router));
  }
  paintFacts();
  for (const id of ['from-select', 'to-select']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', paintFacts);
  }
  { const flip = document.getElementById('flip-route');
    if (flip) flip.addEventListener('click', () => setTimeout(paintFacts, 0)); }

  // ---- relayer heartbeat --------------------------------------------------
  const statusEl = document.getElementById('relayer-status');
  const lastNameEl = document.getElementById('last-relay');
  async function heartbeat() {
    if (!statusEl) return;
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      const d = await r.json();
      const last = (d.recent || [])[0];
      statusEl.innerHTML = `<span class="pulse"></span> ${d.status === 'online' ? 'online' : String(d.status || 'unknown')}`;
      // deliberately two lines: timestamp, then route — never an orphaned word
      if (lastNameEl) lastNameEl.innerHTML = last
        ? `<span>${last.time}</span><span class="net">${last.direction}</span>`
        : 'no relays yet';
    } catch {
      statusEl.textContent = 'unreachable';
      if (lastNameEl) lastNameEl.textContent = '—';
    }
  }
  heartbeat();
  setInterval(heartbeat, 30000);

  // ---- scroll reveals -----------------------------------------------------
  const targets = document.querySelectorAll('.reveal');
  const showAll = () => targets.forEach((el) => el.classList.add('in'));
  if (!('IntersectionObserver' in window) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    showAll();
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        setTimeout(() => e.target.classList.add('in'), i * 70);
        io.unobserve(e.target);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    targets.forEach((el) => io.observe(el));
    // safety net: content must never stay hidden if the observer misbehaves
    setTimeout(showAll, 2500);
  }
})();
