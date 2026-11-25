// Each page's own moving background, drawn on one canvas fixed behind the
// page. Every one answers the pointer in its own way:
//   player        experience orbs drift about and fly to the pointer
//   nicks         scrambled name tags; the light round the pointer unscrambles them
//   leaderboards  a field of block pillars that rise as the pointer passes
//   download      the End portal's starfield, swirling round the pointer
//   tracker       a radar sweep; click the background to ping
//   unlock        enchanting-table letters flowing to the pointer
// Click-through (it never takes a click from the page), paused while the tab
// is hidden, one still frame for less motion, gone with the background off.
import { prefs } from './prefs.js';

const reduce = () => document.documentElement.dataset.motion === 'reduce';
const isLight = () => document.documentElement.dataset.surface === 'light';
const TAU = Math.PI * 2;

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n, f) => cs.getPropertyValue(n).trim() || f;
  return { a: get('--accent', '#5ee7ff'), b: get('--accent-2', '#a98bff'), c: get('--accent-3', '#ffc46b'), text: get('--text', '#eef1f8'), bg: get('--bg', '#06070b'), light: isLight() };
}
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// The page under the pointer is "background" when it isn't a control or a panel.
const onBackground = el => !(el && el.closest && el.closest('a, button, input, textarea, select, label, [role="listbox"], [role="dialog"], dialog, .panel, .card, .site-head, .site-foot, table'));

