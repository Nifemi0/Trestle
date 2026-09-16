// Trestle icon system — one geometric stroke set, no emoji, no text glyphs.
// Usage in markup:  <span data-icon="arrow-up-right"></span>
// Usage in JS:      TrestleIcon.svg('refresh')
(() => {
  const ICONS = {
    'arrow-up-right':  '<path d="M7 17 17 7"/><path d="M10 7h7v7"/>',
    'arrow-down-right':'<path d="M7 7l10 10"/><path d="M17 10v7h-7"/>',
    'arrow-right':     '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
    'arrow-down':      '<path d="M12 4v15"/><path d="M6 13l6 6 6-6"/>',
    'swap':            '<path d="M8 4v14"/><path d="M5 15l3 3 3-3"/><path d="M16 20V6"/><path d="M13 9l3-3 3 3"/>',
    'refresh':         '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    'check':           '<path d="M4 12.5 9.5 18 20 6.5"/>',
    'external':        '<path d="M13 5h6v6"/><path d="M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
    'wallet':          '<path d="M4 8V7a1 1 0 0 1 1-1h12"/><path d="M4 8h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M15 13h2"/>',
    'lock':            '<path d="M8 10V8a4 4 0 0 1 8 0v2"/><path d="M6 10h12v10H6z"/><path d="M12 14v2"/>',
    'shield':          '<path d="M12 3l8 3v6c0 4.6-3.6 7.4-8 9-4.4-1.6-8-4.4-8-9V6z"/><path d="M9 12.5 11.5 15 15.5 10"/>',
    'cube':            '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/>',
    'nodes':           '<path d="M5 6h5"/><path d="M14 6h5"/><path d="M12 8v3"/><path d="M5 18h5"/><path d="M14 18h5"/><path d="M12 16v-3"/><circle cx="12" cy="12" r="1.6"/>',
    'terminal':        '<path d="M4 5h16v14H4z"/><path d="M8 10l2.5 2.5L8 15"/><path d="M13 15h3.5"/>',
    'doc':             '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    'gauge':           '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.5-5"/>',
    'bolt':            '<path d="M13 3 6 13.5h5L10 21l7-10.5h-5z"/>',
    'clock':           '<circle cx="12" cy="12" r="8"/><path d="M12 7v5.5l3.5 2"/>',
    'alert':           '<path d="M12 4l8.5 15h-17z"/><path d="M12 10v4"/><path d="M12 16.5v.5"/>',
    'menu':            '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    'close':           '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    'route':           '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6H15a3 3 0 0 1 3 3v6.6"/>',
    'layers':          '<path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 12.5 12 17l8-4.5"/>',
    'link':            '<path d="M10 14l4-4"/><path d="M9 7l1.5-1.5a3.5 3.5 0 0 1 5 5L14 12"/><path d="M15 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L10 12"/>',
    'compass':         '<circle cx="12" cy="12" r="8.5"/><path d="M15 9l-1.6 4.4L9 15l1.6-4.4z"/>',
    'flask':           '<path d="M9 3h6"/><path d="M10 3v6L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 14h9"/>',
    'trestle':         '<path d="M2 20h20"/><path d="M5 20l3-11"/><path d="M19 20l-3-11"/><path d="M12 20V9"/><path d="M5 9h14"/><path d="M8.5 9V5.5h7V9"/><path d="M12 5.5V2.5"/>',
  };

  // Geometric chain marks — original shapes, not brand clones.
  const CHAIN_MARKS = {
    bot:  '<path d="M12 3l7.5 4.3v8.6L12 20.2 4.5 15.9V7.3z"/><path d="M12 8.4l3.2 1.9v3.4L12 15.6l-3.2-1.9v-3.4z"/>',
    arb:  '<path d="M12 3.5 20.5 19h-17z"/><path d="M12 9.5 16 17H8z"/>',
    base: '<circle cx="12" cy="12" r="8.5"/><path d="M5.6 12h12.8"/>',
    arc:  '<path d="M19.5 12a7.5 7.5 0 1 1-4.4-6.8"/><path d="M19.5 4.5V12h-7.5"/>',
  };

  function svg(name, opts = {}) {
    const body = ICONS[name];
    if (!body) return '';
    const cls = opts.cls ? ` class="${opts.cls}"` : '';
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.weight || 1.5}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"${cls}${size}>${body}</svg>`;
  }
  function mark(key, opts = {}) {
    const body = CHAIN_MARKS[key];
    if (!body) return svg('cube', opts);
    const cls = opts.cls ? ` class="${opts.cls}"` : '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter" aria-hidden="true"${cls}>${body}</svg>`;
  }
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (el.dataset.hydrated === '1') return;
      const name = el.getAttribute('data-icon');
      el.innerHTML = svg(name, { weight: el.getAttribute('data-weight') || 1.5 });
      el.dataset.hydrated = '1';
      el.classList.add('ico');
    });
    root.querySelectorAll('[data-mark]').forEach((el) => {
      if (el.dataset.hydratedMark === '1') return;
      el.innerHTML = mark(el.getAttribute('data-mark'));
      el.dataset.hydratedMark = '1';
    });
  }
  window.TrestleIcon = { svg, mark, hydrate, names: Object.keys(ICONS) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
  else hydrate();
})();
