// Prism sounds: every sound is synthesized with the Web Audio API (no files
// to load). Glass beads and crystal runs in D major pentatonic, plus a slow
// airy song underneath. Ported from the old tracker's Prism set.
//
// Browsers won't start audio before the first click or key, so the context
// is resumed on that first gesture. Settings live in prefs (sound, volume,
// music) and apply live.
import { prefs, season } from './prefs.js';

const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
export const soundAvailable = !!AC;

const MUSIC_LEVEL = 0.32;
const MAX_VOICES = 160;
let musicQuiet = 1;
const musicLevel = () => MUSIC_LEVEL * musicQuiet;
// What the page is doing: depth is how far down you've scrolled (0-1),
// busy is true while a lookup runs. The music reads both.
const mood = { depth: 0, busy: false };
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, airBuf = null;
let curOut = null;
let voices = 0;

const on = () => prefs.value.sound !== false;
const rnd = (a, b) => a + Math.random() * (b - a);
const choose = arr => arr[Math.floor(Math.random() * arr.length)];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const masterLevel = () => (on() ? Math.pow(Math.max(0, Math.min(100, Number(prefs.value.volume) || 0)) / 100, 1.4) : 0);
const musicOn = () => on() && prefs.value.music !== false;

function makeNoise(c, secs = 2) {
  const len = c.sampleRate * secs;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function init() {
  if (ctx || !AC) return !!ctx;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5;
  comp.attack.value = 0.003; comp.release.value = 0.25;
  // A fast limiter last, so stacked sounds squash instead of clipping.
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.001; lim.release.value = 0.1;
  master = ctx.createGain(); master.gain.value = masterLevel();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain(); musicBus.gain.value = 0;
  sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
  noiseBuf = makeNoise(ctx);
  airBuf = makeNoise(ctx, 10);
  return true;
}

// Only while the context runs: sounds queued while suspended would all
// burst out at once on resume.
const ready = () => ctx && ctx.state === 'running' && on() && voices < MAX_VOICES;
const T = () => ctx.currentTime + 0.005;

// ---- Primitives ----
function gainNode(v, dest) {
  const n = ctx.createGain();
  n.gain.value = v;
  if (dest) n.connect(dest);
  return n;
}
function panNode(pan, dest) {
  if (!pan || !ctx.createStereoPanner) return dest;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}
function track(src, until) {
  voices++;
  src.onended = () => { voices--; };
  src.stop(until);
}
function envelope(param, t, peak, a, d) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// tone(t, { type, f, f2, glide, dur, gain, a, hold, lp, bp, hp, fEnd, fDur, q, pan, dest, detune, vib })
function tone(t, o) {
  const dur = o.dur || 0.2;
  const a = o.a != null ? o.a : 0.005;
  const g = gainNode(0, panNode(o.pan, o.dest || curOut));
  let head = g;
  if (o.lp || o.bp || o.hp) {
    const f = ctx.createBiquadFilter();
    f.type = o.lp ? 'lowpass' : o.bp ? 'bandpass' : 'highpass';
    f.frequency.setValueAtTime(o.lp || o.bp || o.hp, t);
    if (o.fEnd) f.frequency.exponentialRampToValueAtTime(o.fEnd, t + (o.fDur || dur));
    f.Q.value = o.q != null ? o.q : 0.8;
    f.connect(g);
    head = f;
  }
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || dur));
  if (o.detune) osc.detune.value = o.detune;
  osc.connect(head);
  if (o.hold) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + a);
    g.gain.setValueAtTime(o.gain, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.hold + dur);
  } else {
    envelope(g.gain, t, o.gain != null ? o.gain : 0.2, a, dur);
  }
  osc.start(t);
  track(osc, t + a + (o.hold || 0) + dur + 0.05);
}

// noise(t, { dur, gain, a, type, f, f2, fDur, q, pan, dest, swell })
// swell: where (0-1) it peaks, for whooshes instead of hits.
function noise(t, o) {
  const dur = o.dur || 0.2;
  const g = gainNode(0, panNode(o.pan, o.dest || curOut));
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.f || 1200, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fDur || dur));
  f.Q.value = o.q != null ? o.q : 1;
  f.connect(g);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.connect(f);
  const peak = o.gain != null ? o.gain : 0.2;
  if (o.swell != null) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * o.swell);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else {
    envelope(g.gain, t, peak, o.a != null ? o.a : 0.002, dur);
  }
  src.start(t, Math.random() * 1.5);
  track(src, t + dur + 0.05);
}

