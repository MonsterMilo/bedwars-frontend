// Prism click effects and easter eggs, ported from the old tracker.
//
//  - Clicking the page background (never a button, link or card) throws a
//    few glass shards from a ring of light, about 1 in 12 a bigger flare.
//    Clicking fast builds a combo.
//  - The Konami code, typing "bedwars", or tapping the title 10 times plays
//    the BED DESTROYED! scene. 5 title taps splits the title into colours.
//  - Typing "gg" or "ez" (outside a text box) pops a Hypixel chat line.
//  - Buttons, pages, toggles and typing get their glass sounds.
// Everything is decoration drawn into one click-through layer. It all
// respects reduced motion and the "Click effects" setting.
import { prefs, fxPage } from './prefs.js';
import { play, setMood } from './audio.js';

const COLORS = ['#5ee7ff', '#a98bff', '#ffc46b', '#ff7ab6', '#ffffff'];
const rand = (a, b) => Math.random() * (b - a) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const calm = () => document.documentElement.dataset.motion === 'reduce';
const fxOn = () => prefs.value.fx !== false && !calm();

let layer = null, toastBox = null;
function ensure() {
  if (layer) return;
  layer = document.createElement('div');
  layer.id = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  toastBox = document.createElement('div');
  toastBox.id = 'egg-toasts';
  toastBox.setAttribute('role', 'status');
  toastBox.setAttribute('aria-live', 'polite');
  document.body.append(layer, toastBox);
}

