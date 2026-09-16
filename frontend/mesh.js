// Trestle hero — chartreuse point-lattice terrain.
// A dot mesh projected in shallow perspective with a slow travelling wave,
// connected into topographic lines. Cheap: capped lattice, ~30fps, and it
// stops entirely when off-screen or when the user prefers reduced motion.
(() => {
  const canvas = document.getElementById('mesh');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACID = '214,216,20';
  let W = 0, H = 0, cols = 0, rows = 0, raf = null, t = 0, frame = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(280, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // keep the lattice affordable: it is a background, not the product
    cols = Math.min(W < 700 ? 30 : 46, Math.round(W / 28));
    rows = Math.min(W < 700 ? 13 : 18, Math.round(H / 38));
  }

  // lattice point -> screen position, with depth-scaled spacing
  function pt(i, j) {
    const tz = j / (rows - 1);                       // 0 = horizon, 1 = near edge
    const scale = 0.3 + 0.7 * Math.pow(tz, 1.45);
    const spread = (W * 1.05) / cols;
    const x = W / 2 + (i - (cols - 1) / 2) * spread * scale;
    const base = H * 0.96 - tz * H * 0.74;
    const wave = Math.sin(i * 0.42 + t * 0.9 + tz * 3.1) * 0.5 + Math.sin(j * 0.55 - t * 0.6) * 0.5;
    const amp = 26 * Math.pow(tz, 1.7) + 5;
    const y = base + wave * amp;
    return { x, y, tz };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const grid = [];
    for (let j = 0; j < rows; j++) {
      const row = [];
      for (let i = 0; i < cols; i++) row.push(pt(i, j));
      grid.push(row);
    }
    ctx.lineWidth = 1;
    // lateral falloff: dissolve to nothing well before the viewport edge
    const falloff = (i) => {
      const nx = Math.abs((i - (cols - 1) / 2) / ((cols - 1) / 2));
      const k = Math.min(1, Math.max(0, (1 - nx) / 0.45));
      return k * k * (3 - 2 * k);
    };
    // Lines are batched into 6 alpha buckets (Path2D) instead of ~2k individual
    // stroke() calls per frame — same look, a fraction of the draw cost.
    const B = 6, paths = Array.from({ length: B }, () => new Path2D());
    for (let j = 0; j < rows; j++) {
      const depth = 0.18 + 0.82 * Math.pow(j / (rows - 1), 1.6);
      for (let i = 0; i < cols - 1; i++) {
        const p = grid[j][i], q = grid[j][i + 1];
        const b = Math.min(B - 1, Math.floor(falloff(i) * depth * B));
        paths[b].moveTo(p.x, p.y); paths[b].lineTo(q.x, q.y);
      }
      if (j < rows - 1) {
        for (let i = 0; i < cols; i++) {
          const b = Math.min(B - 1, Math.floor(falloff(i) * depth * B));
          const p = grid[j][i], q = grid[j + 1][i];
          paths[b].moveTo(p.x, p.y); paths[b].lineTo(q.x, q.y);
        }
      }
    }
    for (let b = 0; b < B; b++) {
      ctx.strokeStyle = `rgba(${ACID},${(0.2 * ((b + 1) / B)).toFixed(3)})`;
      ctx.stroke(paths[b]);
    }
    // dots on top, brighter toward the viewer
    for (let j = 0; j < rows; j++) {
      const tz = j / (rows - 1);
      const r = 0.5 + 1.5 * tz;
      const base = 0.07 + 0.42 * Math.pow(tz, 1.5);
      for (let i = 0; i < cols; i++) {
        const a = base * falloff(i);
        if (a < 0.03) continue;
        ctx.fillStyle = `rgba(${ACID},${a.toFixed(3)})`;
        const p = grid[j][i];
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      }
    }
  }

  function loop() {
    frame++;
    if (frame % 3 === 0) { t += 0.012; draw(); }      // ~20fps is plenty for drift
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduced) loop(); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  size(); draw();
  if (!reduced) {
    start();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { es[0].isIntersecting ? start() : stop(); }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); draw(); }, 180); });
  }
})();