// A glass bead struck: a stack of inharmonic partials.
function glass(t, f, o = {}) {
  (o.ratios || [1, 2.32, 4.25, 6.63]).forEach((r, i) => tone(t, {
    f: f * r, dur: (o.dur || 0.6) / (1 + i * 0.7), gain: (o.gain || 0.06) / (1 + i * 1.3),
    a: o.a || 0.002, pan: o.pan, dest: o.dest
  }));
}
// Air rubbing past glass, for movement.
const airSweep = (t, from, to, o = {}) => noise(t, { type: 'bandpass', f: from, f2: to, q: 1.4, dur: o.dur || 0.25, gain: o.gain || 0.04, swell: 0.5, pan: o.pan });
function thud(t, o = {}) {
  tone(t, { f: o.f || 130, f2: o.f2 || 45, dur: o.dur || 0.22, gain: o.gain || 0.5, a: 0.002, pan: o.pan });
  noise(t, { type: 'lowpass', f: o.nf || 900, dur: o.ndur || 0.08, gain: (o.gain || 0.5) * 0.5, pan: o.pan });
}
let growlCurve = null;
function shaper() {
  if (!growlCurve) {
    growlCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) growlCurve[i] = Math.tanh(((i / 1023) * 2 - 1) * 6);
  }
  const s = ctx.createWaveShaper();
  s.curve = growlCurve;
  return s;
}

// D major pentatonic: bright and never clashing.
const SCALE = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95];

