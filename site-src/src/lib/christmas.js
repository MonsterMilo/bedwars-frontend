// Christmas: an overlay on the normal look, on every page, Dec 1 to Jan 1.
//  - Snow falls behind the page and piles up along the bottom. Sweep it
//    with the mouse; scrolling stirs it and gusts blow through.
//  - A string of lights hangs under the header. Click a bulb to pop it.
//  - Snow caps and icicles on panels, Santa hats on player bodies.
//  - Clicking the background throws snowflakes; Santa's sleigh flies over
//    now and then (click it). A present is hidden on the site every day.
//  - Typing "hohoho" calls the sleigh, "snow" brings a blizzard.
//  - Clicks walk through Jingle Bells; the music turns into carols.
// It all stops when the Christmas look is turned off, pauses in a hidden
// tab and sits still with reduced motion.
import { prefs, fxPage } from './prefs.js';
import { play } from './audio.js';
import { toast } from './toast.js';
import { readJson, writeJson } from './storage.js';
import { seasonHooks } from './seasonfx.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const calm = () => document.documentElement.dataset.motion === 'reduce';
const fxOn = () => prefs.value.fx !== false && !calm();
const lightSurface = () => document.documentElement.dataset.surface === 'light';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const xmasDay = () => { const d = new Date(); return d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25); };
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, dialog, [role="button"], [role="option"], [role="tab"], [role="link"], [role="checkbox"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"], .toasts';
const typingIn = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
function interactive(el) {
  if (!el || !el.closest) return false;
  if (el.closest(INTERACTIVE)) return true;
  for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).cursor === 'pointer') return true;
  return false;
}

