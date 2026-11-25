// First-load intro, once per page per tab. Every page has its own short scene
// about what the page does (a skin scan on Player lookup, a decrypting name on
// Nick Finder, rising podiums on Leaderboards...), and each ends by opening
// the page. Drawn on one canvas over the page (no stylesheet needed, so it
// works under every page's CSP) and never blocks clicks. Home plays its own in
// the 3D scene (pages/index.jsx). Skipped with reduced motion or effects off.
const KEY = 'prismIntro:' + (typeof location !== 'undefined' ? location.pathname.replace(/\/$/, '/index.html') : '');

// True the first time this page opens in this tab (and marks it seen).
export function firstLoad() {
  const html = document.documentElement;
  if (preview()) return true;
  const reduce = html.dataset.motion ? html.dataset.motion === 'reduce' : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || html.dataset.effects === 'off') return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
  } catch { return false; }
  return true;
}

const clamp = x => Math.min(1, Math.max(0, x));
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeIn = x => x * x * x;
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeBack = x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
// ?intro=<scene> plays that page's intro on any load, to preview it.
const preview = () => { try { return new URLSearchParams(location.search).get('intro'); } catch { return null; } };
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const TAU = Math.PI * 2;

export function startIntro() {
  const html = document.documentElement;
  const done = () => html.classList.remove('intro-wait', 'intro-hold');
  if (!document.body || !firstLoad()) { done(); return; }
  const cs = getComputedStyle(html);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  const light = html.dataset.surface === 'light';
  const bg = v('--bg', light ? '#f3f5fa' : '#0c0f17');
  const cols = [v('--accent', '#5ee7ff'), v('--accent-2', '#a98bff'), v('--accent-3', '#ffc46b')];
  const core = light ? '#1d2433' : '#ffffff';

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '2147483000', pointerEvents: 'none', visibility: 'visible' });
  document.body.appendChild(cv);
  html.classList.add('intro-hold');
  html.classList.remove('intro-wait');
  const ctx = cv.getContext('2d');
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const kit = makeKit(ctx, W, H, cols, core, light);
  const name = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  const scene = (SCENES[preview()] || SCENES[name] || SCENES.prism)(kit);
  const reveal = scene.dur || 0.6;

  const t0 = performance.now();
  let hold = true;
  function frame(now) {
    const t = (now - t0) / 1000;
    if (t >= scene.T) { cv.remove(); done(); return; }
    if (hold && t > scene.at + 0.1) { hold = false; html.classList.remove('intro-hold'); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const r = easeInOut(clamp((t - scene.at) / reveal));
    if (r > 0) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; scene.cut(r); }
    ctx.globalCompositeOperation = scene.solid || light ? 'source-over' : 'lighter';
    scene.draw(t, 1 - clamp((t - scene.at - 0.1) / 0.45));
    requestAnimationFrame(frame);
  }
  frame(t0);
  // If frames never come (a hidden tab), don't leave the page covered.
  setTimeout(() => { if (cv.isConnected && document.hidden) { cv.remove(); done(); } }, 2500);
}