const SOUNDS = {
  // A glass bead, walking up the scale on repeated clicks.
  click(t, o) { glass(t, midi(SCALE[(o.step != null ? o.step : Math.floor(rnd(0, 6))) % 6]), { gain: 0.07, dur: 0.45, pan: o.pan }); },
  // A crystal run with a shimmer on top.
  rare(t, o) {
    [0, 2, 4, 7].forEach((k, i) => glass(t + i * 0.055, midi(SCALE[k]), { gain: 0.06, dur: 0.9, pan: o.pan }));
    noise(t + 0.1, { type: 'highpass', f: 7000, dur: 0.5, gain: 0.025, swell: 0.3, pan: o.pan });
  },
  combo(t, o) { const tier = o.tier || 0; for (let i = 0; i < 3 + tier; i++) glass(t + i * 0.05, midi(SCALE[Math.min(9, i + tier)]), { gain: 0.05, dur: 0.6 }); },
  ui(t) { glass(t, midi(98), { gain: 0.03, dur: 0.12, ratios: [1, 2.32] }); },
  toggle(t, o) { glass(t, midi(o.on ? 86 : 81), { gain: 0.045, dur: 0.25 }); if (o.on) glass(t + 0.05, midi(90), { gain: 0.03, dur: 0.3 }); },
  save(t) { [81, 88].forEach((n, i) => glass(t + i * 0.08, midi(n), { gain: 0.05, dur: 0.6 })); },
  delete(t) { glass(t, midi(69), { gain: 0.05, dur: 0.4 }); airSweep(t, 3000, 500, { dur: 0.3, gain: 0.04 }); },
  slide(t, o) { airSweep(t, o.open ? 600 : 3200, o.open ? 3200 : 600, { dur: 0.22, gain: 0.08 }); },
  page(t, o) { airSweep(t, o.next ? 1200 : 2600, o.next ? 2600 : 1200, { dur: 0.14, gain: 0.03 }); glass(t + 0.06, midi(o.next ? 88 : 83), { gain: 0.025, dur: 0.2 }); },
  view(t) { glass(t, midi(86), { gain: 0.035, dur: 0.25 }); },
  type(t, o) {
    if (o.kind === 'enter') { [86, 93].forEach((n, i) => glass(t + i * 0.05, midi(n), { gain: 0.035, dur: 0.3 })); return; }
    glass(t, o.kind === 'back' ? midi(79) : rnd(2400, 3200), { gain: 0.018, dur: 0.06, ratios: [1, 2.32] });
  },
  flipOpen(t, o) { const d = (o.duration || 600) / 1000; airSweep(t, 500, 4000, { dur: d * 0.6, gain: 0.05 }); glass(t + d * 0.7, midi(88), { gain: 0.05, dur: 0.7 }); },
  flipClose(t) { airSweep(t, 3500, 600, { dur: 0.18, gain: 0.12 }); },
  scanStart(t) { [81, 86].forEach((n, i) => glass(t + i * 0.08, midi(n), { gain: 0.04, dur: 0.3 })); },
  scanTick(t) { glass(t, midi(choose([93, 95, 98])), { gain: 0.022, dur: 0.18, ratios: [1, 2.32] }); },
  found(t) { [74, 78, 81, 86].forEach((n, i) => glass(t + i * 0.07, midi(n), { gain: 0.06, dur: 0.8 })); },
  error(t) { glass(t, midi(62), { gain: 0.06, dur: 0.5 }); glass(t + 0.12, midi(61), { gain: 0.05, dur: 0.6 }); },
  success(t) {
    [74, 81, 86, 90, 93].forEach((n, i) => glass(t + i * 0.06, midi(n), { gain: 0.06, dur: 1.1 }));
    noise(t + 0.25, { type: 'highpass', f: 6500, dur: 0.6, gain: 0.03, swell: 0.3 });
  },
  // The title splitting apart and snapping back.
  stunt(t) {
    for (let i = 0; i < 10; i++) glass(t + i * 0.09, midi(SCALE[i]), { gain: 0.035, dur: 0.5, pan: i % 2 ? 0.4 : -0.4 });
    [62, 74, 78, 81, 86].forEach(n => glass(t + 1.15, midi(n), { gain: 0.06, dur: 1.8 }));
  },
  // Passing over a card: the faintest tick.
  hover(t) { glass(t, rnd(2600, 3000), { gain: 0.012, dur: 0.08, ratios: [1, 2.32] }); },
  // Podium places 1-3, brightest for first.
  chime(t, o) {
    const place = Math.min(3, Math.max(1, o.place || 1));
    const root = [86, 81, 78][place - 1];
    [0, 4, 7, 12].slice(0, 5 - place).forEach((iv, i) => glass(t + i * 0.05, midi(root + iv), { gain: 0.05, dur: 0.8 }));
  },
  // Someone else's sweat arriving live.
  arrive(t) {
    airSweep(t, 500, 5000, { dur: 0.5, gain: 0.04 });
    [78, 81, 86, 90].forEach((n, i) => glass(t + 0.35 + i * 0.09, midi(n), { gain: 0.045, dur: 0.9 }));
  },
  // A Minecraft note-block pling, for chat toasts.
  chat(t) {
    [78, 85].forEach((n, i) => {
      tone(t + i * 0.09, { type: 'triangle', f: midi(n), dur: 0.35, gain: 0.08 });
      tone(t + i * 0.09, { f: midi(n + 12), dur: 0.2, gain: 0.03 });
    });
  },
  techno(t) {
    [[67, 0], [72, 0.16], [76, 0.32], [79, 0.5]].forEach(([n, k], i) => {
      const hold = i === 3 ? 0.6 : 0.08;
      tone(t + k, { type: 'sawtooth', f: midi(n), dur: 0.35, hold, gain: 0.05, a: 0.03, lp: 700, fEnd: 2600, fDur: 0.12 });
      tone(t + k, { type: 'sawtooth', f: midi(n - 12), dur: 0.35, hold, gain: 0.03, a: 0.03, lp: 600 });
    });
  },
  // BED DESTROYED: the bed drops and lands, then the growl smash, debris
  // and a low stinger. Timed to the scene's 0.7s break.
  bed(t) {
    noise(t, { type: 'bandpass', f: 2500, f2: 300, q: 0.7, dur: 0.42, gain: 0.12, swell: 0.8 });
    thud(t + 0.42, { f: 140, f2: 50, gain: 0.5 });
    const b = t + 0.7;
    const out = gainNode(0, curOut);
    out.gain.setValueAtTime(0.0001, b);
    out.gain.linearRampToValueAtTime(0.16, b + 0.06);
    out.gain.setValueAtTime(0.16, b + 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, b + 1.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
    const ws = shaper();
    ws.connect(bp); bp.connect(out);
    [55, 58, 82].forEach(f => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.3, b);
      o.frequency.exponentialRampToValueAtTime(f, b + 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, b + 1.6);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 18;
      lfo.connect(gainNode(f * 0.08, o.frequency));
      lfo.start(b); lfo.stop(b + 1.7);
      o.connect(ws);
      o.start(b);
      track(o, b + 1.7);
    });
    tone(b, { f: 90, f2: 28, dur: 0.9, gain: 0.7, a: 0.002 });
    noise(b, { type: 'lowpass', f: 5000, f2: 300, dur: 0.9, gain: 0.3 });
    for (let i = 0; i < 18; i++) noise(b + 0.1 + rnd(0, 0.9), { type: 'bandpass', f: rnd(800, 2600), q: 3, dur: 0.03, gain: 0.08, pan: rnd(-0.8, 0.8) });
    [45, 48, 52].forEach(n => tone(b + 0.1, { type: 'sawtooth', f: midi(n), dur: 1.4, hold: 0.6, gain: 0.03, a: 0.1, lp: 900 }));
  }
};