let uid = 0;
function svg(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function node(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
}
let layer = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = node('div', '', document.body);
    layer.id = 'xm-layer';
    layer.setAttribute('aria-hidden', 'true');
  }
  return layer;
}
function fxEl(cls, x, y, text) {
  const el = node('div', `xm-fx ${cls}`, fxLayer());
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (text) el.textContent = text;
  return el;
}
function fxPlay(el, frames, opts) {
  const a = el.animate(frames, { fill: 'forwards', ...opts });
  a.onfinish = a.oncancel = () => el.remove();
  return a;
}
function arc(vx, vy, g, secs, extra) {
  const f = [];
  for (let i = 0; i <= 8; i++) {
    const t = (secs * i) / 8;
    f.push({ transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + 0.5 * g * t * t).toFixed(1)}px) ${extra ? extra(i / 8) : ''}`, opacity: i < 5 ? 1 : 1 - (i - 5) / 3 });
  }
  return f;
}
function word(x, y, text) {
  const el = fxEl('xm-word', x, y, text);
  fxPlay(el, [
    { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
    { transform: 'translate(-50%, -70%) scale(1.05)', opacity: 1, offset: 0.15 },
    { transform: 'translate(-50%, -110%) scale(1)', opacity: 1, offset: 0.75 },
    { transform: 'translate(-50%, -140%) scale(1)', opacity: 0 }
  ], { duration: 1500, easing: 'ease-out' });
}

// Snowflakes thrown from a point. Rare clicks add a bauble or a bell.
const FLAKES = ['', 'b', 'c'];
export function flakeBurst(x, y, big = false) {
  if (!fxOn() || fxLayer().childElementCount > 220) return;
  const n = big ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const el = fxEl(`xm-flake ${pick(FLAKES)}`, x, y);
    const s = rnd(0.6, big ? 1.4 : 1.05);
    const a = (Math.PI * 2 * i) / n + rnd(-0.4, 0.4), v = rnd(80, big ? 260 : 170);
    fxPlay(el, arc(Math.cos(a) * v, Math.sin(a) * v - 60, 220, 1.1, p => `rotate(${(p * rnd(-240, 240)).toFixed(0)}deg) scale(${(s * (1 - p * 0.5)).toFixed(2)})`), { duration: rnd(900, 1300), easing: 'linear' });
  }
  if (big) {
    const thing = pick(['xm-bauble', 'xm-bauble g', 'xm-bauble y', 'xm-bell']);
    fxPlay(fxEl(thing, x, y), arc(rnd(-60, 60), -240, 520, 1.2, p => `rotate(${(p * 200).toFixed(0)}deg)`), { duration: 1200, easing: 'linear' });
    if (Math.random() < 0.4) word(x, y - 20, pick(['Ho ho ho!', 'Jolly!', 'Merry!', 'Brr!']));
  }
}

// ---------- Snow ----------
function snow() {
  const back = node('canvas', 'xm-snow', document.body);
  const front = node('canvas', 'xm-snow front', document.body);
  back.setAttribute('aria-hidden', 'true'); front.setAttribute('aria-hidden', 'true');
  const bctx = back.getContext('2d'), fctx = front.getContext('2d');
  // A soft dot and a few crystals, drawn once (white, and an ink version for the light background).
  const sprites = ink => {
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const c = dot.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    const col = ink ? '150,175,215' : '255,255,255';
    g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(0.45, `rgba(${col},0.85)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    const crystal = arms => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      const x = cv.getContext('2d');
      x.translate(24, 24);
      x.strokeStyle = ink ? 'rgba(120,150,200,0.95)' : 'rgba(255,255,255,0.95)';
      x.lineCap = 'round';
      x.shadowColor = 'rgba(190,225,255,0.9)'; x.shadowBlur = 3;
      for (let k = 0; k < 6; k++) {
        x.save(); x.rotate((Math.PI / 3) * k);
        x.lineWidth = 2.2; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -19); x.stroke();
        x.lineWidth = 1.5;
        arms.forEach(([at, len]) => { x.beginPath(); x.moveTo(0, -at); x.lineTo(-len, -at - len); x.moveTo(0, -at); x.lineTo(len, -at - len); x.stroke(); });
        x.restore();
      }
      return cv;
    };
    return { dot, crystals: [crystal([[8, 4], [13, 3]]), crystal([[6, 5]]), crystal([[10, 6], [15, 2.5]])] };
  };
  const SPR = { white: sprites(false), ink: sprites(true) };
  let spr = SPR.white;

  let W = 0, H = 0, dpr = 1;
  const COL = 6;
  let drift = new Float32Array(0);
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const old = drift;
    W = innerWidth; H = innerHeight;
    [back, front].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drift = new Float32Array(Math.ceil(W / COL) + 2);
    if (old.length) for (let i = 0; i < drift.length; i++) drift[i] = old[Math.min(old.length - 1, Math.floor(i * old.length / drift.length))];
  }
  const phone = () => W < 620;
  const maxDrift = () => (phone() ? 14 : 26);
  const floor = () => H;
  const air = [], frontAir = [];
  const wind = { base: 0.2, gust: 0, mouse: 0, get x() { return this.base + this.gust + this.mouse; } };
  let heavy = 1;
  function spawn(list, z0, z1, top) {
    const z = rnd(z0, z1);
    list.push({
      x: rnd(-40, W + 40), y: top ? rnd(-60, -6) : rnd(-10, H), z, r: z < 1.4 ? 1.1 + z * 1.5 : 3 + (z - 1.6) * 2.5, vx: 0, vy: 18 + 30 * z,
      sway: rnd(0, 6.28), swayV: rnd(0.5, 1.4), rot: rnd(0, 6.28), spin: rnd(-0.8, 0.8),
      c: z >= 1.6 || (z > 1.05 && z < 1.4 && Math.random() < 0.35) ? pick(spr.crystals) : null
    });
  }
  let mx = -999, my = -999, mvx = 0, mvy = 0, lastMove = 0;
  const onMove = e => {
    const now = performance.now();
    const dt = Math.max(8, now - (lastMove || now - 16)) / 1000;
    if (mx > -999) { mvx = mvx * 0.6 + ((e.clientX - mx) / dt) * 0.4; mvy = mvy * 0.6 + ((e.clientY - my) / dt) * 0.4; }
    mx = e.clientX; my = e.clientY; lastMove = now;
  };
  let lastScroll = scrollY;
  const onScroll = () => {
    const d = scrollY - lastScroll;
    lastScroll = scrollY;
    if (calm()) return;
    const push = Math.max(-60, Math.min(60, d)) * 1.4;
    air.forEach(f => { f.vy -= push * f.z * 0.5; });
    frontAir.forEach(f => { f.vy -= push * f.z * 0.4; });
  };
  let gustT = 0, gustLen = 0, gustAmp = 0, nextGust = 10;
  const gust = (amp, len) => { gustT = 0; gustLen = len || rnd(3, 6); gustAmp = amp || rnd(0.9, 1.8) * (Math.random() < 0.7 ? 1 : -1); };
  function step(f, dt) {
    f.sway += f.swayV * dt;
    const term = 14 + 26 * f.z;
    f.vy += (term - f.vy) * Math.min(1, dt * (f.kick ? 2.4 : 1.2));
    if (f.kick) f.kick = Math.max(0, f.kick - dt);
    const target = wind.x * 60 * f.z + Math.sin(f.sway) * 16 * f.z;
    f.vx += (target - f.vx) * Math.min(1, dt * (f.kick ? 0.6 : 1.4));
    const dx = f.x - mx, dy = f.y - my, d2 = dx * dx + dy * dy;
    if (d2 < 14400 && performance.now() - lastMove < 120) {
      const k = (1 - Math.sqrt(d2) / 120) * 0.05;
      f.vx += mvx * k; f.vy += mvy * k * 0.6;
    }
    f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
    if (f.x > W + 50) f.x = -40;
    if (f.x < -50) f.x = W + 40;
  }
  function draw(c, f, alpha) {
    if (f.c) {
      const s = f.r * 4.2;
      c.save(); c.globalAlpha = alpha; c.translate(f.x, f.y); c.rotate(f.rot); c.drawImage(f.c, -s / 2, -s / 2, s, s); c.restore();
      return;
    }
    const s = f.r * 2.6;
    c.globalAlpha = alpha;
    c.drawImage(spr.dot, f.x - s / 2, f.y - s / 2, s, s);
  }
  function drawDrift(t) {
    const base = floor(), c = bctx;
    c.globalAlpha = 1;
    c.beginPath();
    c.moveTo(-COL, base + 2);
    for (let i = 0; i < drift.length; i++) c.lineTo(i * COL, base - drift[i]);
    c.lineTo(W + COL, base + 2);
    c.closePath();
    const g = c.createLinearGradient(0, base - maxDrift(), 0, base);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eef4fc'); g.addColorStop(1, '#c9d8ee');
    c.fillStyle = g;
    c.shadowColor = lightSurface() ? 'rgba(90,120,170,0.45)' : 'rgba(170,200,240,0.6)';
    c.shadowBlur = 8;
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    for (let i = 3; i < drift.length; i += 11) {
      const tw = Math.sin(t * 2.3 + i * 1.7);
      if (tw > 0.85 && drift[i] > 4) { c.globalAlpha = (tw - 0.85) * 6; c.fillRect(i * COL - 1, base - drift[i] + 3, 2, 2); }
    }
    c.globalAlpha = 1;
  }
  function land(f) {
    const i = Math.round(f.x / COL);
    if (i < 1 || i >= drift.length - 1) return;
    const cap = maxDrift(), add = 0.16 * f.z;
    drift[i] = Math.min(cap, drift[i] + add);
    drift[i - 1] = Math.min(cap, drift[i - 1] + add * 0.55);
    drift[i + 1] = Math.min(cap, drift[i + 1] + add * 0.55);
  }
  function smooth() {
    for (let i = 1; i < drift.length - 1; i++) {
      const avg = (drift[i - 1] + drift[i + 1]) / 2;
      if (drift[i] - avg > 1.2) drift[i] -= (drift[i] - avg) * 0.3;
    }
  }
  let sweptAt = 0;
  function sweep() {
    const base = floor();
    if (performance.now() - lastMove > 90 || Math.abs(mvx) + Math.abs(mvy) < 380) return;
    if (my < base - maxDrift() - 24 || my > base + 4) return;
    const i0 = Math.max(1, Math.floor((mx - 50) / COL)), i1 = Math.min(drift.length - 2, Math.ceil((mx + 50) / COL));
    let moved = 0;
    for (let i = i0; i <= i1; i++) { const take = drift[i] * 0.35; drift[i] -= take; moved += take; }
    const n = Math.min(14, Math.round(moved / 3));
    for (let k = 0; k < n; k++) {
      const z = rnd(0.8, 1.3);
      air.push({ x: mx + rnd(-30, 30), y: base - rnd(2, 12), z, r: 1.1 + z * 1.5, vx: mvx * rnd(0.15, 0.35), vy: -rnd(100, 260), sway: 0, swayV: 1, rot: 0, spin: 0, c: null, kick: 0.8 });
    }
    if (n > 4 && performance.now() - sweptAt > 260) { sweptAt = performance.now(); play('xmSwish', { x: mx }); }
  }
  // A puff of snow thrown up from a point.
  const puff = (x, y, n = 14, power = 1) => {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const z = rnd(0.8, 1.3);
      air.push({ x, y, z, r: 1.1 + z * 1.5, vx: rnd(-140, 140) * power, vy: -rnd(60, 220) * power, sway: 0, swayV: 1, rot: 0, spin: 0, c: null, kick: 0.6 });
    }
  };
  let raf = 0, last = 0, smoothT = 0, dead = false;
  function frame(now) {
    raf = 0;
    if (dead || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const t = now / 1000;
    wind.base = 0.15 + Math.sin(t * 0.07) * 0.25 + Math.sin(t * 0.021 + 2) * 0.15;
    if (gustLen) {
      gustT += dt;
      const p = gustT / gustLen;
      wind.gust = p >= 1 ? 0 : gustAmp * Math.sin(Math.PI * p) * (0.8 + 0.2 * Math.sin(t * 6));
      if (p >= 1) { gustLen = 0; nextGust = rnd(14, 30); }
    } else if ((nextGust -= dt) <= 0) gust();
    const mouseWind = performance.now() - lastMove < 150 ? Math.max(-1.2, Math.min(1.2, mvx / 1000)) : 0;
    wind.mouse += (mouseWind - wind.mouse) * Math.min(1, dt * 2);
    if (heavy > 1) heavy = Math.max(1, heavy - dt * 0.12);
    const busy = (xmasDay() ? 1.5 : 1) * heavy;
    const want = Math.round((phone() ? 50 : Math.min(160, 60 + W / 15)) * busy);
    if (air.length < want) for (let k = 0; k < 3 * Math.ceil(heavy) && air.length < want; k++) spawn(air, 0.35, 1.35, true);
    while (frontAir.length < (phone() ? 2 : Math.round(4 * busy))) spawn(frontAir, 1.6, 2.4, true);
    bctx.clearRect(0, 0, W, H);
    fctx.clearRect(0, 0, W, H);
    sweep();
    if ((smoothT += dt) > 0.25) { smoothT = 0; smooth(); }
    const base = floor();
    for (let i = air.length - 1; i >= 0; i--) {
      const f = air[i];
      step(f, dt);
      const ground = base - (drift[Math.round(f.x / COL)] || 0);
      if (f.y >= ground && f.vy > 0) { air.splice(i, 1); if (f.z > 0.7) land(f); continue; }
      draw(bctx, f, 0.45 + Math.min(0.5, f.z * 0.4));
    }
    drawDrift(t);
    for (let i = frontAir.length - 1; i >= 0; i--) {
      const f = frontAir[i];
      step(f, dt);
      if (f.y > H + 30) { frontAir.splice(i, 1); continue; }
      draw(fctx, f, 0.8);
    }
    bctx.globalAlpha = 1; fctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (dead) return;
    spr = lightSurface() ? SPR.ink : SPR.white;
    if (!W) size();
    if (calm()) {
      // Reduced motion: a still sprinkle of snow and a drift.
      bctx.clearRect(0, 0, W, H); fctx.clearRect(0, 0, W, H);
      for (let i = 0; i < drift.length; i++) drift[i] = maxDrift() * (0.45 + 0.25 * Math.sin(i * 0.11) + 0.15 * Math.sin(i * 0.37));
      for (let i = 0; i < (phone() ? 40 : 110); i++) draw(bctx, { x: rnd(0, W), y: rnd(0, floor() - 20), z: 1, r: rnd(1.1, 2.8), c: null }, 0.7);
      drawDrift(0);
      return;
    }
    if (!air.length) for (let i = 0; i < (phone() ? 40 : 100); i++) spawn(air, 0.35, 1.35, false);
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const onResize = () => { size(); if (calm()) start(); };
  const onVis = () => { if (!document.hidden) start(); };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  const offPrefs = prefs.subscribe(() => requestAnimationFrame(start));
  start();
  api.gust = gust;
  api.puff = puff;
  api.blizzard = () => { heavy = 3; gust(rnd(1.6, 2.2) * (Math.random() < 0.5 ? 1 : -1), 6); };
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    offPrefs();
    back.remove(); front.remove();
  };
}
const api = { gust() {}, puff() {}, blizzard() {} };

