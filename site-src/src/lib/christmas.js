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
  const o = ['<svg class="xm-sleigh-svg" viewBox="0 0 380 100">'];
  [18, 78, 138, 198].forEach((x, k) => {
    o.push(`<g class="xm-deer d${k}">`
      + `<path d="M${x + 6} 46 C${x + 10} 38 ${x + 36} 38 ${x + 44} 46 C${x + 46} 54 ${x + 40} 58 ${x + 26} 58 C${x + 14} 58 ${x + 6} 54 ${x + 6} 46 Z" fill="#7a4a2a"/>`
      + `<path d="M${x + 10} 54 l-8 12 M${x + 16} 56 l-4 13 M${x + 36} 56 l8 11 M${x + 40} 54 l12 8" stroke="#5a341c" stroke-width="3" stroke-linecap="round"/>`
      + `<path d="M${x + 8} 46 C${x + 2} 38 ${x} 32 ${x + 2} 28 L${x + 8} 30 C${x + 10} 36 ${x + 12} 40 ${x + 14} 44 Z" fill="#7a4a2a"/>`
      + `<ellipse cx="${x}" cy="29" rx="7" ry="5" fill="#8a5632"/><circle cx="${x - 6}" cy="30" r="2.4" fill="${k === 0 ? '#ff4040' : '#2a1a14'}" class="${k === 0 ? 'xm-nose' : ''}"/>`
      + `<path d="M${x + 2} 25 l-4 -9 l-4 -2 M${x - 2} 18 l3 -4 M${x + 4} 25 l2 -10 l4 -3 M${x + 6} 17 l-3 -4" stroke="#cdb08a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
      + `<path d="M${x + 30} 48 h-4" stroke="#e8c15a" stroke-width="5" stroke-linecap="round"/></g>`);
  });
  o.push('<path d="M60 47 L262 54 M120 48 L262 56 M180 49 L262 58" stroke="#c9a46a" stroke-width="1.2" opacity=".85"/>');
  o.push('<g class="xm-sled"><path d="M252 82 C264 92 352 92 368 80" stroke="#e8c15a" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
    + '<path d="M270 74 v10 M340 74 v10" stroke="#e8c15a" stroke-width="2.4"/>'
    + '<path d="M256 50 C256 40 262 34 270 36 L274 52 L350 52 C356 40 366 34 372 36 C376 50 370 74 350 76 L276 76 C262 76 256 64 256 50 Z" fill="#c4262e"/>'
    + '<path d="M262 64 C290 70 330 70 368 60" stroke="#e8c15a" stroke-width="2.2" fill="none"/>'
    + '<path d="M292 52 C292 36 300 30 310 30 C320 30 326 38 326 52 Z" fill="#d42f35"/>'
    + '<circle cx="310" cy="24" r="8" fill="#f2c9a8"/><path d="M301 26 C302 38 318 38 319 26 C316 31 304 31 301 26 Z" fill="#f4f8ff"/>'
    + '<path d="M301 21 C302 10 316 8 322 14 L330 22 L319 19 Z" fill="#d42f35"/><circle cx="331" cy="23" r="3.2" fill="#f4f8ff"/>'
    + '<path d="M300 21 h20" stroke="#f4f8ff" stroke-width="3.4" stroke-linecap="round"/>'
    + '<path d="M296 44 l-26 4" stroke="#d42f35" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M330 50 C326 34 336 22 348 24 C362 26 364 40 358 52 Z" fill="#8a5a32"/>'
    + '<rect x="336" y="16" width="12" height="10" fill="#2e64b5"/><rect x="341" y="16" width="2.4" height="10" fill="#f2cf6e"/>'
    + '<rect x="348" y="20" width="9" height="8" fill="#1f6b45"/></g></svg>');
  return o.join('');
}
function sleigh() {
  let timer = 0, live = null;
  function fly(opts = {}) {
    if (calm() || document.hidden || live || document.querySelector('dialog[open]')) return;
    const W = innerWidth, H = innerHeight;
    const near = opts.near || rnd(0.55, 1);
    const sw = (W < 620 ? 180 : 290) * near;
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
    // Bells while it's on screen, panned with it, and sparkles off the runners.
    const tick = setInterval(() => {
      if (!el.isConnected) { clearInterval(tick); return; }
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (cx > -100 && cx < W + 100) play('xmShake', { x: Math.max(0, Math.min(W, cx)), gain: near });
      const sx = rtl ? r.right - r.width * 0.06 : r.left + r.width * 0.06;
      for (let k = 0; k < 2; k++) {
        const s = fxEl('xm-sparkle', sx + rnd(-6, 6), r.top + r.height * rnd(0.6, 0.9));
        fxPlay(s, [{ transform: 'scale(1)', opacity: 1 }, { transform: `translate(${rnd(-10, 10)}px, ${rnd(10, 40)}px) scale(0.2)`, opacity: 0 }], { duration: rnd(700, 1300), easing: 'ease-out' });
      }
    }, 140);
    anim.onfinish = anim.oncancel = () => { clearInterval(tick); el.remove(); if (live === el) live = null; };
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