// ---------------------------------------------------------------- player
// Experience orbs: green-gold glowing balls that bob about. Near the pointer
// they're pulled in and get collected with the orb sound's little pop ring.
function orbs() {
  let list = [], rings = [];
  const make = (W, H, r) => ({ x: r() * W, y: r() * H, vx: (r() - 0.5) * 12, vy: (r() - 0.5) * 12, s: 5 + r() * 7, ph: r() * TAU, hue: r() });
  return {
    init(W, H) { const r = seeded(7); const n = Math.round(Math.min(46, Math.max(18, W * H / 38000))); list = Array.from({ length: n }, () => make(W, H, r)); },
    frame(ctx, t, dt, P, W, H, pal) {
      for (const o of list) {
        const dx = P.x - o.x, dy = P.y - o.y, d = Math.hypot(dx, dy);
        if (P.on && d < 170) { const f = (1 - d / 170) * 520; o.vx += (dx / (d || 1)) * f * dt; o.vy += (dy / (d || 1)) * f * dt; }
        o.vx += Math.sin(t * 0.0006 + o.ph) * 4 * dt; o.vy += Math.cos(t * 0.0005 + o.ph * 1.3) * 4 * dt;
        o.vx *= 1 - dt * 1.4; o.vy *= 1 - dt * 1.4;
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (P.on && d < o.s + 6) { rings.push({ x: o.x, y: o.y, t: 0 }); Object.assign(o, make(W, H, Math.random), { x: Math.random() < 0.5 ? -20 : W + 20 }); }
        if (o.x < -30) o.x = W + 30; if (o.x > W + 30) o.x = -30; if (o.y < -30) o.y = H + 30; if (o.y > H + 30) o.y = -30;
        const pulse = 0.75 + 0.25 * Math.sin(t * 0.004 + o.ph);
        const r = o.s * pulse;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 3);
        const core = `hsla(${70 + o.hue * 40}, 100%, ${pal.light ? 42 : 62}%,`;
        g.addColorStop(0, `${core} ${pal.light ? 0.55 : 0.6})`); g.addColorStop(0.35, `${core} ${pal.light ? 0.2 : 0.22})`); g.addColorStop(1, `${core} 0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 3, 0, TAU); ctx.fill();
        // the blocky orb itself, as in game
        ctx.fillStyle = `hsla(${70 + o.hue * 40}, 95%, ${pal.light ? 40 : 70}%, ${pal.light ? 0.6 : 0.75})`;
        const q = Math.max(2, Math.round(r * 0.55));
        ctx.fillRect(Math.round(o.x - q), Math.round(o.y - q), q * 2, q * 2);
        ctx.fillStyle = `rgba(255,255,230,${pal.light ? 0.5 : 0.7})`;
        ctx.fillRect(Math.round(o.x - q * 0.5), Math.round(o.y - q * 0.6), q, Math.max(1, q * 0.5));
      }
      rings = rings.filter(g => (g.t += dt) < 0.5);
      for (const g of rings) { ctx.strokeStyle = `rgba(190,255,120,${(1 - g.t / 0.5) * 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, 6 + g.t * 60, 0, TAU); ctx.stroke(); }
    }
  };
}

// ---------------------------------------------------------------- nicks
// Name tags in Minecraft's dark plaque, their names scrambled like §k text.
// Under the light that follows the pointer, the real name shows.
const SYL = ['ka', 'zo', 'mi', 'ri', 'xo', 'ty', 'ne', 'lu', 'va', 'qu', 'pe', 'do', 'shi', 'ro', 'fa', 'jin', 'el', 'ar', 'ix', 'on'];
const MAGIC = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&@?';
function nameOf(r) {
  let s = ''; const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)];
  s = s[0].toUpperCase() + s.slice(1);
  if (r() < 0.5) s += Math.floor(r() * 999);
  if (r() < 0.3) s = `x${s}x`;
  return s.slice(0, 16);
}
function nametags() {
  let tags = [];
  return {
    init(W, H) {
      const r = seeded(31); const n = Math.round(Math.min(34, Math.max(12, W * H / 52000)));
      tags = Array.from({ length: n }, () => ({ x: r() * W, y: r() * H, name: nameOf(r), z: 0.55 + r() * 0.6, sp: 4 + r() * 8, ph: r() * TAU, lit: 0 }));
    },
    frame(ctx, t, dt, P, W, H, pal) {
      if (P.on) {
        const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 220);
        g.addColorStop(0, pal.light ? 'rgba(255,255,255,0.55)' : 'rgba(170,190,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(P.x - 220, P.y - 220, 440, 440);
      }
      const flick = Math.floor(t / 70);
      for (const g of tags) {
        g.y -= g.sp * g.z * dt; g.x += Math.sin(t * 0.0003 + g.ph) * 6 * dt;
        if (g.y < -30) { g.y = H + 30; g.x = Math.random() * W; }
        const d = P.on ? Math.hypot(P.x - g.x, P.y - g.y) : 1e9;
        g.lit += ((d < 150 ? 1 : 0) - g.lit) * Math.min(1, dt * 6);
        const size = Math.round(13 * g.z);
        ctx.font = `700 ${size}px ${'JetBrains Mono'}, ui-monospace, monospace`;
        let text = '';
        for (let i = 0; i < g.name.length; i++) {
          const show = g.lit > 0.5 && (i / g.name.length) < (g.lit - 0.5) * 2.2;
          text += show ? g.name[i] : MAGIC[(i * 7 + flick * 13 + Math.floor(g.ph * 100)) % MAGIC.length];
        }
        const w = ctx.measureText(text).width + 12, h = size + 8;
        const a = (pal.light ? 0.16 : 0.2) + g.lit * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${pal.light ? 0.1 + g.lit * 0.25 : 0.28 + g.lit * 0.2})`;
        ctx.fillRect(g.x - w / 2, g.y - h / 2, w, h);
        ctx.fillStyle = g.lit > 0.5 ? `rgba(255,255,255,${a + 0.2})` : (pal.light ? `rgba(20,24,40,${a})` : `rgba(220,226,240,${a})`);
        if (g.lit > 0.5 && pal.light) ctx.fillStyle = `rgba(255,255,255,${a + 0.3})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, g.x, g.y + 1);
        if (g.lit > 0.02) { ctx.strokeStyle = pal.a; ctx.globalAlpha = g.lit * 0.6; ctx.lineWidth = 1; ctx.strokeRect(g.x - w / 2 - 0.5, g.y - h / 2 - 0.5, w + 1, h + 1); ctx.globalAlpha = 1; }
      }
    }
  };
}