// ---------- String lights under the header ----------
function lights() {
  // Older pages draw the header inside <prism-nav>'s shadow root.
  const head = document.querySelector('.site-head') || document.querySelector('prism-nav')?.shadowRoot?.querySelector('.site-head');
  if (!head) return () => {};
  const box = node('div', 'xm-lights', head);
  box.setAttribute('aria-hidden', 'true');
  const COLORS = ['r', 'g', 'y', 'b'];
  let bulbs = [], popped = 0, timer = 0;
  function build() {
    box.replaceChildren();
    const w = head.clientWidth, gap = w < 620 ? 46 : 58, n = Math.ceil(w / gap) + 1;
    let d = 'M-4 1';
    for (let i = 0; i < n; i++) d += ` Q${i * gap + gap / 2} 15 ${(i + 1) * gap} 1`;
    box.appendChild(svg(`<svg class="xm-wire" width="${n * gap}" height="18" viewBox="0 0 ${n * gap} 18"><path d="${d}"/></svg>`));
    bulbs = [];
    popped = 0;
    for (let i = 0; i < n; i++) {
      const b = node('span', `xm-bulb ${COLORS[i % 4]}`, box);
      b.style.left = `${i * gap + gap / 2 - 4.5}px`;
      b.style.animationDelay = `${(-Math.random() * 3).toFixed(2)}s`;
      b.style.rotate = `${rnd(-12, 12).toFixed(0)}deg`;
      bulbs.push(b);
    }
  }
  const onDown = e => {
    const b = e.target.closest && e.target.closest('.xm-bulb');
    if (!b || !box.contains(b)) return;
    if (b.classList.contains('out')) return;
    b.classList.add('out');
    popped++;
    play('xmPop', { x: e.clientX });
    if (fxOn()) {
      const r = b.getBoundingClientRect();
      for (let i = 0; i < 6; i++) fxPlay(fxEl(`xm-shard ${b.classList[1]}`, r.left + r.width / 2, r.top + r.height / 2), arc(rnd(-90, 90), rnd(-120, -20), 600, 0.8, p => `rotate(${(p * 400).toFixed(0)}deg)`), { duration: 800, easing: 'linear' });
    }
    if (popped >= bulbs.length) {
      // Every bulb broken: someone fixes the whole string.
      setTimeout(() => {
        toast('You broke every light. Fixed them.');
        bulbs.forEach((x, i) => setTimeout(() => x.classList.remove('out'), i * 40));
        popped = 0;
        play('xmFixed');
      }, 900);
      return;
    }
    setTimeout(() => { if (b.classList.contains('out')) { b.classList.remove('out'); popped = Math.max(0, popped - 1); play('xmRelight', { x: e.clientX }); } }, rnd(7000, 12000));
  };
  box.addEventListener('pointerdown', onDown);
  const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 120); });
  ro.observe(head);
  build();
  return () => { ro.disconnect(); clearTimeout(timer); box.remove(); };
}