// ---- Christmas ----
// A music box and celesta, glockenspiel, sleigh bells and church bells,
// crunching snow and wrapping paper. Used while the Christmas look is on.
const xmOn = () => season.value === 'christmas';
// A celesta / music-box tine: a sine with a quiet octave and a faint
// inharmonic "tine", quick attack, a long soft ring.
function celesta(t, n, o = {}) {
  const f = midi(n), g = o.gain != null ? o.gain : 0.08, dur = o.dur || 1.3;
  tone(t, { f, dur, gain: g, a: 0.002, pan: o.pan, dest: o.dest });
  tone(t, { f: f * 2, dur: dur * 0.45, gain: g * 0.32, a: 0.002, pan: o.pan, dest: o.dest });
  tone(t, { f: f * 5.93, dur: dur * 0.12, gain: g * 0.2, a: 0.001, pan: o.pan, dest: o.dest });
}
const glock = (t, n, o = {}) => glass(t, midi(n), { ratios: [1, 2.76, 5.4], dur: o.dur || 0.9, gain: o.gain || 0.05, pan: o.pan, dest: o.dest });
// One shake of sleigh bells: a handful of tiny bright jingles.
function jingle(t, o = {}) {
  const g = o.gain || 0.035, n = o.n || 4, spread = o.spread || 0.05;
  for (let i = 0; i < n; i++) {
    glass(t + rnd(0, spread), rnd(2900, 4300), { ratios: [1, 1.47, 2.09], dur: rnd(0.12, 0.22), gain: g * rnd(0.6, 1), pan: (o.pan || 0) + rnd(-0.12, 0.12), dest: o.dest });
  }
  noise(t, { type: 'highpass', f: 6500, dur: 0.05 + spread, gain: g * 0.5, pan: o.pan, dest: o.dest });
}
// A church bell: a low hum, the strike tone with its minor third, long overtones.
function church(t, n, o = {}) {
  const f = midi(n), g = o.gain || 0.06, dur = o.dur || 3.2;
  [[0.5, 1, 1], [1, 0.9, 0.85], [1.19, 0.5, 0.6], [1.5, 0.35, 0.5], [2, 0.4, 0.45], [2.52, 0.18, 0.3]].forEach(([r, k, d]) =>
    tone(t, { f: f * r, dur: dur * d, gain: g * k, a: 0.002, pan: o.pan, dest: o.dest }));
}
// Boots in snow: a soft squeaky crunch.
function crunch(t, o = {}) {
  const g = o.gain || 0.06, n = o.n || 5, dur = o.dur || 0.08;
  for (let i = 0; i < n; i++) noise(t + rnd(0, dur), { type: 'bandpass', f: rnd(1400, 3200), q: rnd(3, 7), dur: rnd(0.01, 0.03), gain: g * rnd(0.5, 1), pan: o.pan });
  noise(t, { type: 'lowpass', f: 700, dur: dur + 0.03, gain: g * 0.5, pan: o.pan });
}
// Wrapping paper torn.
function rip(t, dur, o = {}) {
  const g = o.gain || 0.08;
  noise(t, { type: 'bandpass', f: 2200, f2: 4200, q: 0.8, dur, gain: g, swell: 0.3, pan: o.pan });
  for (let i = 0; i < Math.round(dur * 40); i++) noise(t + rnd(0, dur), { type: 'bandpass', f: rnd(1800, 5000), q: 2, dur: 0.012, gain: g * rnd(0.4, 1), pan: o.pan });
}
// The melody the clicks walk through: Jingle Bells, one note a click.
const XM_WALK = [76, 76, 76, 76, 76, 76, 76, 79, 72, 74, 76, 77, 77, 77, 77, 77, 76, 76, 76, 76, 74, 74, 76, 74, 79];
let walk = 0;
const XM = {
  xmNote(t, o) { celesta(t, XM_WALK[walk++ % XM_WALK.length], { gain: 0.07, dur: 0.9, pan: o.pan }); },
  xmRare(t, o) {
    [72, 76, 79, 84].forEach((n, i) => celesta(t + i * 0.06, n, { gain: 0.06, dur: 1.2, pan: o.pan }));
    jingle(t + 0.1, { gain: 0.03, pan: o.pan });
  },
  xmCombo(t, o) { const tier = o.tier || 0; for (let i = 0; i < 3 + tier; i++) celesta(t + i * 0.05, [72, 76, 79, 84, 88, 91, 96][Math.min(6, i + tier)], { gain: 0.05, dur: 0.8 }); jingle(t, { gain: 0.03 }); },
  xmTick(t, o) { glock(t, choose([91, 96]), { gain: 0.025, dur: 0.18, pan: o.pan }); },
  xmToggle(t, o) { celesta(t, o.on === false ? 79 : 84, { gain: 0.05, dur: 0.6 }); celesta(t + 0.07, o.on === false ? 72 : 88, { gain: 0.04, dur: 0.7 }); },
  xmSuccess(t) {
    [72, 76, 79, 84, 88].forEach((n, i) => celesta(t + i * 0.07, n, { gain: 0.06, dur: 1.4 }));
    jingle(t + 0.3, { gain: 0.035, n: 6, spread: 0.12 });
  },
  xmChime(t, o) { const root = [84, 79, 76][Math.min(3, Math.max(1, o.place || 1)) - 1]; [0, 4, 7].forEach((iv, i) => glock(t + i * 0.05, root + iv, { gain: 0.04 })); },
  xmType(t, o) {
    if (o.kind === 'enter') { celesta(t, 84, { gain: 0.04, dur: 0.5 }); celesta(t + 0.06, 88, { gain: 0.035, dur: 0.6 }); return; }
    crunch(t, { gain: o.kind === 'back' ? 0.035 : 0.05, n: 3, dur: 0.05 });
  },
  xmShake(t, o) { jingle(t, { gain: 0.03 * (o.gain || 1), pan: o.pan, n: 3, spread: 0.04 }); },
  xmHoho(t, o) {
    [0, 0.3, 0.6].forEach((k, i) => {
      const f = (i === 2 ? 104 : 116) * rnd(0.98, 1.02);
      tone(t + k, { type: 'sawtooth', f, f2: f * 0.86, dur: 0.2, hold: 0.06, gain: 0.08, bp: 620, q: 2.2, a: 0.02, pan: o.pan });
      tone(t + k, { type: 'sawtooth', f, f2: f * 0.86, dur: 0.16, hold: 0.05, gain: 0.028, bp: 1050, q: 3, a: 0.02, pan: o.pan });
    });
  },
  xmPop(t, o) {
    noise(t, { type: 'bandpass', f: 2600, q: 0.6, dur: 0.05, gain: 0.18, pan: o.pan });
    for (let i = 0; i < 4; i++) glass(t + 0.02 + rnd(0, 0.12), rnd(3800, 6200), { gain: 0.03, dur: 0.15, pan: o.pan });
  },
  xmRelight(t, o) { glock(t, choose([84, 88, 91]), { gain: 0.03, dur: 0.4, pan: o.pan }); },
  xmFixed(t) { [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => glock(t + i * 0.07, n, { gain: 0.04, dur: 0.7 })); },
  xmPresent(t, o) {
    rip(t, 0.32, { gain: 0.07, pan: o.pan });
    [79, 84, 88, 91, 96].forEach((n, i) => celesta(t + 0.3 + i * 0.07, n, { gain: 0.06, dur: 1.4, pan: o.pan }));
    jingle(t + 0.35, { gain: 0.035, n: 6, spread: 0.15, pan: o.pan });
  },
  xmSwish(t, o) { noise(t, { type: 'bandpass', f: 900, f2: 3800, q: 1.2, dur: 0.3, gain: 0.05, swell: 0.4, pan: o.pan }); crunch(t, { gain: 0.03, n: 3, pan: o.pan }); },
  xmBell(t) { church(t, 60, { gain: 0.05 }); church(t + 0.9, 55, { gain: 0.04 }); },
  xmFlakes(t, o) { glock(t, choose([96, 98, 100, 103]), { gain: 0.02, dur: 0.3, pan: o.pan }); }
};
Object.assign(SOUNDS, XM);
// Which Christmas sound stands in for each everyday one.
const XM_FOR = { click: 'xmNote', rare: 'xmRare', combo: 'xmCombo', ui: 'xmTick', view: 'xmTick', toggle: 'xmToggle', save: 'xmToggle', success: 'xmSuccess', found: 'xmSuccess', chime: 'xmChime', type: 'xmType', hover: 'xmFlakes' };
const XM_TRIM = { xmNote: 0, xmRare: 0, xmCombo: -2, xmTick: 0, xmToggle: -3, xmSuccess: -3, xmChime: -4, xmType: 6, xmShake: 2, xmHoho: 0, xmPop: -2, xmRelight: 2, xmFixed: -3, xmPresent: -2, xmSwish: 3, xmBell: -2, xmFlakes: 12 };

