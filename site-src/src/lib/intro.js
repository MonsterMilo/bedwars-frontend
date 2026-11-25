// Page load transition, the same on every page: the page fades up out of the
// background while a thin line of the spectrum runs along under the header,
// then the content rises in. Short, never blocks clicks, and drawn on one
// canvas so it works under every page's CSP. Home plays its own intro in the
// 3D scene instead (pages/index.jsx uses firstLoad). Skipped with reduced
// motion or effects off.
const KEY = 'prismIntro:' + (typeof location !== 'undefined' ? location.pathname.replace(/\/$/, '/index.html') : '');

const calm = () => {
  const html = document.documentElement;
  const reduce = html.dataset.motion ? html.dataset.motion === 'reduce' : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce || html.dataset.effects === 'off';
};

// True the first time this page opens in this tab (and marks it seen).
export function firstLoad() {
  if (calm()) return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
  } catch { return false; }
  return true;
}

const clamp = x => Math.min(1, Math.max(0, x));
const easeOut = x => 1 - Math.pow(1 - x, 3);

export function startIntro() {
  const html = document.documentElement;
  const done = () => html.classList.remove('intro-wait', 'intro-hold');
  if (!document.body || calm()) { done(); return; }
  const cs = getComputedStyle(html);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  const light = html.dataset.surface === 'light';
  const bg = v('--bg', light ? '#f3f5fa' : '#0c0f17');
  const cols = [v('--accent', '#5ee7ff'), v('--accent-2', '#a98bff'), v('--accent-3', '#ffc46b')];

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '2147483000', pointerEvents: 'none', visibility: 'visible' });
  document.body.appendChild(cv);
  html.classList.add('intro-hold');
  html.classList.remove('intro-wait');
  const ctx = cv.getContext('2d');
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const y = 64;

  const T = 0.75, t0 = performance.now();
  let hold = true;
  function frame(now) {
    const t = (now - t0) / 1000;
    if (t >= T) { cv.remove(); done(); return; }
    if (hold && t > 0.12) { hold = false; html.classList.remove('intro-hold'); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1 - easeOut(clamp((t - 0.05) / 0.5));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // The line of light runs across under the header and fades.
    const run = easeOut(clamp(t / 0.55)), fade = 1 - clamp((t - 0.4) / 0.35);
    if (fade > 0) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.25 * fade; ctx.fillRect(0, y - 3, W * run, 6);
      ctx.globalAlpha = fade; ctx.fillRect(0, y - 0.75, W * run, 1.5);
      const hx = W * run, glow = ctx.createRadialGradient(hx, y, 0, hx, y, 60);
      glow.addColorStop(0, light ? 'rgba(30,40,70,0.5)' : 'rgba(255,255,255,0.9)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = fade; ctx.fillStyle = glow; ctx.fillRect(hx - 60, y - 60, 120, 120);
    }
    requestAnimationFrame(frame);
  }
  frame(t0);
  // If frames never come (a hidden tab), don't leave the page covered.
  setTimeout(() => { if (cv.isConnected && document.hidden) { cv.remove(); done(); } }, 1500);
}