// ---------- Snow caps and icicles on panels ----------
function capPath(w) {
  // A lumpy band of snow along the top, with a few icicles under it.
  let d = `M0 0 H${w} V5`;
  const pts = [];
  for (let x = w; x > 0;) { const y = rnd(4, 9); pts.push([x, y]); x -= rnd(14, 28); }
  pts.push([0, 6]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    d += ` Q${((x0 + x1) / 2).toFixed(1)} ${(Math.max(y0, y1) + rnd(1, 3)).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  d += ' Z';
  let ice = '';
  for (let x = rnd(18, 50); x < w - 14; x += rnd(30, 90)) {
    const len = rnd(5, 14), half = rnd(1.8, 3.2);
    ice += `M${(x - half).toFixed(1)} 6 L${x.toFixed(1)} ${(6 + len).toFixed(1)} L${(x + half).toFixed(1)} 6 Z `;
  }
  return { d, ice };
}
function caps() {
  const done = new WeakSet();
  let queued = false;
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const cap = e.target.querySelector(':scope > .xm-cap');
      if (!cap) continue;
      const w = Math.round(e.contentRect.width);
      if (Math.abs(w - +cap.dataset.w) / Math.max(1, +cap.dataset.w) > 0.2) paint(cap, w);
    }
  });
  function paint(cap, w) {
    const { d, ice } = capPath(w);
    cap.dataset.w = w;
    cap.replaceChildren(svg(`<svg viewBox="0 0 ${w} 22" preserveAspectRatio="none"><path class="ice" d="${ice}"/><path class="snow" d="${d}"/></svg>`));
  }
  function scan() {
    queued = false;
    let n = 0;
    for (const el of document.querySelectorAll('.panel')) {
      if (done.has(el)) continue;
      if (++n > 300) break;
      done.add(el);
      if (el.offsetWidth < 110 || el.closest('dialog')) continue;
      const cap = document.createElement('i');
      cap.className = 'xm-cap';
      cap.setAttribute('aria-hidden', 'true');
      el.appendChild(cap);
      paint(cap, el.offsetWidth);
      ro.observe(el);
    }
  }
  const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => { mo.disconnect(); ro.disconnect(); document.querySelectorAll('.xm-cap').forEach(c => c.remove()); };
}

// ---------- Santa hats on player bodies ----------
const HAT = id => `<svg class="xm-hat" viewBox="0 0 40 34" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5f"/><stop offset="1" stop-color="#b3141c"/></linearGradient></defs>`
  + `<path d="M4 25 C6 14 14 5 24 4.5 C31 4 36 9 36.5 17 L33 18.5 C32.5 13 29.5 10.5 26.5 11.2 C22.5 12.4 22 18 23 25 Z" fill="url(#${id})"/>`
  + '<path d="M9 22 C11 15 16 9 22 7.5" stroke="#fff" stroke-opacity=".25" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  + '<circle cx="35" cy="19.5" r="4.2" fill="#f4f8ff"/><circle cx="33.8" cy="18.3" r="1.4" fill="#fff"/>'
  + '<rect x="1" y="22.5" width="26" height="8.5" rx="4.25" fill="#f4f8ff"/><path d="M4 29 h20" stroke="#c9d8ee" stroke-width="1.2" stroke-linecap="round"/></svg>';
const BODIES = 'img.sotd-body, img.place-body';
function bodyHats() {
  const hats = new Map();
  function place(img) {
    const hat = hats.get(img);
    if (!hat || !img.isConnected) return;
    const w = img.offsetWidth, h = img.offsetHeight;
    if (!w || !h) { hat.hidden = true; return; }
    hat.hidden = false;
    // mc-heads bodies: the head is the top quarter, centred.
    const hw = w * 0.62;
    hat.style.width = `${hw}px`;
    hat.style.left = `${img.offsetLeft + w * 0.5 - hw * 0.42}px`;
    hat.style.top = `${img.offsetTop - hw * 0.42}px`;
  }
  const ro = new ResizeObserver(entries => entries.forEach(e => place(e.target)));
  function scan() {
    for (const img of document.querySelectorAll(BODIES)) {
      if (hats.has(img)) continue;
      const hat = svg(HAT(`xmh${++uid}`));
      img.insertAdjacentElement('afterend', hat);
      hats.set(img, hat);
      img.addEventListener('load', () => place(img));
      ro.observe(img);
      place(img);
    }
    for (const [img, hat] of hats) if (!img.isConnected) { hat.remove(); hats.delete(img); }
  }
  let queued = false;
  const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => { mo.disconnect(); ro.disconnect(); hats.forEach(h => h.remove()); hats.clear(); };
}

// ---------- Santa's sleigh ----------
function sleighSvg() {
  const GOLD = '#e8c15a';
  const o = ['<svg class="xm-sleigh-svg" viewBox="0 0 440 124">',
    '<defs>',
    '<linearGradient id="xmsFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a26a3e"/><stop offset="1" stop-color="#6a3e21"/></linearGradient>',
    '<linearGradient id="xmsRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ea4148"/><stop offset=".55" stop-color="#c4262e"/><stop offset="1" stop-color="#8e1319"/></linearGradient>',
    '<linearGradient id="xmsCoat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8434a"/><stop offset="1" stop-color="#a51b22"/></linearGradient>',
    '<linearGradient id="xmsSack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a87444"/><stop offset="1" stop-color="#6a4222"/></linearGradient>',
    '<linearGradient id="xmsGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c39431"/></linearGradient>',
    '<radialGradient id="xmsGlow"><stop offset="0" stop-color="#ff6a6a" stop-opacity=".95"/><stop offset=".4" stop-color="#ff3b3b" stop-opacity=".35"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="xmsLamp"><stop offset="0" stop-color="#fff2b8" stop-opacity=".95"/><stop offset="1" stop-color="#ffcf5a" stop-opacity="0"/></radialGradient>',
    '</defs>'];
  // A leg that swings from the hip: thigh, shin, a dark hoof.
  const leg = (hx, hy, cls, col) => `<g class="xm-leg ${cls}"><path d="M${hx} ${hy} L${hx - 2} ${hy + 9} L${hx + 1} ${hy + 17}" stroke="${col}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${hx} ${hy + 16.5} l2.4 1.4" stroke="#24150c" stroke-width="3.4" stroke-linecap="round"/></g>`;
  // Four reindeer, Rudolph in front. Reins run back to Santa's hands.
  const X = [14, 80, 146, 212];
  o.push(`<path d="M${X[0] + 12} 47 ${X.slice(1).map(x => `Q${x - 22} 54 ${x + 12} 47`).join(' ')} Q${X[3] + 50} 52 302 56" stroke="#7a5a32" stroke-width="1.3" fill="none" opacity=".9"/>`);
  X.forEach((x, k) => {
    o.push(`<g class="xm-deer d${k}">`
      // far legs first, darker
      + leg(x + 20, 58, 'lf far', '#3e2414') + leg(x + 47, 57, 'lb far', '#3e2414')
      + `<path d="M${x + 10} 50 C${x + 12} 41 ${x + 30} 39 ${x + 44} 42 C${x + 55} 44 ${x + 57} 54 ${x + 50} 60 C${x + 44} 65 ${x + 22} 66 ${x + 14} 62 C${x + 8} 59 ${x + 8} 54 ${x + 10} 50 Z" fill="url(#xmsFur)"/>`
      + `<path d="M${x + 16} 61 C${x + 24} 65.5 ${x + 40} 64.5 ${x + 48} 59 C${x + 40} 62 ${x + 26} 62.5 ${x + 16} 61 Z" fill="#d6ad7c" opacity=".75"/>`
      + `<path d="M${x + 22} 43 C${x + 30} 41 ${x + 40} 41.5 ${x + 48} 45" stroke="#c48a55" stroke-width="1.2" fill="none" opacity=".6"/>`
      + `<path d="M${x + 52} 46 c4 -3.5 7.5 -1.5 6.5 2 c-2 2.2 -4.6 2 -6.5 0 Z" fill="#f3eadc"/>`
      + leg(x + 14, 58, 'lf', '#5a341c') + leg(x + 42, 57, 'lb', '#5a341c')
      // neck, chest ruff, head
      + `<path d="M${x + 16} 51 C${x + 10} 45 ${x + 6} 37 ${x + 4} 30 L${x + 14} 27 C${x + 16} 34 ${x + 20} 40 ${x + 25} 46 Z" fill="url(#xmsFur)"/>`
      + `<path d="M${x + 8} 38 c-3 5 -1.5 10 3.5 13 c1.5 -4 1.5 -9 -.5 -13 Z" fill="#e2c49a" opacity=".85"/>`
      + `<path d="M${x + 2} 22 C${x + 8} 20 ${x + 14} 23 ${x + 15} 28 C${x + 14} 32 ${x + 8} 33 ${x + 2} 32 C${x - 4} 33 ${x - 9} 31 ${x - 10} 28 C${x - 9} 25 ${x - 4} 22 ${x + 2} 22 Z" fill="#91593a"/>`
      + `<path d="M${x - 8} 29.5 C${x - 4} 31.5 ${x + 2} 31.5 ${x + 6} 30" stroke="#6a3e21" stroke-width="1" fill="none"/>`
      + `<path d="M${x + 9} 23.5 l7.5 -4.5 l-2.6 6.4 Z" fill="#6f4224"/><path d="M${x + 10.5} 23.4 l4.2 -2.4 l-1.3 3.3 Z" fill="#d9a77c"/>`
      + `<circle cx="${x + 1}" cy="25.8" r="1.4" fill="#1a0f08"/><circle cx="${x + 1.5}" cy="25.3" r=".45" fill="#fff"/>`
      + `<path d="M${x + 6} 22 C${x + 6} 14 ${x + 10} 8 ${x + 16} 4 M${x + 8} 13 l6.5 -2 M${x + 10.5} 8.5 l-1 -6 M${x + 3} 22 C${x + 1} 14 ${x - 2} 9 ${x - 6} 6 M${x + 1} 15 l-5.5 -1 M${x - 1} 11 l1 -6" stroke="#dcc39c" stroke-width="2" fill="none" stroke-linecap="round"/>`
      + (k === 0 ? `<circle cx="${x - 10}" cy="28.5" r="9" fill="url(#xmsGlow)" class="xm-glow"/><circle cx="${x - 10}" cy="28.5" r="2.8" fill="#ff3b3b" class="xm-nose"/>` : `<circle cx="${x - 10}" cy="28.3" r="2.3" fill="#2a1a14"/>`)
      // harness: collar and belly band with little gold bells
      + `<path d="M${x + 7} 41 C${x + 12} 46 ${x + 18} 48 ${x + 24} 47" stroke="#b0222a" stroke-width="3.6" fill="none" stroke-linecap="round"/>`
      + `<path d="M${x + 30} 41.5 C${x + 28.5} 50 ${x + 29} 58 ${x + 31} 64.5" stroke="#b0222a" stroke-width="3.2" fill="none"/>`
      + [[x + 10, 44.5], [x + 15, 47], [x + 20, 48], [x + 29.6, 50], [x + 30, 57]].map(([bx, by]) => `<circle cx="${bx}" cy="${by}" r="1.9" fill="url(#xmsGold)"/>`).join('')
      + '</g>');
  });
  // The sleigh: runners with a curl, red body, gold scrollwork, a lamp.
  o.push('<g class="xm-sled">'
    + `<path d="M262 96 C256 100 258 108 270 108 L410 108 C420 108 426 104 428 98 M262 96 C266 90 274 92 271 98 C269 101 265 100 266 97" stroke="url(#xmsGold)" stroke-width="3.4" fill="none" stroke-linecap="round"/>`
    + `<path d="M292 90 v18 M334 92 v16 M384 92 v16" stroke="#c99a35" stroke-width="2.6"/>`
    + '<circle cx="279" cy="44" r="13" fill="url(#xmsLamp)" class="xm-lamp"/><path d="M279 34 v4" stroke="#3a2a1a" stroke-width="1.2"/><rect x="276" y="38" width="6" height="8" rx="1.5" fill="#ffe7a0" stroke="#b88a2a" stroke-width="1"/>'
    // seat back + sack of presents behind Santa
    + '<path d="M372 34 C376 22 392 20 398 30 C384 26 378 28 376 36 Z" fill="#3a6fc4"/><path d="M384 21 v12" stroke="#ffd24e" stroke-width="2"/>'
    + '<rect x="398" y="20" width="12" height="12" rx="1" fill="#1f8a4f"/><path d="M404 20 v12 M398 26 h12" stroke="#ffd24e" stroke-width="1.8"/><path d="M404 20 c-4 -4 -6 0 0 0 c4 -4 6 0 0 0" stroke="#ffd24e" stroke-width="1.4" fill="none"/>'
    + '<path d="M366 62 C360 46 368 30 386 30 C404 30 414 44 408 62 Z" fill="url(#xmsSack)"/><path d="M376 33 C382 37 392 37 398 33" stroke="#4a2c14" stroke-width="2" fill="none"/><path d="M378 44 C384 50 392 52 400 50" stroke="#5a3a1c" stroke-width="1" fill="none" opacity=".6"/>'
    // Santa
    + '<path d="M318 62 C316 46 326 36 340 36 C354 36 362 46 362 62 Z" fill="url(#xmsCoat)"/>'
    + '<path d="M338 38 v24" stroke="#f4f8ff" stroke-width="3.6"/><rect x="320" y="53" width="41" height="5" fill="#1d1414"/><rect x="335" y="52" width="8" height="7" rx="1" fill="none" stroke="#ffd24e" stroke-width="1.6"/>'
    + '<path d="M328 45 C318 47 308 51 300 54" stroke="url(#xmsCoat)" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M305 51.5 l1.6 5" stroke="#f4f8ff" stroke-width="3.4" stroke-linecap="round"/><circle cx="299" cy="55" r="3.6" fill="#1d1414"/>'
    + '<circle cx="340" cy="28" r="8.2" fill="#f6cfae"/><circle cx="334.6" cy="30" r="2.4" fill="#f08d80" opacity=".7"/><circle cx="335.8" cy="25.8" r="1.1" fill="#2a1a14"/><circle cx="332.6" cy="28.6" r="2.1" fill="#eaa088"/>'
    + '<path d="M331 29 C329 41 337 48 344 46 C351 44 351 34 349 28 C345 32 337 33 331 29 Z" fill="#f4f8ff"/><path d="M341 34 c2 4 4 8 3 12" stroke="#d6e2f2" stroke-width="1" fill="none"/>'
    + '<path d="M329.5 30.5 c3 -3 7.5 -2.4 9.5 0 c-3.4 1.6 -6.6 2 -9.5 0 Z" fill="#fff"/>'
    + '<path d="M331 22 C333 11 348 8 356 14 C361 18 365 23 368 29 L352 20 Z" fill="#d42f35"/><circle cx="368.6" cy="29.4" r="3.6" fill="#fff"/><path d="M330 22.5 h21" stroke="#f4f8ff" stroke-width="4.6" stroke-linecap="round"/>'
    // sleigh body in front of Santa's legs
    + '<path d="M270 60 C266 48 270 38 282 40 C290 42 291 52 286 58 L300 62 L404 62 C408 48 418 40 428 42 C434 56 430 88 404 92 L296 92 C280 92 272 78 270 60 Z" fill="url(#xmsRed)"/>'
    + '<path d="M284 42 C288 46 288 52 286 58 L300 62 L404 62 C408 50 416 44 426 44" stroke="rgba(255,255,255,.35)" stroke-width="1.4" fill="none"/>'
    + '<path d="M278 78 C306 88 372 88 426 72" stroke="url(#xmsGold)" stroke-width="2.4" fill="none"/>'
    + '<path d="M304 74 c5 -7 15 -3 11 4 c-3 4 -8 2 -6 -1.5 M394 72 c-5 -7 -15 -3 -11 4 c3 4 8 2 6 -1.5" stroke="url(#xmsGold)" stroke-width="1.7" fill="none" stroke-linecap="round"/>'
    + '<circle cx="349" cy="76" r="3.4" fill="url(#xmsGold)"/><circle cx="330" cy="77" r="1.6" fill="#ffe08a"/><circle cx="368" cy="77" r="1.6" fill="#ffe08a"/>'
    + '<path d="M276 52 C272 48 274 42 280 43" stroke="url(#xmsGold)" stroke-width="1.6" fill="none"/>'
    + '</g></svg>');
  return o.join('');
}
function sleigh() {
  let timer = 0, live = null;
  function fly(opts = {}) {
    if (calm() || document.hidden || live || document.querySelector('dialog[open]')) return;
    const W = innerWidth, H = innerHeight;
    const near = opts.near || rnd(0.55, 1);
    const sw = (W < 620 ? 220 : 360) * near;
    const rtl = opts.rtl != null ? opts.rtl : Math.random() < 0.65;
    const el = node('div', 'xm-sleigh', document.body);
    el.style.width = `${sw}px`;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', "Santa's sleigh");
    el.appendChild(svg(sleighSvg()));
    if (!rtl) el.firstElementChild.style.transform = 'scaleX(-1)';
    el.querySelectorAll('.xm-deer').forEach((d, k) => { d.style.animationDelay = `-${(k * 0.12).toFixed(2)}s`; });
    const y0 = opts.y != null ? opts.y : H * rnd(0.12, 0.3);
    const from = rtl ? W + 40 : -sw - 40, to = rtl ? -sw - 60 : W + 60;
    const dur = opts.dur || ((W + sw) / (110 * near + 60)) * 1000;
    const lift = rnd(30, 70);
    const anim = el.animate([
      { translate: `${from}px ${y0 + lift}px` },
      { translate: `${(from + to) / 2}px ${y0}px`, offset: 0.5 },
      { translate: `${to}px ${y0 - lift * 0.8}px` }
    ], { duration: dur, easing: 'linear' });
    live = el;
    // Bells in time with the gallop, panned with it, louder mid-screen and a
    // touch higher while it's coming closer; sparkles off the runners.
    play('xmArrive', { x: rtl ? W : 0 });
    const ring = () => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const mid = 1 - Math.min(1, Math.abs(cx - W / 2) / (W / 2 + r.width / 2));
      const coming = rtl ? cx > W / 2 : cx < W / 2;
      if (mid > 0) play('xmGallop', { x: Math.max(0, Math.min(W, cx)), gain: near * (0.3 + 0.7 * mid), up: coming ? 1.03 : 0.97 });
    };
    ring();
    const bells = setInterval(() => { if (!el.isConnected) clearInterval(bells); else ring(); }, 500);
    const tick = setInterval(() => {
      if (!el.isConnected) { clearInterval(tick); return; }
      const r = el.getBoundingClientRect();
      const sx = rtl ? r.right - r.width * 0.06 : r.left + r.width * 0.06;
      for (let k = 0; k < 2; k++) {
        const s = fxEl('xm-sparkle', sx + rnd(-6, 6), r.top + r.height * rnd(0.6, 0.9));
        fxPlay(s, [{ transform: 'scale(1)', opacity: 1 }, { transform: `translate(${rnd(-10, 10)}px, ${rnd(10, 40)}px) scale(0.2)`, opacity: 0 }], { duration: rnd(700, 1300), easing: 'ease-out' });
      }
    }, 140);
    anim.onfinish = anim.oncancel = () => { clearInterval(tick); clearInterval(bells); el.remove(); if (live === el) live = null; };
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (el.dataset.ho) return;
      el.dataset.ho = '1';
      play('xmHoho', { x: e.clientX });
      word(e.clientX, e.clientY - 30, 'Ho ho ho!');
      const g = fxEl('xm-gift', e.clientX, e.clientY);
      const fall = innerHeight - e.clientY - 30, dir = rtl ? -1 : 1;
      fxPlay(g, [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dir * 40}px, ${fall * 0.5}px) rotate(${dir * 90}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dir * 60}px, ${fall}px) rotate(${dir * 170}deg)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${dir * 60}px, ${fall}px) rotate(${dir * 180}deg)`, opacity: 0 }
      ], { duration: 1400, easing: 'cubic-bezier(.4,0,1,1)' });
      setTimeout(() => { api.puff(e.clientX + dir * 60, innerHeight - 20, 16, 1); play('xmSwish', { x: e.clientX }); }, 1300);
    });
  }
  function plan(soon) {
    clearTimeout(timer);
    timer = setTimeout(() => { fly(); plan(false); }, soon ? rnd(14000, 26000) : xmasDay() ? rnd(25000, 50000) : rnd(60000, 130000));
  }
  api.sleigh = fly;
  plan(true);
  return () => { clearTimeout(timer); if (live) live.remove(); live = null; };
}

// ---------- A present hidden on the site every day ----------
// One page a day hides it (the same page all day; every page on Christmas
// Day, and always the page you're on when previewing). It peeks out from
// the corner of a panel; opening it counts towards the year's tally.
const PRESENT_KEY = 'prismPresents';
const PAGES = ['index', 'player', 'nicks', 'leaderboards', 'tracker', 'download'];
function present(previewing) {
  const year = new Date().getFullYear();
  const state = readJson(PRESENT_KEY, {});
  const found = state.y === year && Array.isArray(state.days) ? state.days : [];
  if (found.includes(today())) return () => {};
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  let h = 0;
  for (const ch of today()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const d = new Date();
  if (!previewing && !(d.getMonth() === 11 && d.getDate() === 25) && PAGES[h % PAGES.length] !== page) return () => {};
  let el = null, timer = 0;
  function hide() {
    const all = [...document.querySelectorAll('main .panel')].filter(p => p.offsetWidth > 200 && p.offsetHeight > 80 && !p.closest('dialog'));
    if (!all.length) { timer = setTimeout(hide, 2000); return; }
    // It sits on top of a panel, so pick one that doesn't clip what sticks out.
    const open = all.filter(p => getComputedStyle(p).overflow === 'visible');
    const spots = open.length ? open : all;
    const host = spots[h % spots.length];
    el = document.createElement('button');
    el.type = 'button';
    el.className = `xm-present ${['r', 'g', 'b'][h % 3]}${open.length ? '' : ' inside'}`;
    el.setAttribute('aria-label', 'A present! Open it');
    el.title = 'A present!';
    host.appendChild(el);
    el.addEventListener('click', e => {
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      el.classList.add('open');
      play('xmPresent', { x });
      flakeBurst(x, y, true);
      if (!calm()) for (let i = 0; i < 16; i++) {
        const c = fxEl(`xm-confetti ${pick(['r', 'g', 'y', 'w'])}`, x, y);
        fxPlay(c, arc(rnd(-180, 180), rnd(-380, -160), 700, 1.4, p => `rotate(${(p * rnd(300, 900)).toFixed(0)}deg)`), { duration: 1400, easing: 'linear' });
      }
      const days = [...found, today()];
      writeJson(PRESENT_KEY, { y: year, days });
      const xmas = new Date().getMonth() === 11 && new Date().getDate() === 25;
      toast(xmas ? `Merry Christmas! Present ${days.length} found.` : `You found today's present! ${days.length} this year.`, 4200);
      setTimeout(() => { el.remove(); el = null; }, 700);
    });
  }
  timer = setTimeout(hide, 1500);
  return () => { clearTimeout(timer); if (el) el.remove(); };
}