// Per-sound trims in dB, measured so each kind of moment sits at the same
// loudness (from the old tracker).
const TRIM = { hover: 15, click: 0, rare: 0, combo: -2, ui: -2, toggle: -5, save: -1, delete: 4, slide: 6, page: 2, view: 1, type: 8, flipOpen: 1, flipClose: 7, scan: 0, found: -3, error: 0, success: -3, stunt: -8, chime: -5, arrive: -3, bed: -5, chat: -2 };
const MUSIC_TRIM = Math.pow(10, -1 / 20);

function schedule(name, t, opts = {}) {
  if (xmOn() && XM_FOR[name]) name = XM_FOR[name];
  const key = name === 'scanStart' || name === 'scanTick' ? 'scan' : name;
  const prev = curOut;
  curOut = gainNode(Math.pow(10, ((TRIM[key] ?? XM_TRIM[key] ?? 0) + (opts.trim || 0)) / 20), sfxBus);
  try { SOUNDS[name](t, opts); } finally { curOut = prev; }
}

// ---- Music ----
// Bars of "note:beats" tokens ("E5:1.5", "-:1" for a rest), split by "|".
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteNum = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (+m[3] + 1) + STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const parseBars = src => src.split('|').map(bar => {
  let at = 0;
  return bar.trim().split(/\s+/).filter(Boolean).map(tok => {
    const [n, len] = tok.split(':');
    const ev = n === '-' ? null : { at, n: noteNum(n), len: +len };
    at += +len;
    return ev;
  }).filter(Boolean);
});