function fxEl(cls, x, y, text) {
  ensure();
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (text) el.textContent = text;
  layer.appendChild(el);
  return el;
}
function fxPlay(el, frames, opts) {
  const a = el.animate(frames, { fill: 'forwards', ...opts });
  a.onfinish = a.oncancel = () => el.remove();
  return a;
}
// A thrown particle: launched at (vx, vy) px/s, falling under gravity g.
function arcFrames(vx, vy, g, secs, extra) {
  const frames = [];
  for (let i = 0; i <= 8; i++) {
    const t = (secs * i) / 8;
    frames.push({ transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + 0.5 * g * t * t).toFixed(1)}px) ${extra ? extra(i / 8) : ''}`, opacity: i < 4.8 ? 1 : 1 - (i - 4.8) / 3.2 });
  }
  return frames;
}

function fxWord(x, y, text, sub) {
  const el = fxEl('fx-word', x, y, text);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  fxPlay(el, [
    { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
    { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%, -130%) scale(1)', opacity: 1, offset: 0.7 },
    { transform: 'translate(-50%, -170%) scale(1)', opacity: 0 }
  ], { duration: 1000, easing: 'ease-out' });
  return el;
}

// Triangular shards in the beam colours spin away from a ring of light.
// A big burst adds a vertical flare. quiet = no word on top.
export function burst(x, y, big = false, quiet = false) {
  if (!fxOn()) return;
  ensure();
  if (layer.childElementCount > 260) return; // autoclicking: don't melt the page
  const n = big ? 14 : 7;
  for (let i = 0; i < n; i++) {
    const el = fxEl('fx-shard', x, y);
    el.style.setProperty('--c', COLORS[i % COLORS.length]);
    const a = (Math.PI * 2 * i) / n + rand(-0.4, 0.4);
    const d = rand(24, big ? 90 : 52);
    fxPlay(el, [
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${(Math.cos(a) * d).toFixed(1)}px, ${(Math.sin(a) * d).toFixed(1)}px) rotate(${rand(-260, 260).toFixed(0)}deg) scale(0.3)`, opacity: 0 }
    ], { duration: rand(520, 820), easing: 'cubic-bezier(.15,.7,.3,1)' });
  }
  fxPlay(fxEl('fx-halo', x, y), [{ transform: 'scale(0.4)', opacity: 1 }, { transform: `scale(${big ? 5 : 3})`, opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (big) {
    fxPlay(fxEl('fx-flare', x, y), [{ transform: 'scaleY(0.2)', opacity: 0 }, { transform: 'scaleY(1.4)', opacity: 1, offset: 0.25 }, { transform: 'scaleY(0.6)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
    if (!quiet && Math.random() < 0.35) fxWord(x, y, pick(['REFRACTED', 'SPLIT!', 'GLINT']));
  }
}

// ---- Combo ----
const COMBO_LABELS = ['GLINT', 'REFRACTION', 'DISPERSION', 'FULL SPECTRUM', 'WHITE LIGHT'];
const COMBO_TIERS = [5, 10, 20, 35, 50];
let comboCount = 0, comboLast = 0, comboEl = null;
function bumpCombo(x, y) {
  const now = performance.now();
  comboCount = now - comboLast < 420 ? comboCount + 1 : 1;
  comboLast = now;
  if (comboCount < COMBO_TIERS[0]) return;
  let tier = 0;
  while (tier + 1 < COMBO_TIERS.length && comboCount >= COMBO_TIERS[tier + 1]) tier++;
  if (comboEl) comboEl.remove();
  comboEl = fxWord(x, y - 40, `x${comboCount}`, COMBO_LABELS[tier]);
  comboEl.style.fontSize = `${Math.min(20 + tier * 5, 42)}px`;
  if (COMBO_TIERS.includes(comboCount)) { burst(x, y, true, true); play('combo', { tier }); }
}

// ---- Toasts ----
// parts: strings and [text, colour] pairs, so nothing is parsed as HTML.
export function eggToast(parts, ms = 4200) {
  ensure();
  const el = document.createElement('div');
  el.className = 'egg-toast';
  for (const p of [].concat(parts)) {
    if (Array.isArray(p)) { const b = document.createElement('b'); b.textContent = p[0]; if (p[1]) b.style.color = p[1]; el.appendChild(b); } else el.append(p);
  }
  toastBox.appendChild(el);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
  if (!calm()) el.animate([{ transform: 'translateX(-24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
  setTimeout(() => {
    const out = el.animate([{ opacity: 1 }, { transform: calm() ? 'none' : 'translateX(-24px)', opacity: 0 }], { duration: 260, fill: 'forwards' });
    out.onfinish = () => el.remove();
  }, ms);
  return el;
}

let chatNames = ['Milo'];
export function setChatNames(names) { if (names && names.length) chatNames = names; }
const RANKS = [['[MVP++]', '#ffaa00'], ['[MVP+]', '#55ffff'], ['[VIP+]', '#55ff55'], ['[MVP]', '#55ffff']];
function chatLine(msg) {
  const [rank, color] = pick(RANKS);
  play('chat');
  eggToast([[`${rank} ${pick(chatNames)}`, color], `: ${msg}`]);
}
// Hypixel swaps "ez" in chat for one of these, so typing it here does too.
const EZ = [
  'Wait... This isn\'t what I typed!',
  'Please go easy on me, this is my first game!',
  'I like long walks on the beach and playing Hypixel',
  'Anyone else really like Rick Astley?',
  'Your personality shines brighter than the sun.',
  'Why can\'t the Ender Dragon read a book? Because he always starts at the End.',
  'I need help, teach me how to play!',
  'You\'re a great person! Do you want to play some Hypixel games with me?'
];

// ---- BED DESTROYED! ----
const NS = 'http://www.w3.org/2000/svg';
function bedHalf(foot) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', foot ? 'egg-bed-foot' : 'egg-bed-head');
  svg.setAttribute('viewBox', '0 6 16 10');
  const rects = foot ? [] : [[0, 7, 7, 3, '#e9e9e9'], [0, 7, 7, 1, '#ffffff']];
  const x = foot ? 0 : 7, w = foot ? 16 : 9;
  rects.push([x, 7, w, 3, '#b3312c'], [x, 7, w, 1, '#d8443d'], [0, 10, 16, 2, '#8e2622'], [0, 12, 16, 1, '#9c7440'], [foot ? 13 : 0, 13, 3, 3, '#6b4f2a']);
  for (const [rx, ry, rw, rh, fill] of rects) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', rx); r.setAttribute('y', ry); r.setAttribute('width', rw); r.setAttribute('height', rh); r.setAttribute('fill', fill);
    svg.appendChild(r);
  }
  return svg;
}
const DEBRIS = ['#b3312c', '#d8443d', '#8e2622', '#e9e9e9', '#9c7440', '#6b4f2a'];
let sceneBusy = false;
export function bedDestroyed() {
  if (sceneBusy || prefs.value.fx === false) return;
  sceneBusy = true;
  play('bed');
  const scene = document.createElement('div');
  scene.id = 'egg-scene';
  scene.setAttribute('aria-hidden', 'true');
  const bg = document.createElement('div'); bg.className = 'egg-scene-bg';
  const bed = document.createElement('div'); bed.className = 'egg-bed';
  const head = bedHalf(false), foot = bedHalf(true);
  bed.append(head, foot);
  const title = document.createElement('h2'); title.className = 'egg-title'; title.textContent = 'BED DESTROYED!';
  const sub = document.createElement('p'); sub.className = 'egg-sub'; sub.textContent = 'You will no longer respawn!';
  scene.append(bg, bed, title, sub);
  document.body.appendChild(scene);
  eggToast([['BED DESTRUCTION >', '#ff5c72'], ' Your Bed was destroyed by ', ['Milo'], '!'], 5000);
  const done = () => { scene.remove(); sceneBusy = false; };
  if (calm()) { setTimeout(done, 2400); return; }

  bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'forwards' });
  bed.animate([
    { transform: 'translateY(-60vh)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1, offset: 0.7 },
    { transform: 'translateY(-14px)', offset: 0.85 },
    { transform: 'translateY(0)', opacity: 1 }
  ], { duration: 600, easing: 'ease-in', fill: 'backwards' });
  title.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 750, fill: 'backwards' });
  sub.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1050, fill: 'backwards' });

  setTimeout(() => {
    head.animate([{ transform: 'none' }, { transform: 'translate(-120px, 60px) rotate(-38deg)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    foot.animate([{ transform: 'none' }, { transform: 'translate(120px, 70px) rotate(42deg)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    const r = bed.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.6;
    for (let i = 0; i < 26; i++) {
      const el = fxEl('fx-px', cx + rand(-40, 40), cy + rand(-10, 10));
      el.style.setProperty('--c', pick(DEBRIS));
      el.style.width = el.style.height = `${Math.round(rand(5, 10))}px`;
      const spin = rand(-360, 360);
      fxPlay(el, arcFrames(rand(-260, 260), rand(-420, -160), 1100, 1.1, p => `rotate(${Math.round(p * spin)}deg)`), { duration: 1100, easing: 'linear' });
    }
    const spread = Math.min(160, window.innerWidth / 2 - 70);
    burst(cx - spread, cy - 40, true);
    burst(cx + spread, cy - 60, true);
    title.animate([
      { transform: 'scale(1.8)', opacity: 0 },
      { transform: 'scale(0.94)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-6px, 2px)', offset: 0.5 },
      { transform: 'translate(5px, -3px)', offset: 0.65 },
      { transform: 'translate(-3px, 1px)', offset: 0.8 },
      { transform: 'none', opacity: 1 }
    ], { duration: 520, easing: 'ease-out' });
    const tr = title.getBoundingClientRect();
    setTimeout(() => burst(tr.left + tr.width / 2, tr.top + tr.height / 2), 180);
    sub.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: 300, easing: 'ease-out', fill: 'backwards' });
  }, 700);
  setTimeout(() => { scene.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = done; }, 2900);
}

// ---- Title stunt: the title splits into cyan, violet and gold copies
// that drift apart and snap back in a flash of white. ----
let stuntBusy = false;
function titleStunt(el) {
  if (stuntBusy || !fxOn()) return;
  stuntBusy = true;
  play('stunt');
  const r = el.getBoundingClientRect();
  const frames = [0, 0.18, 0.42, 0.62, 0.8, 1].map(k => {
    const d = k === 0 || k === 1 ? 0 : k < 0.62 ? 6 + k * 30 : (1 - k) * 40;
    return {
      offset: k,
      filter: `drop-shadow(${(-d).toFixed(1)}px 0 0 rgba(94,231,255,.9)) drop-shadow(${d.toFixed(1)}px ${(d * 0.4).toFixed(1)}px 0 rgba(255,196,107,.85)) drop-shadow(0 ${(-d * 0.5).toFixed(1)}px 0 rgba(169,139,255,.85)) brightness(${k === 0.8 ? 1.8 : 1})`,
      transform: `scale(${k === 0.8 ? 1.04 : 1})`
    };
  });
  const release = () => { stuntBusy = false; };
  el.animate(frames, { duration: 1500, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(release, release);
  setTimeout(() => burst(r.left + r.width / 2, r.top + r.height / 2, true, true), 1150);
}
// 5 taps: the stunt. 10 taps: BED DESTROYED.
export function bindTitle(el) {
  if (!el) return () => {};
  let taps = 0, timer = 0;
  const onClick = () => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1600);
    if (taps === 5) titleStunt(el);
    if (taps >= 10) { taps = 0; bedDestroyed(); }
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

// ---- Searching Technoblade ----
export function technoblade(anchor) {
  play('techno');
  eggToast(['👑 ', ['Technoblade never dies.'], ' Blood for the Blood God.'], 5500);
  if (anchor) { const r = anchor.getBoundingClientRect(); burst(r.left + r.width * 0.7, r.top + r.height / 2, true); }
}

// ---- Adding a sweat: a white beam shoots across the button, then splits
// into three coloured rays fanning up, with a word in the middle. ----
// host is positioned; anchor (inside it) is what the beam centres on.
export function successFlourish(host, anchor) {
  play('success');
  if (!host || !fxOn()) return;
  const wrap = document.createElement('div');
  wrap.className = 'success-flourish';
  wrap.setAttribute('aria-hidden', 'true');
  if (anchor) { wrap.style.left = `${anchor.offsetLeft}px`; wrap.style.width = `${anchor.offsetWidth}px`; wrap.style.right = 'auto'; }
  const beam = document.createElement('div');
  beam.className = 'flourish-beam';
  wrap.appendChild(beam);
  beam.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.35 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
  ['#5ee7ff', '#a98bff', '#ffc46b'].forEach((c, i) => {
    const ray = document.createElement('div');
    ray.className = 'flourish-ray';
    ray.style.background = `linear-gradient(0deg, ${c}, transparent)`;
    wrap.appendChild(ray);
    const ang = (i - 1) * 22;
    ray.animate([
      { transform: `rotate(${ang}deg) scaleY(0)`, opacity: 0 },
      { transform: `rotate(${ang}deg) scaleY(0)`, opacity: 1, offset: 0.25 },
      { transform: `rotate(${ang}deg) scaleY(1)`, opacity: 1, offset: 0.55 },
      { transform: `rotate(${ang * 1.2}deg) scaleY(1.1)`, opacity: 0 }
    ], { duration: 1300, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
  });
  const word = document.createElement('div');
  word.className = 'flourish-word';
  word.textContent = 'Caught in the light.';
  wrap.appendChild(word);
  word.animate([
    { transform: 'translate(-50%, 8px)', opacity: 0, filter: 'blur(4px)' },
    { transform: 'translate(-50%, 0)', opacity: 1, filter: 'blur(0)', offset: 0.3 },
    { transform: 'translate(-50%, 0)', opacity: 1, filter: 'blur(0)', offset: 0.8 },
    { transform: 'translate(-50%, -10px)', opacity: 0, filter: 'blur(2px)' }
  ], { duration: 1700, easing: 'ease-out', fill: 'both' });
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1900);
}

// ---- Popup flip: the card lifts out like a pane of glass catching the
// light, and falls back toward where it came from on close. ----
let origin = null;
// Remember where the last opener was, so the popup can grow out of it.
export function rememberOrigin(el) {
  const box = el && (el.closest('.card, tr, .ss-tile') || el);
  origin = box ? { rect: box.getBoundingClientRect(), at: performance.now() } : null;
}
function delta(el) {
  if (!origin || performance.now() - origin.at > 4000) return null;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return null;
  const f = origin.rect;
  return {
    dx: f.left + f.width / 2 - (to.left + to.width / 2),
    dy: f.top + f.height / 2 - (to.top + to.height / 2),
    sx: Math.max(0.2, f.width / to.width), sy: Math.max(0.1, f.height / to.height)
  };
}
export function flipOpen(el) {
  if (!el) return;
  const f = delta(el) || { dx: 0, dy: 24, sx: 0.9, sy: 0.9 };
  play('flipOpen', { duration: 640 });
  if (!fxOn()) return;
  el.animate([
    { transform: `perspective(1200px) translate(${f.dx}px, ${f.dy}px) scale(${f.sx}, ${f.sy}) rotateX(0deg)`, filter: 'brightness(1) saturate(1)', opacity: 0.85, easing: 'cubic-bezier(.2,.75,.25,1)' },
    { transform: `perspective(1200px) translate(${f.dx * 0.1}px, ${f.dy * 0.1}px) scale(1.02) rotateX(8deg)`, filter: 'brightness(1.9) saturate(0.3)', opacity: 1, offset: 0.55, easing: 'ease-out' },
    { transform: 'perspective(1200px) rotateX(0deg)', filter: 'brightness(1) saturate(1)', opacity: 1 }
  ], { duration: 640 });
}
// Resolves when the close animation is done (at once without motion).
export function flipClose(el) {
  play('flipClose');
  if (!el || !fxOn() || !el.getAnimations) return Promise.resolve();
  const f = delta(el) || { dx: 0, dy: 24, sx: 0.9, sy: 0.9 };
  const toward = `translate(${f.dx * 0.6}px, ${f.dy * 0.6}px) scale(${0.4 + f.sx * 0.6}, ${0.4 + f.sy * 0.6})`;
  const a = el.animate([{ transform: 'none', filter: 'brightness(1) blur(0px)', opacity: 1 }, { transform: toward, filter: 'brightness(1.6) blur(6px)', opacity: 0 }], { duration: 260, fill: 'forwards' });
  return a.finished.then(() => a.cancel(), () => {});
}

// ---- Global listeners ----
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, dialog, [role="button"], [role="option"], [role="tab"], [role="link"], [role="checkbox"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function interactive(el) {
  if (!el || !el.closest) return false;
  if (el.closest(INTERACTIVE) || el.closest('#egg-toasts, .toasts')) return true;
  for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).cursor === 'pointer') return true;
  return false;
}
const typingIn = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

let installed = false;
export function installFx() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  fxPage.value = true;

  // Background clicks: shards, a glass note, the combo.
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || interactive(e.target)) return;
    const now = performance.now();
    const fast = now - comboLast < 420;
    const rare = !(fast && comboCount >= COMBO_TIERS[0] - 1) && Math.random() < 1 / 12;
    burst(e.clientX, e.clientY, rare);
    play('click', { x: e.clientX, rare, step: fast ? Math.min(comboCount, 14) : undefined });
    if (fxOn() && !e.target.closest('[data-title-stunt]')) bumpCombo(e.clientX, e.clientY);
  }, { passive: true });

  // A quiet tick on buttons and links. Openers have the flip sound, pagers
  // turn a page, tabs switch the view.
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest) return;
    const flip = e.target.closest('[data-flip]');
    if (flip) { rememberOrigin(flip); return; }
    const el = e.target.closest('button, a, summary, [role="button"], [role="option"], [role="tab"]');
    if (!el || el.disabled || el.closest('[data-quiet]')) return;
    if (el.closest('.pager')) { play('page', { next: /next/i.test(el.getAttribute('aria-label') || '') }); return; }
    if (el.matches('[role="tab"]')) { if (el.getAttribute('aria-selected') !== 'true') play('view'); return; }
    play('ui');
  }, { passive: true });

  // Openers reached by keyboard grow out of where they are too.
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-flip]')) rememberOrigin(e.target);
  }, true);

  // Checkboxes toggle, selects and radios tick.
  document.addEventListener('change', e => {
    const el = e.target;
    if (!el || !el.matches || el.closest('[data-quiet]')) return;
    if (el.matches('input[type="checkbox"]')) play('toggle', { on: el.checked });
    else if (el.matches('select, input[type="radio"]')) play('ui');
  });

  // Typing in text boxes, and the typed secrets outside them.
  let konami = 0, typed = '';
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && el.matches && el.matches('input[type="text"], input[type="search"], input[type="password"], input[type="number"], input:not([type]), textarea')) {
      if (e.repeat && e.key !== 'Backspace') return;
      const kind = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' || e.key === 'Delete' ? 'back' : e.key.length === 1 ? 'key' : null;
      if (kind) play('type', { kind });
      return;
    }
    if (typingIn(el) || document.querySelector('dialog[open]')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konami = key === KONAMI[konami] ? konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) { konami = 0; bedDestroyed(); return; }
    if (key.length !== 1) return;
    typed = (typed + key).slice(-12);
    if (typed.endsWith('bedwars')) { typed = ''; bedDestroyed(); }
    else if (typed.endsWith('gg')) { typed = ''; chatLine(pick(['gg', 'gg wp', 'ggs', 'gg go next', 'gg that was close'])); }
    else if (typed.endsWith('ez')) { typed = ''; chatLine(pick(EZ)); }
  });

  // Mouse over a card: the faintest tick. Over a podium place: its chime.
  let lastOver = null;
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const card = e.target.closest && e.target.closest('.sweat-card, .rank-entry');
    if (!card || card === lastOver) { if (!card) lastOver = null; return; }
    lastOver = card;
    const medal = card.querySelector('[data-medal]');
    if (medal) play('chime', { place: Number(medal.dataset.medal) });
    else if (card.matches('.sweat-card')) play('hover', { x: e.clientX });
  }, { passive: true });

  // How far down the page you are colours the music.
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      setMood({ depth: max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0 });
    });
  }, { passive: true });
}