// ---------- Clicks and typing ----------
function input(ownSounds) {
  let typed = '';
  const onDown = e => {
    if (e.button !== 0) return;
    const t = e.target;
    if (ownSounds && t.closest) {
      const el = t.closest('button, a, summary, [role="button"], [role="option"], [role="tab"]');
      if (el && !el.disabled && !el.closest('.xm-lights, .xm-sleigh, .xm-present')) { play('click', { x: e.clientX }); return; }
    }
    if (!ownSounds || interactive(t)) return;
    const big = Math.random() < 1 / 10;
    flakeBurst(e.clientX, e.clientY, big);
    play(big ? 'rare' : 'xmFlakes', { x: e.clientX });
  };
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ownSounds && e.target.matches && e.target.matches('input[type="text"], input[type="search"], input:not([type]), textarea')) {
      if (e.repeat && e.key !== 'Backspace') return;
      const kind = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' || e.key === 'Delete' ? 'back' : e.key.length === 1 ? 'key' : null;
      if (kind) play('type', { kind });
      return;
    }
    if (typingIn(e.target) || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-10);
    if (typed.endsWith('hohoho')) { typed = ''; play('xmHoho'); if (api.sleigh) api.sleigh({ y: innerHeight * 0.4, near: 1, rtl: Math.random() < 0.5 }); }
    else if (typed.endsWith('snow')) { typed = ''; api.blizzard(); play('xmSwish'); }
    else if (typed.endsWith('jingle')) { typed = ''; for (let i = 0; i < 8; i++) play('xmShake', { delay: i * 0.14, x: innerWidth * (i / 8) }); }
  };
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
}