// Slow and airy, like light moving in a quiet room: a soft pad of warm
// sines, a glass melody with a long echo, a faint shimmer of air. D major
// with a Lydian lift on the IV. Deeper down the page the pad opens up; a
// lookup adds a quick glass arpeggio.
function song(bus, add) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 0.4;
  lp.connect(gainNode(1, bus));
  const air = ctx.createBufferSource(); air.buffer = airBuf; air.loop = true; air.playbackRate.value = 0.6;
  const airBp = ctx.createBiquadFilter(); airBp.type = 'bandpass'; airBp.frequency.value = 5200; airBp.Q.value = 0.6;
  air.connect(airBp); airBp.connect(gainNode(0.006, bus)); add(air);
  const echo = ctx.createDelay(1.5); echo.delayTime.value = 0.62;
  echo.connect(gainNode(0.32, echo));
  echo.connect(gainNode(0.5, bus));
  const beat = 0.8;
  const chords = 'D3 A3 F#4|B2 F#3 D4|G2 D3 B3|A2 E3 C#4|D3 A3 F#4|F#2 C#3 A3|G2 D3 B3|A2 E3 G3'.split('|').map(c => c.trim().split(/\s+/).map(noteNum));
  const bars = parseBars('F#5:2 A5:1 E5:1|D5:3 -:1|B4:1.5 D5:.5 G5:2|E5:3 -:1|A5:2 F#5:1 D5:1|C#5:3 -:1|D5:1 E5:1 B5:2|A5:3 -:1');
  let n = 0;
  return t => {
    const i = n++ % bars.length;
    const chord = chords[i];
    const bar = beat * 4;
    lp.frequency.setTargetAtTime(1200 + mood.depth * 1400, t, 2);
    chord.forEach((m, k) => [-5, 5].forEach(dt => tone(t + k * 0.05, { f: midi(m), detune: dt, dur: bar * 0.6, hold: bar * 0.5, a: 0.9, gain: 0.03, dest: lp })));
    tone(t, { type: 'triangle', f: midi(chord[0] - 12), dur: bar * 0.5, hold: bar * 0.4, a: 0.3, gain: 0.05, lp: 300, dest: bus });
    bars[i].forEach(ev => {
      const dur = Math.min(2.4, ev.len * beat * 1.4);
      glass(t + ev.at * beat, midi(ev.n), { gain: 0.035, dur, dest: echo });
      glass(t + ev.at * beat, midi(ev.n), { gain: 0.03, dur, dest: bus });
    });
    if (mood.busy) for (let k = 0; k < 8; k++) glass(t + k * beat / 2, midi(chord[k % 3] + 24), { gain: 0.012, dur: 0.3, dest: bus });
    return bar;
  };
}