// Drawing helpers shared by the scenes.
function makeKit(ctx, W, H, cols, core, light) {
  const far = (x, y) => Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 90;
  const k = {
    ctx, W, H, cols, core, light, m: Math.min(W, H),
    beam(a, b, color, w, alpha) {
      if (alpha <= 0.002) return;
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      for (const [s, al] of [[7, 0.08], [2.6, 0.28], [1, 1]]) {
        ctx.globalAlpha = alpha * al; ctx.lineWidth = w * s;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    },
    glow(p, r, color, alpha) {
      if (alpha <= 0.002 || r <= 0) return;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    },
    path(pts, close = true) {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (close) ctx.closePath();
    },
    spectrum(x0, y0, x1, y1) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
      return g;
    },
    // The page opens as a soft circle growing from a point.
    cutCircle(x, y, r0 = 0) {
      const R = far(x, y);
      return r => {
        const rad = r0 + r * (R - r0);
        const g = ctx.createRadialGradient(x, y, Math.max(0, rad - 90), x, y, rad);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      };
    },
    // ...or wiped open left to right behind a moving edge.
    cutWipe() {
      return r => {
        const x = r * (W + 240) - 120;
        const g = ctx.createLinearGradient(x - 120, 0, x, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, Math.max(0, x), H);
      };
    },
    text(str, x, y, size, color, alpha, weight = 700, align = 'center') {
      if (alpha <= 0.002) return;
      ctx.font = `${weight} ${size}px ${MONO}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillText(str, x, y);
    }
  };
  return k;
}

const SCENES = {
  // Default: white light falls on a small prism and splits into three.
  prism(k) {
    const { ctx, W, H, cols, core } = k;
    const P = { x: W / 2, y: H * 0.4 }, s = Math.max(54, Math.min(92, k.m * 0.1)), h = s * 0.866;
    const apex = { x: P.x, y: P.y - h * 2 / 3 }, bl = { x: P.x - s / 2, y: P.y + h / 3 }, br = { x: P.x + s / 2, y: P.y + h / 3 };
    const entry = lerp(apex, bl, 0.55), src = { x: entry.x - (entry.y + 20) * 0.42, y: -20 };
    const exits = [0.28, 0.5, 0.72].map(t => lerp(bl, br, t)), angles = [-0.42, 0, 0.42], far = Math.hypot(W, H);
    return {
      T: 1.45, at: 0.85, cut: k.cutCircle(P.x, P.y),
      draw(t, f) {
        const pin = easeOut(clamp((t - 0.05) / 0.35)), drop = easeOut(clamp((t - 0.12) / 0.38));
        const hit = t > 0.5 ? Math.exp(-(t - 0.5) * 6) : 0, split = easeOut(clamp((t - 0.52) / 0.45));
        k.beam(src, lerp(src, entry, drop), core, 2, 0.95 * f);
        exits.forEach((e, i) => {
          k.beam(entry, lerp(entry, e, clamp((t - 0.5) / 0.12)), cols[i], 1.1, 0.7 * f);
          const end = { x: e.x + Math.sin(angles[i]) * far * split, y: e.y + Math.cos(angles[i]) * far * split };
          if (split > 0) k.beam(e, end, cols[i], 2.4, 0.9 * f);
          k.glow(e, s * 0.45, cols[i], 0.5 * split * f);
        });
        k.glow(entry, s * (0.7 + hit * 1.6), core, (0.35 + hit * 0.8) * f * clamp(drop * 3 - 2));
        if (pin > 0) {
          ctx.save(); ctx.translate(P.x, P.y); ctx.scale(0.6 + 0.4 * pin, 0.6 + 0.4 * pin); ctx.translate(-P.x, -P.y);
          ctx.globalAlpha = pin * f; k.path([apex, br, bl]);
          ctx.fillStyle = 'rgba(170,200,255,0.07)'; ctx.fill();
          ctx.strokeStyle = k.spectrum(bl.x, apex.y, br.x, bl.y); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
          ctx.restore();
        }
      }
    };
  },

  // Player lookup: a player builds itself out of pixels, then a scan line reads it.
  player(k) {
    const { ctx, W, H, cols, core } = k;
    const u = Math.max(5, Math.min(14, H * 0.5 / 32)), C = { x: W / 2, y: H * 0.47 };
    const ox = C.x - 8 * u, oy = C.y - 16 * u, cells = [];
    const add = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y, d: Math.random() * 0.4 + y * 0.004 }); };
    add(4, 0, 8, 8); add(4, 8, 8, 12); add(0, 8, 4, 12); add(12, 8, 4, 12); add(4, 20, 4, 12); add(8, 20, 4, 12);
    return {
      T: 1.8, at: 1.15, cut: k.cutCircle(C.x, C.y),
      draw(t, f) {
        k.glow(C, 24 * u, cols[1], 0.12 * f * clamp(t / 0.4));
        const scan = clamp((t - 0.62) / 0.45) * 36 - 2;
        for (const c of cells) {
          const a = easeOut(clamp((t - 0.04 - c.d) / 0.3));
          if (!a) continue;
          const lit = Math.max(0, 1 - Math.abs(c.y - scan) / 2.5);
          ctx.globalAlpha = f * a * (0.45 + lit * 0.55 + (c.y < scan ? 0.25 : 0));
          ctx.fillStyle = lit > 0.55 ? core : cols[c.y < 8 ? 0 : c.y < 20 ? 1 : 2];
          ctx.fillRect(ox + c.x * u + 1, oy + c.y * u + 1 - (1 - a) * 40, u - 2, u - 2);
        }
        if (scan > -2 && scan < 34) {
          const y = oy + scan * u;
          k.beam({ x: ox - 7 * u, y }, { x: ox + 23 * u, y }, core, 1.5, 0.9 * f);
          k.glow({ x: C.x, y }, 12 * u, cols[0], 0.3 * f);
        }
        // Corner marks lock on round the figure.
        const lock = easeOut(clamp((t - 0.25) / 0.4)), pad = (1 - lock) * 50 + 2 * u, L = 3 * u;
        const box = [ox - pad, oy - pad, ox + 16 * u + pad, oy + 32 * u + pad];
        ctx.strokeStyle = cols[0]; ctx.lineWidth = 2; ctx.globalAlpha = lock * f * 0.9;
        [[box[0], box[1], 1, 1], [box[2], box[1], -1, 1], [box[0], box[3], 1, -1], [box[2], box[3], -1, -1]].forEach(([x, y, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
        });
      }
    };
  },

  // Nick Finder: scrambled names decrypt into the real one; a sweep of light opens the page.
  nicks(k) {
    const { ctx, W, H, cols, core } = k;
    const C = { x: W / 2, y: H * 0.45 }, word = 'DENICKED', fs = Math.min(W * 0.085, 70), cw = fs * 0.64;
    const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789_';
    const rnd = () => CH[(Math.random() * CH.length) | 0];
    const field = Array.from({ length: Math.round(W * H / 26000) }, () => ({ x: Math.random() * W, y: Math.random() * H, n: 6 + ((Math.random() * 9) | 0), c: (Math.random() * 3) | 0 }));
    let tick = -1, scr = [], names = [];
    const at = 1.0, dur = 0.65;
    return {
      T: 1.75, at, dur, cut: k.cutWipe(),
      draw(t, f) {
        const n = Math.floor(t * 18);
        if (n !== tick) { tick = n; scr = [...word].map(rnd); names = field.map(r => Array.from({ length: r.n }, rnd).join('')); }
        field.forEach((r, i) => k.text(names[i], r.x, r.y, 13, cols[r.c], 0.16 * f * clamp(t / 0.3), 600, 'left'));
        const x0 = C.x - (word.length - 1) * cw / 2;
        [...word].forEach((ch, i) => {
          const when = 0.38 + i * 0.065, ok = t > when, x = x0 + i * cw;
          k.text(ok ? ch : scr[i], x, C.y, fs, ok ? core : cols[i % 3], f * (ok ? 1 : 0.55 * clamp(t / 0.2)), 800);
          if (ok) k.glow({ x, y: C.y }, fs, cols[i % 3], 0.35 * f * Math.exp(-(t - when) * 5));
        });
        const ul = easeOut(clamp((t - 0.15) / 0.5)), half = ul * word.length * cw / 2;
        k.beam({ x: C.x - half, y: C.y + fs * 0.72 }, { x: C.x + half, y: C.y + fs * 0.72 }, cols[1], 1, 0.7 * f);
        if (t > at - 0.05) {
          const x = easeInOut(clamp((t - at) / dur)) * (W + 240) - 120;
          const a = 1 - clamp((t - at - dur + 0.1) / 0.2);
          k.beam({ x, y: -10 }, { x, y: H + 10 }, core, 2, a);
          k.glow({ x, y: C.y }, 160, cols[0], 0.3 * a);
        }
      }
    };
  },

  // Leaderboards: three podiums rise, a crown drops on first place and lights it up.
  leaderboards(k) {
    const { ctx, W, H, cols, core } = k;
    const pw = Math.max(70, Math.min(W * 0.11, 130)), base = H * 0.8, cx = W / 2;
    const P = [
      { x: cx, h: H * 0.34, c: cols[2], n: '1', d: 0.3 },
      { x: cx - pw * 1.15, h: H * 0.24, c: '#d5deeb', n: '2', d: 0.16 },
      { x: cx + pw * 1.15, h: H * 0.16, c: '#e39a5f', n: '3', d: 0.04 }
    ];
    const crownY = base - P[0].h - pw * 0.5, land = 0.92;
    const crown = (x, y, w, alpha) => {
      k.path([{ x: x - w / 2, y: y + w * 0.28 }, { x: x - w / 2, y: y - w * 0.18 }, { x: x - w * 0.25, y: y + w * 0.04 }, { x, y: y - w * 0.32 },
        { x: x + w * 0.25, y: y + w * 0.04 }, { x: x + w / 2, y: y - w * 0.18 }, { x: x + w / 2, y: y + w * 0.28 }]);
      ctx.globalAlpha = alpha * 0.9; ctx.fillStyle = cols[2]; ctx.fill();
      ctx.globalAlpha = alpha; ctx.strokeStyle = core; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    };
    return {
      T: 1.8, at: 1.1, cut: k.cutCircle(cx, crownY),
      draw(t, f) {
        if (t > land) {
          const g = easeOut(clamp((t - land) / 0.3)), hit = Math.exp(-(t - land) * 5);
          for (let i = 0; i < 11; i++) {
            const a = -Math.PI / 2 + (i - 5) * 0.21 + Math.sin(t * 2 + i) * 0.03;
            k.beam({ x: cx, y: crownY }, { x: cx + Math.cos(a) * H * g, y: crownY + Math.sin(a) * H * g }, cols[i % 3], 1.1, 0.4 * f);
          }
          k.glow({ x: cx, y: crownY }, pw * (1.6 + hit * 2), cols[2], (0.3 + hit * 0.6) * f);
        }
        P.forEach(p => {
          const a = easeBack(clamp((t - p.d) / 0.45)), h = p.h * a, y = base - h, x = p.x - pw / 2;
          if (h <= 0) return;
          const g = ctx.createLinearGradient(0, y, 0, base);
          g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.32 * f; ctx.fillStyle = g; ctx.fillRect(x, y, pw, h);
          ctx.globalAlpha = f; ctx.fillStyle = p.c; ctx.fillRect(x, y, pw, 2);
          k.glow({ x: p.x, y }, pw * 0.7, p.c, 0.25 * f);
          k.text(p.n, p.x, y + pw * 0.45, pw * 0.42, p.c, 0.95 * f * clamp((t - p.d - 0.2) / 0.2), 800);
        });
        const c = clamp((t - 0.58) / (land - 0.58));
        if (c > 0) crown(cx, crownY - (1 - easeIn(c)) * H * 0.55, pw * 0.85, f * clamp(c * 4));
      }
    };
  },

  // Download: a portal opens, the download arrow drops in, and the light pours out.
  download(k) {
    const { ctx, W, H, cols, core } = k;
    const C = { x: W / 2, y: H * 0.46 }, R = k.m * 0.13, drop = 0.82;
    return {
      T: 1.7, at: 0.92, dur: 0.65, cut: k.cutCircle(C.x, C.y, R * 0.5),
      draw(t, f) {
        const open = easeOut(clamp(t / 0.45)), rot = t * 4.2;
        k.glow(C, R * 1.6, cols[1], 0.3 * open * f);
        for (let i = 0; i < 3; i++) {
          const dir = i % 2 ? -1 : 1, a0 = rot * dir + i * 2.1;
          ctx.strokeStyle = cols[i]; ctx.lineCap = 'round';
          for (const [w, al] of [[10, 0.12], [3, 1]]) {
            ctx.lineWidth = w; ctx.globalAlpha = al * f;
            ctx.beginPath(); ctx.arc(C.x, C.y, R + i * 7, a0, a0 + open * Math.PI * 1.55); ctx.stroke();
          }
        }
        for (let i = 0; i < 18; i++) {
          const a = i / 18 * TAU + t * 2.5, rr = R * (0.15 + ((i * 0.37 + t * 0.9) % 1) * 0.75);
          ctx.globalAlpha = 0.6 * open * f; ctx.fillStyle = cols[i % 3];
          ctx.fillRect(C.x + Math.cos(a) * rr - 1.5, C.y + Math.sin(a) * rr - 1.5, 3, 3);
        }
        const a = clamp((t - 0.35) / (drop - 0.35));
        if (a > 0 && a < 1) {
          const y = C.y - R * 2.6 + easeIn(a) * R * 2.6, s = R * 0.55 * (1 - a * 0.7);
          k.beam({ x: C.x, y: y - s }, { x: C.x, y: y + s * 0.5 }, core, 2.4, f);
          k.beam({ x: C.x - s * 0.55, y: y - s * 0.05 }, { x: C.x, y: y + s * 0.5 }, core, 2.4, f);
          k.beam({ x: C.x + s * 0.55, y: y - s * 0.05 }, { x: C.x, y: y + s * 0.5 }, core, 2.4, f);
        }
        if (t > drop) k.glow(C, R * (1.5 + (t - drop) * 6), core, 0.9 * Math.exp(-(t - drop) * 5) * f);
      }
    };
  },

  // Tracker: a radar sweeps, rings out each tracked player, cheaters in red.
  tracker(k) {
    const { ctx, W, H, cols, core } = k;
    const C = { x: W / 2, y: H * 0.46 }, R = k.m * 0.3, s0 = 0.12, sd = 0.95, turns = 1.15;
    const blips = Array.from({ length: 8 }, (_, i) => {
      const a = Math.random() * TAU, norm = ((a + Math.PI / 2) % TAU + TAU) % TAU;
      return { a, r: R * (0.22 + Math.random() * 0.72), bad: i < 2, at: s0 + norm / (TAU * turns) * sd };
    });
    return {
      T: 1.8, at: 1.12, cut: k.cutCircle(C.x, C.y),
      draw(t, f) {
        const g = easeOut(clamp(t / 0.35));
        ctx.lineWidth = 1; ctx.strokeStyle = cols[0];
        for (let i = 1; i <= 4; i++) { ctx.globalAlpha = 0.28 * f; ctx.beginPath(); ctx.arc(C.x, C.y, R * i / 4 * g, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 0.14 * f; ctx.beginPath(); ctx.moveTo(C.x - R * g, C.y); ctx.lineTo(C.x + R * g, C.y); ctx.moveTo(C.x, C.y - R * g); ctx.lineTo(C.x, C.y + R * g); ctx.stroke();
        const sw = -Math.PI / 2 + clamp((t - s0) / sd) * TAU * turns;
        if (t > s0) {
          for (let j = 0; j < 16; j++) {
            ctx.globalAlpha = 0.16 * (1 - j / 16) * f; ctx.fillStyle = cols[0];
            ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.arc(C.x, C.y, R, sw - (j + 1) * 0.05, sw - j * 0.05); ctx.closePath(); ctx.fill();
          }
          k.beam(C, { x: C.x + Math.cos(sw) * R, y: C.y + Math.sin(sw) * R }, core, 1.4, f);
        }
        blips.forEach(b => {
          if (t < b.at) return;
          const p = { x: C.x + Math.cos(b.a) * b.r, y: C.y + Math.sin(b.a) * b.r }, c = b.bad ? '#ff5d6c' : cols[2], e = t - b.at;
          k.glow(p, 18, c, 0.8 * f);
          ctx.globalAlpha = f; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fill();
          ctx.globalAlpha = Math.exp(-e * 3) * f; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + e * 70, 0, TAU); ctx.stroke();
        });
        k.glow(C, 12, core, 0.8 * f * g);
      }
    };
  },

  // Unlock: a key slides into the lock, turns, and the shackle springs open.
  unlock(k) {
    const { ctx, W, H, cols, core } = k;
    const s = k.m * 0.17, C = { x: W / 2, y: H * 0.48 }, hole = { x: C.x, y: C.y + s * 0.12 }, pop = 0.88;
    const grad = k.spectrum(C.x - s * 0.6, C.y - s, C.x + s * 0.6, C.y + s * 0.6);
    return {
      T: 1.75, at: 1.0, cut: k.cutCircle(hole.x, hole.y),
      draw(t, f) {
        const inA = easeOut(clamp(t / 0.3));
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = grad;
        // Shackle (lifts and swings on the left leg).
        const lift = easeBack(clamp((t - pop) / 0.25));
        ctx.save(); ctx.translate(C.x - s * 0.36, C.y - s * 0.3 - lift * s * 0.24); ctx.rotate(-lift * 0.35);
        ctx.globalAlpha = inA * f; ctx.lineWidth = s * 0.11;
        ctx.beginPath(); ctx.moveTo(0, s * 0.02); ctx.lineTo(0, -s * 0.18); ctx.arc(s * 0.36, -s * 0.18, s * 0.36, Math.PI, TAU); ctx.lineTo(s * 0.72, s * 0.02); ctx.stroke();
        ctx.restore();
        // Body.
        const bx = C.x - s * 0.62, by = C.y - s * 0.32, bw = s * 1.24, bh = s * 0.92, r = s * 0.16;
        ctx.globalAlpha = inA * f;
        ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, r); ctx.arcTo(bx + bw, by + bh, bx, by + bh, r); ctx.arcTo(bx, by + bh, bx, by, r); ctx.arcTo(bx, by, bx + bw, by, r); ctx.closePath();
        ctx.fillStyle = 'rgba(160,190,255,0.08)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
        // Keyhole, turning once the key is in.
        const turn = easeInOut(clamp((t - 0.6) / 0.24)) * Math.PI / 2;
        ctx.save(); ctx.translate(hole.x, hole.y); ctx.rotate(turn);
        ctx.globalAlpha = f; ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.08, 0, TAU); ctx.fill();
        k.path([{ x: -s * 0.045, y: -s * 0.02 }, { x: s * 0.045, y: -s * 0.02 }, { x: s * 0.07, y: s * 0.17 }, { x: -s * 0.07, y: s * 0.17 }]); ctx.fill();
        ctx.restore();
        k.glow(hole, s * 0.5, cols[0], (0.25 + clamp((t - 0.55) / 0.3) * 0.4) * f);
        // Key slides in from the left and vanishes into the hole.
        const slide = easeOut(clamp((t - 0.15) / 0.42)), gone = 1 - clamp((t - 0.6) / 0.12);
        if (gone > 0) {
          const kx = hole.x - s * 2.8 + slide * s * 2.75, ky = hole.y - s * 0.05;
          k.beam({ x: kx - s * 0.6, y: ky }, { x: kx, y: ky }, cols[2], 2.6, gone * f);
          k.beam({ x: kx - s * 0.18, y: ky }, { x: kx - s * 0.18, y: ky + s * 0.12 }, cols[2], 2.2, gone * f);
          k.beam({ x: kx - s * 0.32, y: ky }, { x: kx - s * 0.32, y: ky + s * 0.09 }, cols[2], 2.2, gone * f);
          ctx.globalAlpha = gone * f; ctx.strokeStyle = cols[2]; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(kx - s * 0.78, ky, s * 0.17, 0, TAU); ctx.stroke();
        }
        if (t > pop) {
          const e = t - pop, g = easeOut(clamp(e / 0.3));
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * TAU + 0.2;
            k.beam({ x: hole.x + Math.cos(a) * s * 0.3, y: hole.y + Math.sin(a) * s * 0.3 }, { x: hole.x + Math.cos(a) * (s * 0.3 + g * H), y: hole.y + Math.sin(a) * (s * 0.3 + g * H) }, cols[i % 3], 1.2, 0.5 * f);
          }
          k.glow(hole, s * (1 + e * 5), core, Math.exp(-e * 5) * f);
        }
      }
    };
  },

  // Atlas: a Bed Wars map builds itself block by block, then the camera dives in.
  atlas(k) {
    const { ctx, W, H, cols } = k;
    const C = { x: W / 2, y: H * 0.46 }, tw = Math.max(18, k.m * 0.05), th = tw * 0.5, ht = tw * 0.36;
    const tiles = [];
    const island = (cx, cy, rad, color) => { for (let x = -rad; x <= rad; x++) for (let y = -rad; y <= rad; y++) if (Math.abs(x) + Math.abs(y) <= rad + (rad > 1 ? 1 : 0)) tiles.push({ x: cx + x, y: cy + y, c: x === 0 && y === 0 && rad > 1 ? cols[2] : color }); };
    island(0, 0, 3, '#4f9a64');
    [[6, 0, '#ff5d6c'], [-6, 0, '#5aa9ff'], [0, 6, '#6ee07a'], [0, -6, '#ffd75a']].forEach(([x, y, c]) => island(x, y, 1, c));
    [[4, 0], [5, 0], [-4, 0], [-5, 0], [0, 4], [0, 5], [0, -4], [0, -5]].forEach(([x, y]) => tiles.push({ x, y, c: '#b9a27a', low: true }));
    tiles.forEach(p => { p.d = Math.hypot(p.x, p.y) * 0.055 + Math.random() * 0.05; });
    tiles.sort((a, b) => a.x + a.y - (b.x + b.y));
    const shade = (hex, k2) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k2 | 0},${((n >> 8) & 255) * k2 | 0},${(n & 255) * k2 | 0})`; };
    return {
      T: 1.8, at: 1.0, dur: 0.7, solid: true, cut: k.cutCircle(C.x, C.y),
      draw(t, f) {
        const z = 1 + easeIn(clamp((t - 0.9) / 0.8)) * 5;
        ctx.save(); ctx.translate(C.x, C.y); ctx.scale(z, z); ctx.translate(-C.x, -C.y);
        k.glow({ x: C.x, y: C.y + th }, tw * 9, cols[1], 0.18 * f * clamp(t / 0.3));
        for (const p of tiles) {
          const a = easeBack(clamp((t - 0.05 - p.d) / 0.35));
          if (a <= 0) continue;
          const hh = p.low ? ht * 0.4 : ht, sx = C.x + (p.x - p.y) * tw * 0.5, sy = C.y + (p.x + p.y) * th * 0.5 - (1 - a) * H * 0.35 + (p.low ? ht * 0.6 : 0);
          const c = p.c.startsWith('#') && p.c.length === 7 ? p.c : '#ffc46b';
          ctx.globalAlpha = f * clamp(a * 3);
          k.path([{ x: sx - tw / 2, y: sy }, { x: sx, y: sy + th / 2 }, { x: sx, y: sy + th / 2 + hh }, { x: sx - tw / 2, y: sy + hh }]); ctx.fillStyle = shade(c, 0.55); ctx.fill();
          k.path([{ x: sx + tw / 2, y: sy }, { x: sx, y: sy + th / 2 }, { x: sx, y: sy + th / 2 + hh }, { x: sx + tw / 2, y: sy + hh }]); ctx.fillStyle = shade(c, 0.38); ctx.fill();
          k.path([{ x: sx, y: sy - th / 2 }, { x: sx + tw / 2, y: sy }, { x: sx, y: sy + th / 2 }, { x: sx - tw / 2, y: sy }]); ctx.fillStyle = c; ctx.fill();
        }
        ctx.restore();
      }
    };
  },

  // Cosmetics: a mystery box rattles, bursts open, and rarity-coloured sparks fly out.
  cosmetics(k) {
    const { ctx, W, H, cols, core } = k;
    const s = k.m * 0.1, C = { x: W / 2, y: H * 0.52 }, top = { x: C.x, y: C.y - s * 0.5 }, open = 0.62;
    const rar = ['#b8c0d0', '#5aa9ff', '#b77bff', cols[2]];
    const parts = Array.from({ length: 80 }, () => ({ a: -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v: H * (0.5 + Math.random() * 1.1), sz: 3 + Math.random() * 6, c: rar[(Math.random() * 4) | 0], sp: (Math.random() - 0.5) * 14 }));
    const grad = k.spectrum(C.x - s, C.y - s, C.x + s, C.y + s);
    return {
      T: 1.8, at: 0.95, cut: k.cutCircle(top.x, top.y),
      draw(t, f) {
        const inA = easeOut(clamp(t / 0.25)), shake = t > 0.12 && t < open ? Math.sin(t * 70) * 0.07 * clamp((t - 0.12) / 0.15) : 0;
        if (t > open) {
          const e = t - open, g = easeOut(clamp(e / 0.25));
          const beam = ctx.createLinearGradient(0, top.y, 0, top.y - H * 0.7);
          beam.addColorStop(0, cols[2]); beam.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.35 * g * f; ctx.fillStyle = beam;
          k.path([{ x: top.x - s * 0.7, y: top.y }, { x: top.x + s * 0.7, y: top.y }, { x: top.x + s * 2.6, y: top.y - H * 0.8 }, { x: top.x - s * 2.6, y: top.y - H * 0.8 }]); ctx.fill();
          k.glow(top, s * (1.2 + e * 6), core, Math.exp(-e * 4.5) * f);
          parts.forEach(p => {
            const x = top.x + Math.cos(p.a) * p.v * e, y = top.y + Math.sin(p.a) * p.v * e + 0.5 * H * 1.6 * e * e;
            ctx.save(); ctx.translate(x, y); ctx.rotate(p.sp * e); ctx.globalAlpha = f * (1 - clamp((e - 0.7) / 0.4)); ctx.fillStyle = p.c; ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz); ctx.restore();
          });
        }
        ctx.save(); ctx.translate(C.x, C.y + s); ctx.rotate(shake); ctx.translate(-C.x, -(C.y + s));
        const v = (dx, dy) => ({ x: C.x + dx * s, y: C.y + dy * s });
        ctx.globalAlpha = inA * f; ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        k.path([v(-0.87, -0.5), v(0, 0), v(0, 1), v(-0.87, 0.5)]); ctx.fillStyle = 'rgba(169,139,255,0.16)'; ctx.fill(); ctx.stroke();
        k.path([v(0, 0), v(0.87, -0.5), v(0.87, 0.5), v(0, 1)]); ctx.fillStyle = 'rgba(94,231,255,0.1)'; ctx.fill(); ctx.stroke();
        // Lid: flies off when it opens.
        const lid = easeOut(clamp((t - open) / 0.35));
        const lc = v(0, -0.5);
        ctx.translate(lc.x + lid * s * 1.1, lc.y - lid * s * 1.8); ctx.rotate(lid * 0.9); ctx.translate(-lc.x, -lc.y);
        ctx.globalAlpha = inA * f * (1 - lid);
        k.path([v(0, -1), v(0.87, -0.5), v(0, 0), v(-0.87, -0.5)]); ctx.fillStyle = 'rgba(255,196,107,0.18)'; ctx.fill(); ctx.stroke();
        ctx.restore();
        k.text('?', C.x - s * 0.43, C.y + s * 0.25, s * 0.5, core, inA * f * (t < open ? 0.85 : 0), 800);
      }
    };
  },

  // Recordings: a camera viewfinder, REC, a running timecode, and a film shutter opens.
  recordings(k) {
    const { ctx, W, H, cols, core } = k;
    const m = Math.max(28, k.m * 0.07), C = { x: W / 2, y: H * 0.46 }, bars = 8;
    const pad = n => String(n).padStart(2, '0');
    return {
      T: 1.7, at: 0.98, cut: r => {
        const bh = H / bars;
        for (let i = 0; i < bars; i++) {
          const ri = easeInOut(clamp(r * 1.35 - i * 0.045)) * W;
          ctx.fillStyle = '#000';
          if (i % 2) ctx.fillRect(0, i * bh, ri, bh + 1); else ctx.fillRect(W - ri, i * bh, ri, bh + 1);
        }
      },
      draw(t, f) {
        const g = easeOut(clamp(t / 0.35)), inset = (1 - g) * -m * 2 + m, L = m * 1.1;
        ctx.strokeStyle = core; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85 * f * g;
        [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]].forEach(([x, y, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
        });
        if (Math.sin(t * 14) > -0.3) { ctx.globalAlpha = f * g; ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(inset + m * 0.6, inset + m * 0.75, m * 0.16, 0, TAU); ctx.fill(); k.glow({ x: inset + m * 0.6, y: inset + m * 0.75 }, m * 0.6, '#ff4d5e', 0.5 * f * g); }
        k.text('REC', inset + m * 0.95, inset + m * 0.77, m * 0.36, core, f * g, 700, 'left');
        const fr = Math.floor(t * 600);
        k.text(`00:00:${pad(Math.floor(fr / 60) % 60)}:${pad(fr % 60)}`, W - inset - m * 0.3, inset + m * 0.77, m * 0.32, core, 0.8 * f * g, 600, 'right');
        // Play button in the middle, ringed by the spectrum.
        const p = easeBack(clamp((t - 0.15) / 0.4)), s = m * 1.1 * p;
        if (p > 0) {
          ctx.globalAlpha = f; ctx.strokeStyle = k.spectrum(C.x - s * 1.4, C.y, C.x + s * 1.4, C.y); ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(C.x, C.y, s * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * clamp((t - 0.15) / 0.7)); ctx.stroke();
          k.path([{ x: C.x - s * 0.42, y: C.y - s * 0.6 }, { x: C.x + s * 0.65, y: C.y }, { x: C.x - s * 0.42, y: C.y + s * 0.6 }]);
          ctx.fillStyle = core; ctx.globalAlpha = 0.95 * f; ctx.fill();
          k.glow(C, s * 2.4, cols[1], 0.3 * f);
        }
        // Timeline with a playhead running along it.
        const y = H - inset - m * 0.2, x0 = inset + m * 0.4, x1 = W - inset - m * 0.4, run = easeInOut(clamp((t - 0.2) / 0.75));
        ctx.globalAlpha = 0.25 * f * g; ctx.fillStyle = core; ctx.fillRect(x0, y - 1.5, x1 - x0, 3);
        ctx.globalAlpha = f * g; ctx.fillStyle = k.spectrum(x0, 0, x1, 0); ctx.fillRect(x0, y - 1.5, (x1 - x0) * run, 3);
        const hx = x0 + (x1 - x0) * run;
        k.glow({ x: hx, y }, 22, cols[0], 0.8 * f * g);
        ctx.globalAlpha = f * g; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(hx, y, 5, 0, TAU); ctx.fill();
      }
    };
  }
};