// The tab icon: the bed on a red tile with a snowflake.
function favicon() {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return () => {};
  const old = link.href;
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#c4262e"/><path d="M14 44 30 15 46 44Z" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>'
    + '<path d="M8 50 C20 44 44 44 56 50 V64 H8Z" fill="#f4f8ff"/><g stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M50 8v14M43 15h14M45 10l10 10M55 10 45 20"/></g></svg>';
  link.href = `data:image/svg+xml,${encodeURIComponent(icon)}`;
  return () => { link.href = old; };
}

function hello() {
  const year = new Date().getFullYear();
  if (readJson('prismXmasHello', 0) === year) return;
  writeJson('prismXmasHello', year);
  setTimeout(() => toast('Christmas is here. A present is hidden somewhere each day.', 5200), 1800);
}

let stops = null, hadFx = false;
export function startChristmas({ previewing = false } = {}) {
  if (stops) return;
  hadFx = fxPage.value;
  const ownSounds = !hadFx;
  fxPage.value = true;
  seasonHooks.burst = flakeBurst;
  stops = [snow(), lights(), caps(), bodyHats(), sleigh(), present(previewing), input(ownSounds), favicon()];
  hello();
}
export function stopChristmas() {
  if (!stops) return;
  stops.forEach(s => { try { s(); } catch { /* already gone */ } });
  stops = null;
  seasonHooks.burst = null;
  fxPage.value = hadFx;
  if (layer) { layer.remove(); layer = null; }
}