// ---------------------------------------------------------------- leaderboards
// An isometric field of pillars along the bottom, like a chart of blocks.
// They breathe slowly, and rise in a wave where the pointer passes.
const STAR_HUES = ['#b8b8b8', '#ffffff', '#ffaa00', '#55ffff', '#4fd65a', '#3fcfcf', '#ff5555', '#ff55ff', '#8080ff', '#d65bd6'];
function pillars() {
  let cols = [], cell = 26;
  return {
    init(W, H) {
      cell = W < 700 ? 18 : 26;
      const r = seeded(5); cols = [];
      const nx = Math.ceil(W / cell) + 4, rows = 7;
      for (let j = 0; j < rows; j++) for (let i = -2; i < nx; i++) cols.push({ i, j, base: 0.2 + r() * 0.8, ph: r() * TAU, lift: 0, hue: STAR_HUES[Math.floor(r() * STAR_HUES.length)] });
    },
    frame(ctx, t, dt, P, W, H, pal) {
      const ox = 0, oy = H + 8;
      // back rows first so nearer pillars cover them
      for (const c of cols) {
        const x = ox + c.i * cell + (c.j % 2 ? cell / 2 : 0), yb = oy - c.j * cell * 0.42;
        const d = P.on ? Math.hypot(P.x - x, (P.y - yb) * 0.6) : 1e9;
        c.lift += ((d < 180 ? (1 - d / 180) : 0) - c.lift) * Math.min(1, dt * 4);
        const h = (c.base * (0.55 + 0.45 * Math.sin(t * 0.0006 + c.ph)) * 3.2 + c.lift * 7) * cell * (0.5 + c.j * 0.12);
        const top = yb - h, w = cell * 0.5, sk = cell * 0.25;
        const alpha = (pal.light ? 0.1 : 0.08) + c.lift * 0.25 + c.j * 0.01;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c.hue; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, top + sk); ctx.lineTo(x, top + sk * 2); ctx.lineTo(x - w, top + sk); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = alpha * 0.7; ctx.fillStyle = c.hue;
        ctx.beginPath(); ctx.moveTo(x - w, top + sk); ctx.lineTo(x, top + sk * 2); ctx.lineTo(x, yb + sk * 2); ctx.lineTo(x - w, yb + sk); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = alpha * 0.45;
        ctx.beginPath(); ctx.moveTo(x + w, top + sk); ctx.lineTo(x, top + sk * 2); ctx.lineTo(x, yb + sk * 2); ctx.lineTo(x + w, yb + sk); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // a few stars climbing out of the field
      for (let k = 0; k < 14; k++) {
        const x = ((k * 197.3 + t * 0.012 * (k % 3 + 1)) % (W + 40)) - 20;
        const y = H - ((t * 0.02 * (1 + (k % 4) * 0.3) + k * 83) % (H * 0.8));
        ctx.globalAlpha = (pal.light ? 0.25 : 0.35) * (y / H);
        ctx.fillStyle = STAR_HUES[k % STAR_HUES.length];
        ctx.font = `700 ${10 + (k % 3) * 3}px ui-monospace, monospace`;
        ctx.fillText('✫', x, y);
      }
      ctx.globalAlpha = 1;
    }
  };
}

// ---------------------------------------------------------------- download
// The End portal: layers of teal and green specks drifting at different
// depths, swirling round the pointer. A click bursts portal particles.
const PORTAL = ['#1b4a52', '#2b6f68', '#3e9a86', '#57d0a6', '#a3f2d8', '#5a7dd6', '#7f62d6'];
function portal() {
  let stars = [], burst = [];
  return {
    init(W, H) { const r = seeded(13); stars = Array.from({ length: Math.round(Math.min(420, W * H / 4200)) }, () => ({ x: r() * W, y: r() * H, z: r(), c: PORTAL[Math.floor(r() * PORTAL.length)], s: r() < 0.08 ? 3 : r() < 0.3 ? 2 : 1 })); },
    click(x, y) { for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, v = 40 + Math.random() * 180; burst.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, c: PORTAL[3 + Math.floor(Math.random() * 4)] }); } },
    frame(ctx, t, dt, P, W, H, pal) {
      for (const s of stars) {
        const sp = 6 + s.z * 22;
        s.x += sp * dt * 0.6; s.y -= sp * dt * 0.25;
        if (P.on) {
          const dx = s.x - P.x, dy = s.y - P.y, d = Math.hypot(dx, dy);
          if (d < 200) { const k = (1 - d / 200) * (0.6 + s.z) * dt * 1.6; s.x += -dy * k * 0.5 - dx * k * 0.05; s.y += dx * k * 0.5 - dy * k * 0.05; }
        }
        if (s.x > W + 4) s.x = -4; if (s.x < -4) s.x = W + 4; if (s.y < -4) s.y = H + 4; if (s.y > H + 4) s.y = -4;
        ctx.globalAlpha = (pal.light ? 0.35 : 0.3) + s.z * 0.5 * (0.6 + 0.4 * Math.sin(t * 0.003 + s.x));
        ctx.fillStyle = s.c;
        const q = s.s * (0.6 + s.z);
        ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, q), Math.max(1, q));
      }
      burst = burst.filter(b => (b.t += dt) < 1.1);
      for (const b of burst) { b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 2; b.vy *= 1 - dt * 2; ctx.globalAlpha = 1 - b.t / 1.1; ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, 3, 3); }
      ctx.globalAlpha = 1;
    }
  };
}

