// Look-and-feel settings, kept per browser. Every setting is applied to
// <html> as a data attribute or CSS variable, so the stylesheets do the rest.
import { readJson, writeJson } from './storage.js';
import { signal } from './signal.js';

export const ACCENTS = {
  prism: { label: 'Prism', a: '#5ee7ff', b: '#a98bff', c: '#ffc46b' },
  aurora: { label: 'Aurora', a: '#4be3a8', b: '#5ee7ff', c: '#a98bff' },
  ember: { label: 'Ember', a: '#ff8a5c', b: '#ff5c8a', c: '#ffd36b' },
  rose: { label: 'Rose', a: '#ff7ab6', b: '#c58bff', c: '#ffb38a' },
  ocean: { label: 'Ocean', a: '#5cb8ff', b: '#5ee7ff', c: '#7a8bff' },
  mono: { label: 'Mono', a: '#e8ecf4', b: '#a8afbf', c: '#ffffff' }
};

export const DEFAULTS = {
  surface: 'dark',      // dark | oled | light
  accent: 'prism',      // a key of ACCENTS, or 'custom'
  custom: '#5ee7ff',    // the custom accent colour
  density: 'comfy',     // comfy | compact
  textScale: 100,       // % of the base size
  font: 'manrope',      // manrope | system | hyperlegible
  motion: 'system',     // system | reduce | full
  contrast: 'normal',   // normal | high
  effects: true,        // refracted light behind the page
  underline: false,     // always underline links
  numbers: 'full',      // full (12,345) | short (12.3k)
  decimals: 2,          // ratio decimals
  timeZone: 'local',    // local | an IANA zone
  hour12: true,
  mode: 'overall',      // default Bed Wars mode tab
  lbPeriod: 'lifetime', // default leaderboard period
  fx: true,             // click bursts and easter eggs (tracker)
  sound: true,          // sound effects (tracker)
  volume: 55,           // 0-100
  music: true           // background music under the sounds
};

const STORAGE = 'prismSitePrefs';
// The old tracker kept its sound settings under "siteAudio"; carry them over once.
function initial() {
  const saved = readJson(STORAGE, {});
  if (!('sound' in saved)) {
    const old = readJson('siteAudio', null);
    if (old && typeof old === 'object') {
      if (typeof old.muted === 'boolean') saved.sound = !old.muted;
      if (Number.isFinite(old.volume)) saved.volume = Math.round(Math.max(0, Math.min(1, old.volume)) * 100);
      if (typeof old.ambience === 'boolean') saved.music = old.ambience;
    }
  }
  return { ...DEFAULTS, ...saved };
}
export const prefs = signal(initial());
// Set by pages that have sounds and click effects, so Settings shows them.
export const fxPage = signal(false);

export function setPref(key, value) {
  prefs.value = { ...prefs.value, [key]: value };
  writeJson(STORAGE, prefs.value);
  apply();
}
export function resetPrefs() {
  prefs.value = { ...DEFAULTS };
  writeJson(STORAGE, prefs.value);
  apply();
}

const fontLinks = {
  hyperlegible: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap'
};
function loadFont(id) {
  const href = fontLinks[id];
  if (!href || document.querySelector(`link[data-font="${id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.font = id;
  document.head.appendChild(link);
}

// #rrggbb -> a lighter/darker mix, for custom accents.
function mix(hex, other, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(other)];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const validHex = v => /^#[0-9a-f]{6}$/i.test(v);

export function apply() {
  const p = prefs.value;
  const html = document.documentElement;
  html.dataset.surface = p.surface;
  html.dataset.density = p.density;
  html.dataset.font = p.font;
  html.dataset.contrast = p.contrast;
  html.dataset.effects = p.effects ? 'on' : 'off';
  html.dataset.underline = p.underline ? 'on' : 'off';
  const reduce = p.motion === 'reduce' || (p.motion === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  html.dataset.motion = reduce ? 'reduce' : 'full';
  html.style.setProperty('--text-scale', String(Math.min(140, Math.max(85, Number(p.textScale) || 100)) / 100));
  let acc = ACCENTS[p.accent];
  if (p.accent === 'custom' && validHex(p.custom)) acc = { a: p.custom, b: mix(p.custom, '#a98bff', 0.55), c: mix(p.custom, '#ffc46b', 0.55) };
  acc = acc || ACCENTS.prism;
  html.style.setProperty('--accent', acc.a);
  html.style.setProperty('--accent-2', acc.b);
  html.style.setProperty('--accent-3', acc.c);
  loadFont(p.font);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = p.surface === 'light' ? '#f4f6fb' : p.surface === 'oled' ? '#000000' : '#0c0f17';
}

if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', apply);
}