// Christmas music: a soft music box over a warm pad, playing public-domain
// carols one after another (Jingle Bells, Deck the Halls, We Wish You a
// Merry Christmas, Silent Night), with a little sleigh bell in Jingle Bells.
const XM_CHORDS = { C: 'C3 G3 E4', F: 'F2 C3 A3', G: 'G2 D3 B3', G7: 'G2 F3 B3', D: 'D3 A3 F#4', Am: 'A2 E3 C4' };
const tune = (beat, bells, melody, chords) => ({
  beat, bells,
  bars: melody.split('|').map(bar => {
    let at = 0;
    const notes = [];
    bar.trim().split(/\s+/).forEach(tok => { const [n, len] = tok.split(':'); if (n !== '-') notes.push({ at, n: noteNum(n), len: +len }); at += +len; });
    return { notes, len: at };
  }),
  chords: chords.split(' ').map(c => XM_CHORDS[c].split(' ').map(noteNum))
});
const XM_TUNES = [
  tune(0.42, true,
    'E5:1 E5:1 E5:2|E5:1 E5:1 E5:2|E5:1 G5:1 C5:1.5 D5:.5|E5:4|F5:1 F5:1 F5:1.5 F5:.5|F5:1 E5:1 E5:1 E5:.5 E5:.5|E5:1 D5:1 D5:1 E5:1|D5:2 G5:2|' +
    'E5:1 E5:1 E5:2|E5:1 E5:1 E5:2|E5:1 G5:1 C5:1.5 D5:.5|E5:4|F5:1 F5:1 F5:1.5 F5:.5|F5:1 E5:1 E5:1 E5:.5 E5:.5|G5:1 G5:1 F5:1 D5:1|C5:4',
    'C C C C F C G G C C C C F C G7 C'),
  tune(0.46, false,
    'G5:1.5 F5:.5 E5:1 D5:1|C5:1 D5:1 E5:1 C5:1|D5:.5 E5:.5 F5:.5 D5:.5 E5:1.5 D5:.5|C5:1 B4:1 C5:2|' +
    'G5:1.5 F5:.5 E5:1 D5:1|C5:1 D5:1 E5:1 C5:1|D5:.5 E5:.5 F5:.5 D5:.5 E5:1.5 D5:.5|C5:1 B4:1 C5:2|' +
    'D5:1.5 E5:.5 F5:1 D5:1|E5:1.5 F5:.5 G5:1 D5:1|E5:.5 F#5:.5 G5:1 A5:.5 B5:.5 C6:1|B5:1 A5:1 G5:2|' +
    'G5:1.5 F5:.5 E5:1 D5:1|C5:1 D5:1 E5:1 C5:1|A5:.5 A5:.5 A5:.5 A5:.5 G5:1.5 F5:.5|E5:1 D5:1 C5:2',
    'C C G C C C G C G C D G C C F C'),
  tune(0.44, false,
    '-:2 G5:1|C6:1 C6:.5 D6:.5 C6:.5 B5:.5|A5:1 A5:1 A5:1|D6:1 D6:.5 E6:.5 D6:.5 C6:.5|B5:1 G5:1 G5:1|E6:1 E6:.5 F6:.5 E6:.5 D6:.5|C6:1 A5:1 G5:.5 G5:.5|A5:1 D6:1 B5:1|C6:3',
    'C C F D G Am F G C'),
  tune(0.5, false,
    'G5:1.5 A5:.5 G5:1|E5:3|G5:1.5 A5:.5 G5:1|E5:3|D6:2 D6:1|B5:3|C6:2 C6:1|G5:3|' +
    'A5:2 A5:1|C6:1.5 B5:.5 A5:1|G5:1.5 A5:.5 G5:1|E5:3|A5:2 A5:1|C6:1.5 B5:.5 A5:1|G5:1.5 A5:.5 G5:1|E5:3|' +
    'D6:2 D6:1|F6:1.5 D6:.5 B5:1|C6:3|E6:3|C6:1 G5:1 E5:1|G5:1.5 F5:.5 D5:1|C5:3|-:3',
    'C C C C G G C C F F C C F F C C G G C C C G7 C C')
];
function carols(bus) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1000; lp.Q.value = 0.4;
  lp.connect(gainNode(1, bus));
  const echo = ctx.createDelay(1.5); echo.delayTime.value = 0.48;
  echo.connect(gainNode(0.28, echo));
  echo.connect(gainNode(0.4, bus));
  let ti = Math.floor(Math.random() * XM_TUNES.length), bi = 0;
  return t => {
    const tn = XM_TUNES[ti];
    const bar = tn.bars[bi], chord = tn.chords[bi];
    const beat = tn.beat, len = bar.len * beat;
    chord.forEach((m, k) => [-4, 4].forEach(dt => tone(t + k * 0.04, { f: midi(m), detune: dt, dur: len * 0.7, hold: len * 0.45, a: 0.5, gain: 0.022, dest: lp })));
    tone(t, { type: 'triangle', f: midi(chord[0] - 12), dur: len * 0.5, hold: len * 0.3, a: 0.05, gain: 0.04, lp: 280, dest: bus });
    bar.notes.forEach(ev => {
      const dur = Math.min(2.2, 0.6 + ev.len * beat);
      celesta(t + ev.at * beat, ev.n, { gain: 0.04, dur, dest: bus });
      celesta(t + ev.at * beat, ev.n, { gain: 0.02, dur, dest: echo });
    });
    if (tn.bells) for (let b = 1; b < bar.len; b += 2) jingle(t + b * beat, { gain: 0.012, n: 3, spread: 0.03, dest: bus });
    if (mood.busy) for (let k = 0; k < 4; k++) glock(t + k * beat, chord[k % 3] + 36, { gain: 0.01, dur: 0.3, dest: bus });
    if (++bi >= tn.bars.length) { bi = 0; ti = (ti + 1) % XM_TUNES.length; return len + beat * 4; }
    return len;
  };
}