// ---------------------------------------------------------------- tracker
// A radar: rings round the top right corner, a sweeping arm, and blips that
// flare as the arm passes. Clicking the background sends out a ping.
function radar() {
  let blips = [], pings = [], cx = 0, cy = 0, R = 0;
  return {
    init(W, H) {
      cx = W * 0.82; cy = H * 0.2; R = Math.hypot(W, H) * 0.9;
      const r = seeded(19);
      blips = Array.from({ length: 26 }, () => { const a = r() * TAU, d = 80 + r() * Math.min(R, 1100); return { a, d, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, glow: 0 }; });
    },
    click(x, y) { pings.push({ x, y, t: 0 }); },
    frame(ctx, t, dt, P, W, H, pal) {
      const ink = pal.light ? '20,40,80' : '120,200,255';
      ctx.lineWidth = 1;
      for (let k = 1; k < 9; k++) { ctx.strokeStyle = `rgba(${ink},${0.05 - k * 0.003})`; ctx.beginPath(); ctx.arc(cx, cy, k * 140, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = `rgba(${ink},0.04)`; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      const sweep = (t * 0.00045) % TAU;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep - 0.9, cx, cy) : null;
      if (grad) {
        grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.143, pal.light ? 'rgba(40,90,160,0.10)' : 'rgba(94,231,255,0.10)'); grad.addColorStop(0.1431, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweep - 0.9, sweep); ctx.closePath(); ctx.fill();
      }
      for (const b of blips) {
        let diff = (sweep - (b.a % TAU) + TAU) % TAU;
        if (diff < 0.06) b.glow = 1;
        b.glow = Math.max(0, b.glow - dt * 0.35);
        const near = P.on && Math.hypot(P.x - b.x, P.y - b.y) < 90 ? 1 : 0;
        const a = 0.08 + b.glow * 0.5 + near * 0.4;
        ctx.fillStyle = pal.light ? `rgba(200,40,70,${a})` : `rgba(255,110,130,${a})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5 + b.glow * 2, 0, TAU); ctx.fill();
        if (b.glow > 0.2 || near) { ctx.strokeStyle = pal.light ? `rgba(200,40,70,${a * 0.5})` : `rgba(255,110,130,${a * 0.5})`; ctx.beginPath(); ctx.arc(b.x, b.y, 8 + (1 - b.glow) * 10, 0, TAU); ctx.stroke(); }
      }
      pings = pings.filter(p => (p.t += dt) < 1.6);
      for (const p of pings) {
        for (let k = 0; k < 3; k++) { const q = p.t - k * 0.18; if (q < 0) continue; ctx.strokeStyle = `rgba(${ink},${Math.max(0, 0.45 * (1 - q / 1.4))})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, q * 220, 0, TAU); ctx.stroke(); }
        for (const b of blips) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (Math.abs(d - p.t * 220) < 10) b.glow = 1; }
      }
    }
  };
}

