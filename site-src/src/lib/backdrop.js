// The light behind every page: three slow beams of refracted light and a
// few Bed Wars blocks drifting in the dark, a little further away the
// further down you scroll. Click-through, drawn on one canvas, paused while
// the tab is hidden, one still frame for reduced motion, gone with effects off.
import sheetUrl from '../assets/items.png';
import itemIcons from '../data/item-icons.json';
import { prefs } from './prefs.js';

const BLOCKS = ['block:red_wool', 'block:blue_wool', 'block:lime_wool', 'block:yellow_wool', 'block:end_stone', 'block:obsidian', 'block:gold', 'block:diamond', 'block:emerald', 'block:tnt', 'cat:bed', 'res:diamond', 'res:emerald', 'res:gold', 'ui:pearl', 'ui:fireball', 'block:glass', 'ui:apple'];

export function startBackdrop() {
  if (typeof window === 'undefined' || document.getElementById('backdrop')) return;
  const cv = document.createElement('canvas');
  cv.id = 'backdrop';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  const sheet = new Image();
  sheet.src = sheetUrl;
  const N = itemIcons.size;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, colors = {};
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bits = [];

  const still = () => document.documentElement.dataset.motion === 'reduce';
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = { a: cs.getPropertyValue('--accent').trim() || '#5ee7ff', b: cs.getPropertyValue('--accent-2').trim() || '#a98bff', c: cs.getPropertyValue('--accent-3').trim() || '#ffc46b', light: document.documentElement.dataset.surface === 'light' };
  }
  function layout() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const want = Math.round(Math.min(16, Math.max(7, (W * H) / 90000)));
    seed = 11; bits.length = 0;
    for (let i = 0; i < want; i++) {
      const depth = 0.25 + rnd() * 0.75;            // 1 = near
      bits.push({
        id: BLOCKS[Math.floor(rnd() * BLOCKS.length)],
        x: rnd() * W, y: rnd() * H * 1.4, depth,
        size: 18 + depth * 46, spin: (rnd() - 0.5) * 0.25, phase: rnd() * Math.PI * 2,
        rise: 4 + depth * 9
      });
    }
  }
  function beam(t, angle, color, offset, alpha) {
    const cx = W * 0.5, cy = -H * 0.15;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.sin(t * 0.00012 + offset) * 0.03);
    const len = Math.hypot(W, H) * 1.3;
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.15, color);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(t * 0.0005 + offset));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(len, -90); ctx.lineTo(len, 90); ctx.lineTo(0, 2);
    ctx.fill();
    ctx.restore();
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = colors.light ? 0.5 : 1;
    ctx.globalCompositeOperation = colors.light ? 'source-over' : 'lighter';
    beam(t, Math.PI * 0.30, colors.a, 0, 0.06 * k);
    beam(t, Math.PI * 0.36, colors.b, 2, 0.055 * k);
    beam(t, Math.PI * 0.42, colors.c, 4, 0.045 * k);
    ctx.globalCompositeOperation = 'source-over';
    if (!sheet.complete || !sheet.naturalWidth) return;
    const scroll = scrollY;
    ctx.imageSmoothingEnabled = false;
    for (const b of bits) {
      const i = itemIcons.index[b.id];
      if (i === undefined) continue;
      const span = H * 1.4 + b.size * 2;
      let y = (b.y - t * 0.001 * b.rise - scroll * b.depth * 0.25) % span;
      if (y < -b.size) y += span;
      const x = b.x + Math.sin(t * 0.0004 + b.phase) * 10 * b.depth;
      ctx.save();
      ctx.translate(x, y - b.size);
      ctx.rotate(Math.sin(t * 0.0003 + b.phase) * b.spin);
      ctx.globalAlpha = (colors.light ? 0.10 : 0.13) * (0.4 + b.depth * 0.6);
      ctx.filter = b.depth < 0.5 ? 'blur(1.5px)' : 'none';
      ctx.drawImage(sheet, i * N, 0, N, N, -b.size / 2, -b.size / 2, b.size, b.size);
      ctx.restore();
    }
  }
  function frame(t) {
    raf = 0;
    if (document.hidden) return;
    if (t - last > 30) { draw(t); last = t; }
    if (!still()) raf = requestAnimationFrame(frame);
  }
  function apply() {
    const on = document.documentElement.dataset.effects !== 'off';
    cv.hidden = !on;
    cancelAnimationFrame(raf); raf = 0;
    if (!on) return;
    readColors();
    if (still()) draw(performance.now());
    else raf = requestAnimationFrame(frame);
  }
  layout();
  sheet.onload = () => apply();
  addEventListener('resize', () => { layout(); apply(); });
  addEventListener('scroll', () => { if (still() && !cv.hidden) draw(performance.now()); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  prefs.subscribe(() => requestAnimationFrame(apply));
  apply();
}