let music = null;
function stopMusic(fade = 1.2) {
  if (!music) return;
  const m = music;
  music = null;
  clearTimeout(m.timer);
  const t = ctx.currentTime;
  m.bus.gain.cancelScheduledValues(t);
  m.bus.gain.setValueAtTime(m.bus.gain.value, t);
  m.bus.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => { m.nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); m.bus.disconnect(); }, fade * 1000 + 100);
}
function startMusic() {
  if (!ctx || music || !musicOn()) return;
  const bus = gainNode(0, musicBus);
  const nodes = [];
  const next = (xmOn() ? carols : song)(bus, n => { n.start(); nodes.push(n); });
  const t = ctx.currentTime;
  bus.gain.setValueAtTime(0, t);
  bus.gain.linearRampToValueAtTime(MUSIC_TRIM, t + 0.6);
  const m = { bus, nodes, timer: 0, at: t + 0.05 };
  // Queue bars up to 1s ahead so a throttled background timer can't stutter them.
  const pump = () => {
    if (music !== m) return;
    while (m.at < ctx.currentTime + 1) {
      if (m.at > ctx.currentTime && voices < MAX_VOICES - 10) m.at += next(m.at);
      else m.at = ctx.currentTime + 0.1 + next(ctx.currentTime + 0.1);
    }
    m.timer = setTimeout(pump, 400);
  };
  music = m;
  pump();
}

function applyLevels(fade = 0.15) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [g, v, f] of [[master.gain, masterLevel(), fade], [musicBus.gain, musicOn() ? musicLevel() : 0, fade * 4]]) {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + f);
  }
  if (musicOn()) startMusic();
  else setTimeout(() => { if (!musicOn()) stopMusic(0.3); }, fade * 4000);
}

// ---- Unlock on the first gesture ----
let unlocked = false;
function unlock() {
  if (!on() || !init()) return;
  const go = () => { if (!unlocked) { unlocked = true; applyLevels(0.01); } };
  if (ctx.state === 'suspended') ctx.resume().then(go, () => {});
  else go();
}
if (AC) {
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
  let last = prefs.value;
  prefs.subscribe(p => {
    const changed = p.sound !== last.sound || p.volume !== last.volume || p.music !== last.music;
    last = p;
    if (!changed) return;
    if (p.sound && !ctx) return; // starts on the next click
    if (ctx) applyLevels();
  });
  // The holiday look changes the music.
  season.subscribe(() => { if (music) { stopMusic(0.8); setTimeout(() => { if (musicOn()) startMusic(); }, 900); } });
}

// ---- Public API ----
// Big moments pull the music down under them, then let it back up.
const DUCK = { bed: 3.2, techno: 1.2 };
function duck(t, secs) {
  if (!musicBus || !musicOn()) return;
  const g = musicBus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(musicLevel() * 0.3, t + 0.15);
  g.setValueAtTime(musicLevel() * 0.3, t + secs);
  g.linearRampToValueAtTime(musicLevel(), t + secs + 1.2);
}
const panFor = x => (x == null ? 0 : ((x / window.innerWidth) * 2 - 1) * 0.6);

let lastClick = 0, lastType = 0, lastHover = 0;
// play('found'), play('click', { x, step, rare }), play('toggle', { on }) ...
export function play(name, opts = {}) {
  if (!ready()) return;
  const t = T() + (opts.delay || 0);
  let trim = 0;
  if (name === 'click') {
    if (t - lastClick < 0.03) return;
    if (t - lastClick < 0.18) trim = -4; // a fast flurry gets quieter
    lastClick = t;
    if (opts.rare) name = 'rare';
  }
  if (name === 'type') { if (t - lastType < 0.025) return; lastType = t; }
  if (name === 'hover') { if (t - lastHover < 0.09) return; lastHover = t; }
  if (!SOUNDS[name]) return;
  if (DUCK[name]) duck(t, DUCK[name]);
  try { schedule(name, t, { ...opts, trim, pan: panFor(opts.x) }); } catch { /* a sound never breaks the page */ }
}

// A lookup in progress: a soft glass tick every 0.36s until scan(false).
let scanTimer = 0, scanAt = 0, scanning = false;
export function scan(active) {
  clearTimeout(scanTimer);
  mood.busy = !!active;
  scanning = !!active;
  if (!active || !ready()) return;
  schedule('scanStart', T());
  scanAt = T() + 0.36;
  const pump = () => {
    if (!scanning || !ctx) return;
    while (scanAt < ctx.currentTime + 0.3) {
      if (ready()) schedule('scanTick', Math.max(scanAt, T()));
      scanAt += 0.36;
    }
    scanTimer = setTimeout(pump, 120);
  };
  pump();
}

export function setMood(patch) { Object.assign(mood, patch); }

// Turn the music down (true) or back up (false), e.g. under a clip.
export function quietMusic(quiet) {
  const q = quiet ? 0.2 : 1;
  if (q === musicQuiet) return;
  musicQuiet = q;
  if (ctx) applyLevels(0.2);
}