// ---------------------------------------------------------------- unlock
// Letters of the enchanting table's alphabet rising out of the page and
// flowing to the pointer, as they flow to the book.
const RUNES = [
  [[0, 0, 2, 0], [1, 0, 1, 3]], [[0, 0, 0, 3], [0, 3, 2, 3], [2, 1, 2, 3]], [[0, 0, 2, 0], [2, 0, 2, 3], [0, 2, 1, 2]], [[0, 1, 2, 1], [1, 1, 1, 3]],
  [[0, 0, 0, 3], [2, 0, 2, 3], [0, 2, 2, 2]], [[0, 0, 2, 3], [2, 0, 0, 3]], [[0, 0, 0, 3], [0, 0, 2, 0], [0, 3, 2, 3]], [[1, 0, 1, 3], [0, 1, 2, 1], [0, 3, 2, 3]],
  [[0, 3, 1, 0], [1, 0, 2, 3]], [[0, 0, 2, 0], [0, 0, 0, 2], [2, 2, 2, 3]], [[0, 0, 0, 3], [0, 1, 2, 1], [2, 1, 2, 3]], [[2, 0, 0, 0], [0, 0, 0, 3], [0, 3, 2, 3], [2, 2, 2, 3]],
  [[0, 0, 2, 0], [0, 3, 2, 3], [1, 0, 1, 3]], [[0, 0, 0, 3], [0, 0, 2, 2]], [[0, 1, 1, 0], [1, 0, 2, 1], [1, 0, 1, 3]], [[0, 0, 2, 0], [0, 1, 2, 1], [0, 3, 2, 3]],
  [[0, 0, 0, 3], [2, 0, 2, 3]], [[0, 3, 2, 0], [0, 0, 1, 1]], [[0, 0, 2, 0], [1, 0, 1, 2], [0, 3, 2, 3]], [[0, 2, 2, 2], [1, 0, 1, 3]],
  [[0, 0, 0, 1], [2, 0, 2, 1], [0, 1, 2, 1], [1, 1, 1, 3]], [[0, 0, 2, 0], [0, 0, 0, 3]], [[0, 3, 2, 3], [2, 3, 2, 0], [0, 1, 2, 1]], [[0, 0, 0, 3], [0, 3, 2, 1]],
  [[0, 1, 2, 1], [0, 2, 2, 2]], [[1, 0, 1, 1], [1, 2, 1, 3], [0, 0, 2, 0]]
];
function glyphs() {
  let list = [];
  const make = (W, H, r, anywhere) => ({ x: r() * W, y: anywhere ? r() * H : H + 20, vx: 0, vy: -(10 + r() * 20), rune: Math.floor(r() * RUNES.length), s: 9 + r() * 9, rot: (r() - 0.5) * 0.4, life: 0 });
  return {
    init(W, H) { const r = seeded(23); list = Array.from({ length: Math.round(Math.min(70, Math.max(24, W * H / 20000))) }, () => make(W, H, r, true)); },
    frame(ctx, t, dt, P, W, H, pal) {
      const tx = P.on ? P.x : W * 0.5, ty = P.on ? P.y : H * 0.35;
      ctx.lineCap = 'square';
      for (const g of list) {
        const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy) || 1;
        const pull = P.on ? (d < 320 ? 90 : 20) : 6;
        g.vx += (dx / d) * pull * dt; g.vy += (dy / d) * pull * dt - 4 * dt;
        g.vx *= 1 - dt * 0.9; g.vy *= 1 - dt * 0.9;
        g.x += g.vx * dt; g.y += g.vy * dt; g.life += dt;
        if ((P.on && d < 14) || g.y < -30 || g.x < -40 || g.x > W + 40) Object.assign(g, make(W, H, Math.random, false), { x: Math.random() * W });
        const fadeIn = Math.min(1, g.life * 1.5), near = P.on ? Math.max(0, 1 - d / 320) : 0;
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot);
        ctx.strokeStyle = pal.light ? `rgba(60,40,140,${(0.26 + near * 0.4) * fadeIn})` : `rgba(200,190,255,${(0.3 + near * 0.55) * fadeIn})`;
        ctx.lineWidth = Math.max(1.2, g.s * 0.16);
        if (!pal.light && near > 0.3) { ctx.shadowColor = pal.b; ctx.shadowBlur = 8 * near; }
        const k = g.s / 3;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of RUNES[g.rune]) { ctx.moveTo((x1 - 1) * k, (y1 - 1.5) * k); ctx.lineTo((x2 - 1) * k, (y2 - 1.5) * k); }
        ctx.stroke(); ctx.restore();
      }
    }
  };
}

const SCENES = { player: orbs, nicks: nametags, leaderboards: pillars, download: portal, tracker: radar, unlock: glyphs };

export function startBackdrop(kind) {
  if (typeof window === 'undefined' || !SCENES[kind] || document.getElementById('backdrop')) return;
  const cv = document.createElement('canvas');
  cv.id = 'backdrop';
  cv.dataset.kind = kind;
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  const scene = SCENES[kind]();
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, pal = palette();
  const P = { x: -9999, y: -9999, on: false };

  function layout() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    scene.init(W, H);
  }
  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    scene.frame(ctx, t, dt, P, W, H, pal);
  }
  function frame(t) {
    raf = 0;
    if (document.hidden || cv.hidden) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    draw(t, dt);
    if (!reduce()) raf = requestAnimationFrame(frame);
  }
  function apply() {
    const on = document.documentElement.dataset.effects !== 'off';
    cv.hidden = !on;
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (!on) return;
    pal = palette();
    if (reduce()) draw(performance.now(), 0.016);
    else raf = requestAnimationFrame(frame);
  }
  layout();
  addEventListener('resize', () => { layout(); apply(); });
  addEventListener('pointermove', e => { P.x = e.clientX; P.y = e.clientY; P.on = e.pointerType !== 'touch' || e.pressure > 0; }, { passive: true });
  document.addEventListener('pointerleave', () => { P.on = false; });
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { P.x = e.clientX; P.y = e.clientY; P.on = true; }
    if (scene.click && onBackground(e.target) && !cv.hidden) { scene.click(e.clientX, e.clientY); if (reduce()) draw(performance.now(), 0.016); }
  });
  addEventListener('pointerup', e => { if (e.pointerType === 'touch') P.on = false; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  prefs.subscribe(() => requestAnimationFrame(apply));
  apply();
}
