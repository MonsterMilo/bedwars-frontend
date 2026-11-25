// First-load intro, once per page per tab: a white beam falls onto a small
// glass prism, splits into the three accent colours, and the light opens the
// page from the prism outwards. Drawn on one canvas over the page (no
// stylesheet needed, so it works under every page's CSP) and never blocks
// clicks. Skipped with reduced motion or effects off.
const KEY = 'prismIntro:' + (typeof location !== 'undefined' ? location.pathname.replace(/\/$/, '/index.html') : '');

// True the first time this page opens in this tab (and marks it seen).
export function firstLoad() {
  const html = document.documentElement;
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
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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

  // The prism sits a little above the middle; light falls from the upper left.
  const P = { x: W / 2, y: H * 0.4 }, s = Math.max(54, Math.min(92, Math.min(W, H) * 0.1));
  const h = s * 0.866;
  const apex = { x: P.x, y: P.y - h * 2 / 3 }, bl = { x: P.x - s / 2, y: P.y + h / 3 }, br = { x: P.x + s / 2, y: P.y + h / 3 };
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const entry = lerp(apex, bl, 0.55);
  const src = { x: entry.x - (entry.y + 20) * 0.42, y: -20 };
  const exits = [0.28, 0.5, 0.72].map(t => lerp(bl, br, t));
  const angles = [-0.42, 0, 0.42];
  const far = Math.hypot(W, H);
  const maxR = Math.max(Math.hypot(P.x, P.y), Math.hypot(W - P.x, P.y), Math.hypot(P.x, H - P.y), Math.hypot(W - P.x, H - P.y)) + 80;

  const beam = (a, b, color, w, alpha) => {
    if (alpha <= 0.002) return;
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (const [k, al] of [[7, 0.08], [2.6, 0.28], [1, 1]]) {
      ctx.globalAlpha = alpha * al; ctx.lineWidth = w * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };
  const glow = (p, r, color, alpha) => {
    if (alpha <= 0.002) return;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  };

  const T = 1.45, t0 = performance.now();
  let hold = true;
  function frame(now) {
    const t = (now - t0) / 1000;
    if (t >= T) { cv.remove(); done(); return; }
    if (hold && t > 0.95) { hold = false; html.classList.remove('intro-hold'); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // The light opens the page from the prism outwards.
    const open = easeInOut(clamp((t - 0.85) / 0.6));
    if (open > 0) {
      const r = open * maxR;
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(P.x, P.y, Math.max(0, r - 90), P.x, P.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    const fade = 1 - clamp((t - 1.0) / 0.4);
    // The prism appears, then the white light falls onto its face.
    const pin = easeOut(clamp((t - 0.05) / 0.35));
    const drop = easeOut(clamp((t - 0.12) / 0.38));
    const hit = t > 0.5 ? Math.exp(-(t - 0.5) * 6) : 0;
    const split = easeOut(clamp((t - 0.52) / 0.45));
    beam(src, lerp(src, entry, drop), core, 2, 0.95 * fade);
    // The fan inside the glass and the three colours leaving its base.
    exits.forEach((e, i) => {
      const inside = clamp((t - 0.5) / 0.12);
      beam(entry, lerp(entry, e, inside), cols[i], 1.1, 0.7 * fade);
      const dir = { x: Math.sin(angles[i]), y: Math.cos(angles[i]) };
      const end = { x: e.x + dir.x * far * split, y: e.y + dir.y * far * split };
      if (split > 0) beam(e, end, cols[i], 2.4, 0.9 * fade);
      glow(e, s * 0.45, cols[i], 0.5 * split * fade);
    });
    glow(entry, s * (0.7 + hit * 1.6), core, (0.35 + hit * 0.8) * fade * clamp(drop * 3 - 2));
    glow(P, s * 4 * (1 + hit), cols[1], 0.12 * pin * fade);

    // The glass: a faint body, a spectrum edge and a lit top.
    if (pin > 0) {
      ctx.save();
      ctx.translate(P.x, P.y); ctx.scale(0.6 + 0.4 * pin, 0.6 + 0.4 * pin); ctx.translate(-P.x, -P.y);
      ctx.globalAlpha = pin * fade;
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fillStyle = light ? 'rgba(30,40,70,0.06)' : 'rgba(170,200,255,0.07)'; ctx.fill();
      const edge = ctx.createLinearGradient(bl.x, apex.y, br.x, bl.y);
      edge.addColorStop(0, cols[0]); edge.addColorStop(0.5, cols[1]); edge.addColorStop(1, cols[2]);
      ctx.strokeStyle = edge; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  frame(t0);
  // If frames never come (a hidden tab), don't leave the page covered.
  setTimeout(() => { if (cv.isConnected && document.hidden) { cv.remove(); done(); } }, 2500);
}
