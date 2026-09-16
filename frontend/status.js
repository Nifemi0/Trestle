(() => {
  const short = (v) => v == null ? '—' : String(v);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  function renderRecent(recent) {
    const list = document.getElementById('status-recent');
    if (!list) return;
    list.innerHTML = (recent || []).map((x) => `
      <div class="activity-item">
        <span class="chain-icon ${x.destinationKey || 'bot'}">↗</span>
        <span class="route">${x.direction}</span>
        <span class="status">Delivered</span>
        <span class="time">${x.time || 'recent'}</span>
        ${x.relayTx ? `<a class="tx" target="_blank" rel="noreferrer" href="${x.explorer}">tx ↗</a>` : ''}
      </div>`).join('') || '<div class="activity-item"><span class="route">No relays yet</span><span class="time">watching</span></div>';
  }
  async function refreshStatus() {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      const d = await r.json();
      set('status-state', d.status || 'unknown');
      set('status-route', d.route || '—');
      set('status-recent-count', String((d.recent || []).length));
      set('status-latest-route', d.recent?.[0]?.direction || '—');
      set('status-latest-time', d.recent?.[0]?.time || '—');
      renderRecent(d.recent || []);
    } catch {
      set('status-state', 'unreachable');
    }
  }
  refreshStatus();
  setInterval(refreshStatus, 30000);
})();
