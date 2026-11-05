// Prism Hall of Fame: a free-roam 3D hall of the 20 biggest sweats by index (FKDR^2 x stars).
// Walk it like a first-person game: WASD + mouse (pointer lock), Shift sprint, Space jump,
// or a thumb joystick on phones. Built live from the backend's /sweats list on every load.
// three.js comes pinned from jsDelivr through the page's import map. Every texture is made here
// (marble, stone and floor patterns are baked on the GPU at load), so there are no image files.
// hall-of-fame.html loads this file with a ?v= query: bump it there whenever this file changes.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- Data (live mode builds the top 20 from the sweat list) ----------
const API = "https://bedwars-backend.onrender.com";
const ROSTER_LABEL = { milo: "Milo", potat: "Potat", aballs: "ABoi", zoiv: "Zoiv", max: "Max", sqoz: "Sqoz", kermit: "Kermit", ssent: "Ssent", key: "Key" };
async function loadLive() {
  const btn = document.querySelector("#enter");
  const slow = setTimeout(() => { btn.textContent = "Waking up the server…"; }, 3000);
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { res = await fetch(API + "/sweats", { cache: "no-store" }); if (res.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 4000));
  }
  clearTimeout(slow);
  if (!res || !res.ok) throw new Error("Couldn't load the sweat list");
  const list = await res.json();
  const day = (r) => String(r.dateAdded || r.createdAt || "").slice(0, 10);
  const groups = new Map();
  list.forEach(s => { if (s.deletedAt) return; const k = s.uuid || String(s.username || "").toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
  const rows = [];
  groups.forEach(rs => {
    rs.sort((a, b) => (day(a) + (a.createdAt || "")).localeCompare(day(b) + (b.createdAt || "")));
    const l = rs[rs.length - 1]; const f = Number(l.fkdr) || 0, st = Number(l.star) || 0;
    const notes = []; rs.forEach(r => (r.notes || []).forEach(n => notes.push({ text: n.text, by: ROSTER_LABEL[n.author] || n.author || "", at: String(n.createdAt || "").slice(0, 10) })));
    const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
    rows.push({ name: l.username, uuid: l.uuid, index: Math.round(f * f * st), star: st, fkdr: r2(f), wlr: r2(l.wlr), bblr: r2(l.bblr), kdr: r2(l.kdr),
      finals: l.finals || 0, beds: l.beds || 0, kills: l.kills || 0, first: day(rs[0]), last: day(l), times: rs.length,
      beaten: Object.keys(ROSTER_LABEL).filter(k => rs.some(r => r[k])).map(k => ROSTER_LABEL[k]),
      addedBy: ROSTER_LABEL[l.addedBy] || l.addedBy || "", boosting: rs.some(r => r.boosting), cheating: rs.some(r => r.cheating), notes: notes.slice(-3),
      skin: `https://mc-heads.net/skin/${encodeURIComponent(l.uuid || l.username)}` });
  });
  rows.sort((a, b) => b.index - a.index);
  const top = rows.slice(0, 20); top.forEach((r, i) => r.rank = i + 1);
  window.HOF = top;
  window.HOF_META = { total: rows.length, records: list.filter(s => !s.deletedAt).length, generated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
}
if (!window.HOF) {
  window.HOF_LIVE = true;
  try { await loadLive(); }
  catch (e) { const b = document.querySelector("#enter"); b.textContent = "Couldn't reach the server. Reload to try again"; throw e; }
}
const DATA = window.HOF || [];
if (window.HOF_LIVE) document.querySelector("#homeBtn").hidden = false;
const META = window.HOF_META || { total: 0, records: 0 };

// ---------- Small helpers ----------
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const QS = new URLSearchParams(location.search);
const SHOT = QS.has("shot");
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtIdx = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n));
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtRatio = (n) => { n = Number(n) || 0; return n >= 100 ? n.toFixed(0) : n.toFixed(2); };
const fmtDate = (d) => { const t = Date.parse(d + "T12:00:00Z"); return isNaN(t) ? "unknown" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const ROSTER_VAR = { Milo: "--r-milo", Potat: "--r-potat", ABoi: "--r-aboi", Zoiv: "--r-zoiv", Max: "--r-max", Sqoz: "--r-sqoz", Kermit: "--r-kermit", Ssent: "--r-ssent", Key: "--r-key" };
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Same index tiers as the tracker's sweat meter.
const TIERS = [{ min: 5e6, name: "Final Boss" }, { min: 5e5, name: "Demon" }, { min: 5e4, name: "Sweat" }, { min: 5e3, name: "Tryhard" }, { min: -1, name: "Casual" }];
const tierOf = (i) => TIERS.find(t => i >= t.min).name;

// ---------- Prestige tag (same ladder as the site) ----------
const PRESTIGE_BASE = "7f6b2349d5";
const PRESTIGE_PATTERNS = { 20: "877ff78", 21: "ffee666", 22: "66ffb33", 23: "55dd6ee", 24: "bbff778", 25: "ffaa222", 26: "44ccdd5", 27: "eeff888", 28: "aa2266e", 29: "bb33991", 30: "ee66cc4", 31: "993366e", 32: "c4774cc", 33: "999dcc4", 34: "2add552", 35: "cc442aa", 36: "aaab991", 37: "44ccb33", 38: "11955d1", 39: "ccaa399", 40: "55cc66e" };
function prestigeParts(starRaw) {
  const star = Math.max(0, Math.floor(Number(starRaw) || 0));
  const tier = Math.floor(star / 100);
  const glyph = star >= 1100 ? "✪" : "✫";
  const chars = ["[", ...String(star), glyph, "]"];
  let codes;
  if (tier < 10) codes = chars.map(() => PRESTIGE_BASE[tier]);
  else if (tier === 10) codes = chars.map((_, i) => "c6eabd5"[i % 7]);
  else if (tier < 20) { const b = PRESTIGE_BASE[tier - 10]; codes = chars.map((c, i) => (i === 0 || i === chars.length - 1) ? "7" : b); }
  else { const p = PRESTIGE_PATTERNS[tier] || "c6eab9d"; codes = chars.map((_, i) => p[Math.round(i * (p.length - 1) / (chars.length - 1))]); }
  return chars.map((c, i) => ({ c, color: cssVar("--mc-" + codes[i]) || "#fff" }));
}
const prestigeHtml = (s) => prestigeParts(s).map(p => `<span style="color:${p.color}">${esc(p.c)}</span>`).join("");

// ---------- Quality ----------
// Texture size and light count are fixed at load; resolution, shadows, ambient occlusion and
// floor reflections can change live (Quality button, or automatically if frames get slow).
const TOUCH = matchMedia("(hover: none) and (pointer: coarse)").matches;
const QUALITY = {
  high:   { label: "High",   dpr: 1.75, shadows: 3, ao: true,  refl: 0.5,  tex: 2048, lights: 6, msaa: 4 },
  medium: { label: "Medium", dpr: 1.25, shadows: 1, ao: false, refl: 0.35, tex: 2048, lights: 6, msaa: 4 },
  low:    { label: "Low",    dpr: 1,    shadows: 0, ao: false, refl: 0,    tex: 1024, lights: 4, msaa: 0 },
};
const QORDER = ["low", "medium", "high"];
const savedQ = QS.get("q") || store.get("hof.quality");
let quality = QUALITY[savedQ] ? savedQ : (TOUCH || innerWidth < 760 ? "low" : "high");
const qUserSet = !!QUALITY[savedQ];
const LOAD_Q = QUALITY[quality];

// ---------- Renderer ----------
const stage = $("#stage");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: SHOT, stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error("WebGL2 needed");
} catch (e) { $("#fail").style.display = "grid"; throw e; }
const dprFor = (q) => Math.min(window.devicePixelRatio || 1, SHOT ? 1 : QUALITY[q].dpr);
let DPR = dprFor(quality);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const canvas = renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute("aria-label", "3D Hall of Fame. Click to walk: W A S D to move, the mouse to look around, Shift to run, Space to jump.");
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x0b0a0a);
scene.background = new THREE.Color(0x060608);
scene.fog = new THREE.FogExp2(FOG, 0.0145);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 220);
camera.rotation.order = "YXZ";
scene.add(camera);

// ---------- GPU texture baking ----------
// Full-screen shader passes into render targets: tileable marble, stone and floor patterns,
// plus normal maps made from height. Done once at load.
const NOISE_GLSL = `
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1. + 2. * fract(sin(p) * 43758.5453123); }
float hash1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float pnoise(vec2 p, vec2 per){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 i00 = mod(i, per), i10 = mod(i + vec2(1., 0.), per), i01 = mod(i + vec2(0., 1.), per), i11 = mod(i + vec2(1., 1.), per);
  float a = dot(hash2(i00), f), b = dot(hash2(i10), f - vec2(1., 0.)), c = dot(hash2(i01), f - vec2(0., 1.)), d = dot(hash2(i11), f - vec2(1., 1.));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float fbm(vec2 p, vec2 per){ float s = 0., a = .5; for (int k = 0; k < 6; k++){ s += a * pnoise(p, per); p *= 2.; per *= 2.; a *= .5; } return s; }
float fbm3(vec2 p, vec2 per){ float s = 0., a = .5; for (int k = 0; k < 3; k++){ s += a * pnoise(p, per); p *= 2.; per *= 2.; a *= .5; } return s; }
vec3 lin(vec3 c){ return pow(max(c, 0.), vec3(2.2)); }
// marble: domain-warped fbm with ridged veins. Returns base variation in x, vein strength in y, fine veins in z.
vec3 marble(vec2 p, vec2 per, float seed){
  vec2 o = vec2(seed * 7.13, seed * 3.71);
  vec2 q = vec2(fbm(p + o, per), fbm(p + o + vec2(5.2, 1.3), per));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2), per), fbm(p + 3.2 * q + vec2(8.3, 2.8), per));
  float base = fbm(p + 2.6 * r, per);
  float v1 = 1. - smoothstep(0., .035, abs(fbm(p * .5 + 2.2 * r + o, per * .5)));
  float v2 = 1. - smoothstep(0., .012, abs(fbm3(p * 1.6 + 1.4 * q + o.yx, per * 1.6)));
  return vec3(base, v1, v2);
}
`;
const bakeScene = new THREE.Scene(), bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); bakeQuad.frustumCulled = false; bakeScene.add(bakeQuad);
function bakeRT(size, srgb, h = size) {
  return new THREE.WebGLRenderTarget(size, h, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    anisotropy: MAX_ANISO, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace });
}
function runBake(rt, fragment, uniforms) {
  const mat = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: "varying vec2 vUv;\n" + NOISE_GLSL + fragment });
  bakeQuad.material = mat; renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(null); mat.dispose();
  return rt.texture;
}
// One shader writes albedo (uOut 0) or roughness/metal/height (uOut 1); a second pass turns height into a normal map.
function bakeMaterial(size, body, strength = 1) {
  const albedo = runBake(bakeRT(size, true), body, { uOut: { value: 0 } });
  const ormRT = bakeRT(size, false); const orm = runBake(ormRT, body, { uOut: { value: 1 } });
  const normal = bakeNormal(size, size, orm, strength, 3);
  return { albedo, orm, normal };
}
function bakeNormal(w, h, heightTex, strength, channel) {
  const rt = bakeRT(w, false, h);
  return runBake(rt, `uniform sampler2D tH; uniform float uS; uniform vec2 uT;
    float h(vec2 uv){ vec4 t = texture2D(tH, uv); return ${channel === 3 ? "t.a" : "t.r"}; }
    float hb(vec2 uv){ return (h(uv) * 4. + h(uv + vec2(uT.x, 0.)) + h(uv - vec2(uT.x, 0.)) + h(uv + vec2(0., uT.y)) + h(uv - vec2(0., uT.y))) / 8.; }
    void main(){ float l = hb(vUv - vec2(uT.x, 0.)), r = hb(vUv + vec2(uT.x, 0.)), d = hb(vUv - vec2(0., uT.y)), u = hb(vUv + vec2(0., uT.y));
      vec3 n = normalize(vec3((l - r) * uS, (d - u) * uS, 1.)); gl_FragColor = vec4(n * .5 + .5, 1.); }`,
    { tH: { value: heightTex }, uS: { value: strength * w / 512 }, uT: { value: new THREE.Vector2(1 / w, 1 / h) } });
}

// ---------- Baked surfaces ----------
const OUT_TAIL = `if (uOut == 0) gl_FragColor = vec4(col, 1.); else gl_FragColor = vec4(1., rough, metal, height);`;
// Floor: 2 m slabs of Calacatta marble, each turned a different way, with Nero diamonds and brass rims at the corners. One texture = 4 m.
const FLOOR_SH = `uniform int uOut;
void main(){
  vec2 P = vUv * 4.; vec2 tid = floor(P / 2.); vec2 tl = P - tid * 2.;
  float sd = hash1(tid + 3.1); float a = floor(sd * 4.) * 1.5708 + (sd - .5) * .35;
  vec2 c = tl - 1.; vec2 rc = vec2(cos(a) * c.x - sin(a) * c.y, sin(a) * c.x + cos(a) * c.y);
  vec3 m = marble(rc * 1.25 + sd * 40., vec2(1e4), sd * 10.);
  vec3 cal = lin(vec3(.87, .84, .78)) * (.82 + m.x * .4);
  cal = mix(cal, lin(vec3(.56, .50, .43)), m.y * .6); cal = mix(cal, lin(vec3(.40, .36, .31)), m.z * .55);
  vec2 dc = min(tl, 2. - tl); float dd = dc.x + dc.y; float edge = min(dc.x, dc.y);
  vec3 mn = marble(P * 1.6 + 9., vec2(1e4), 4.);
  vec3 nero = lin(vec3(.05, .05, .055)) * (.85 + mn.x * .5); nero = mix(nero, lin(vec3(.78, .76, .72)), clamp(mn.z * .8 + mn.y * .3, 0., 1.));
  float dia = 1. - smoothstep(.415, .42, dd);
  float brass = smoothstep(.415, .42, dd) * (1. - smoothstep(.46, .465, dd));
  float seam = (1. - smoothstep(.002, .006, edge)) * (1. - dia) * (1. - brass);
  vec3 col = mix(cal, nero, dia); col = mix(col, lin(vec3(.80, .60, .28)), brass); col = mix(col, lin(vec3(.10, .09, .08)), seam);
  float rough = mix(mix(.12, .2, m.z), .16, dia); rough = mix(rough, .28, brass); rough = mix(rough, .75, seam);
  float metal = brass; float height = .6 - seam * .5 + brass * .08 - dia * .02;
  ${OUT_TAIL}
}`;
// Walls: staggered ashlar blocks (2 x 1 m) of warm limestone with chamfered joints. One texture = 4 m.
const STONE_SH = `uniform int uOut; uniform vec3 uTint;
void main(){
  vec2 P = vUv * 4.; float row = floor(P.y); float off = mod(row, 2.);
  float bx = floor((P.x + off) * .5); vec2 bl = vec2(mod(P.x + off, 2.), P.y - row);
  vec2 bid = vec2(mod(bx, 2.), mod(row, 4.)); float sd = hash1(bid + 1.7);
  vec3 m = marble(P * 1.25 + vec2(sd * 3., sd * 7.), vec2(5.), sd * 3.);
  float pores = smoothstep(.62, .75, pnoise(P * 38., vec2(152.)) * .5 + .5) * .5;
  vec3 col = uTint * (.78 + m.x * .35 + (sd - .5) * .16); col = mix(col, uTint * .55, m.y * .35); col *= 1. - pores * .35;
  float ex = min(min(bl.x, 2. - bl.x), min(bl.y, 1. - bl.y));
  float joint = 1. - smoothstep(.006, .012, ex); float bevel = smoothstep(.006, .04, ex);
  col = mix(col, uTint * .22, joint);
  float rough = mix(.55, .75, pores) + joint * .2; float metal = 0.; float height = .3 + bevel * .6 - pores * .05;
  ${OUT_TAIL}
}`;
// Seamless polished marble (light or dark). One texture = 2 m.
const MARBLE_SH = `uniform int uOut; uniform vec3 uBase; uniform vec3 uVein; uniform vec3 uFine; uniform float uRough;
void main(){
  vec2 P = vUv * 3.; vec3 m = marble(P, vec2(3.), 2.);
  vec3 col = uBase * (.82 + m.x * .4); col = mix(col, uVein, m.y * .65); col = mix(col, uFine, m.z * .6);
  float rough = uRough + m.z * .06; float metal = 0.; float height = .5 + m.y * .03;
  ${OUT_TAIL}
}`;
const TEX = LOAD_Q.tex;
const T = {};
function bakeAll() {
  T.floor = bakeMaterial(TEX, FLOOR_SH, 1.4);
  const tint = (r, g, b) => ({ uTint: { value: linV(r, g, b) } });
  T.stone = (() => { const u = tint(.47, .42, .36); const s = TEX; const albedo = runBake(bakeRT(s, true), STONE_SH, { uOut: { value: 0 }, ...u });
    const orm = runBake(bakeRT(s, false), STONE_SH, { uOut: { value: 1 }, ...u }); return { albedo, orm, normal: bakeNormal(s, s, orm, 2.2, 3) }; })();
  const mar = (base, vein, fine, rough) => { const u = { uBase: { value: linV(...base) }, uVein: { value: linV(...vein) },
    uFine: { value: linV(...fine) }, uRough: { value: rough } }; const s = TEX / 2;
    const albedo = runBake(bakeRT(s, true), MARBLE_SH, { uOut: { value: 0 }, ...u }); const orm = runBake(bakeRT(s, false), MARBLE_SH, { uOut: { value: 1 }, ...u });
    return { albedo, orm, normal: bakeNormal(s, s, orm, 0.6, 3) }; };
  T.marble = mar([.80, .76, .70], [.52, .48, .43], [.38, .35, .32], .22);
  T.dark = mar([.035, .06, .052], [.30, .38, .34], [.82, .86, .84], .16);
}
// sRGB colour picks to linear, for the bake shaders
function linV(r, g, b) { return new THREE.Vector3(r ** 2.2, g ** 2.2, b ** 2.2); }

// ---------- Materials ----------
const M = {};
const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, fog: true });
function makeMaterials() {
  const tex = (t, extra) => new THREE.MeshStandardMaterial({ map: t.albedo, roughnessMap: t.orm, normalMap: t.normal, roughness: 1, metalness: 0, ...extra });
  // the emissive on wall and vault stands in for warm bounce light from the candles and the floor: strong low down, fading towards the crown
  M.wall = bounce(tex(T.stone, { color: 0xffffff, emissive: 0xffd9b0, emissiveMap: T.stone.albedo, emissiveIntensity: 0.16 }), 1, 0.45, 2, 9);
  M.vault = bounce(tex(T.stone, { color: 0xb3a692, emissive: 0xffd9b0, emissiveMap: T.stone.albedo, emissiveIntensity: 0.5 }), 1, 0.28, 9, 18);
  M.marble = tex(T.marble, { envMapIntensity: 1.2 });
  M.dark = tex(T.dark, { envMapIntensity: 1.5 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xd6a952, roughness: 0.24, metalness: 1, envMapIntensity: 1.6 });
  M.goldDull = new THREE.MeshStandardMaterial({ color: 0xa47c3c, roughness: 0.42, metalness: 1, envMapIntensity: 1.2 });
  M.iron = new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.55, metalness: 0.85 });
  M.goldLine = glow(0xffc56b, 0.9);
  M.velvet = new THREE.MeshStandardMaterial({ color: 0x5a0a14, roughness: 0.8, metalness: 0 });
  M.candle = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.6, emissive: 0xffb36b, emissiveIntensity: 0.12 });
  M.crystal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0.9, envMapIntensity: 3, emissive: 0xfff2dd, emissiveIntensity: 0.08 });
  M.wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62, metalness: 0, color: 0xb9a48d });
  M.glass = new THREE.MeshBasicMaterial({ map: oculusTexture(), color: new THREE.Color(0xb9cdff).multiplyScalar(2.2), toneMapped: false });
}
function bounce(mat, k0, k1, y0, y1) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying float vWY;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n  vWY = (modelMatrix * vec4(transformed, 1.)).y;");
    sh.fragmentShader = "varying float vWY;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      totalEmissiveRadiance *= mix(${k0.toFixed(3)}, ${k1.toFixed(3)}, smoothstep(${y0.toFixed(2)}, ${y1.toFixed(2)}, vWY));`);
  };
  mat.customProgramCacheKey = () => `bounce${k0}_${k1}_${y0}_${y1}`;
  return mat;
}
function woodTexture() {
  return canvasTex(512, 1024, (g, w, h) => {
    const r = rng(41); g.fillStyle = "#3a2214"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = r() * w; g.strokeStyle = `rgba(${r() < .5 ? "20,10,4" : "90,52,26"},${0.12 + r() * 0.25})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.01 + i) * 6 + (r() - .5) * 2, y); g.stroke(); }
  });
}
function oculusTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.7, "#cfd8ee"); gr.addColorStop(1, "#7f8aa6");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(40,44,60,.85)"; g.lineWidth = 10;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.22, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.22, h / 2 + Math.sin(a) * w * 0.22); g.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * w * 0.5); g.stroke(); }
  });
}

// ---------- Canvas panels (text), with raised-relief normal maps ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = MAX_ANISO; return t;
}
// draw(g, w, h, H): H is true for the height pass (paint raised parts white on black, ignore colours).
function reliefPanel(w, h, draw, strength = 2.5) {
  const map = canvasTex(w, h, (g, W, H2) => draw(g, W, H2, false));
  const ht = canvasTex(w, h, (g, W, H2) => { g.fillStyle = "#000"; g.fillRect(0, 0, W, H2); draw(g, W, H2, true); }, false);
  ht.generateMipmaps = false; ht.minFilter = THREE.LinearFilter;
  const normal = bakeNormal(w, h, ht, strength, 0); ht.dispose();
  return { map, normal };
}
function fitFont(g, text, family, weight, maxW, start) { let s = start; do { g.font = `${weight} ${s}px ${family}`; s -= 2; } while (g.measureText(text).width > maxW && s > 10); return s + 2; }
const C = (H, c) => H ? "#fff" : c;
function panelFrame(g, w, h, H, inset = 14) {
  g.strokeStyle = C(H, "#d9b062"); g.lineWidth = 10; g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  g.lineWidth = 2.5; g.strokeRect(inset + 22, inset + 22, w - inset * 2 - 44, h - inset * 2 - 44);
  if (H) return; // corner rosettes only in colour pass
}
function bronzeBg(g, w, h, H) {
  if (H) return;
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#2a2219"); bg.addColorStop(1, "#110e0a"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const r = rng(w + h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,220,160,${r() * 0.035})`; g.fillRect(r() * w, r() * h, r() * 60 + 4, 1); }
}
function drawPlaque(d) {
  return (g, w, h, H) => {
    bronzeBg(g, w, h, H); panelFrame(g, w, h, H);
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillStyle = C(H, "#e2b866"); g.font = `700 52px Cinzel, Georgia, serif`; g.fillText(`Nº ${d.rank}`, w / 2, 118);
    g.fillStyle = C(H, "#fbf4e4"); fitFont(g, d.name, "'Barlow Condensed', sans-serif", 700, w - 150, 128); g.fillText(d.name, w / 2, 252);
    const parts = prestigeParts(d.star); g.font = `700 62px 'Barlow Condensed', sans-serif`;
    const tw = parts.reduce((a, p) => a + g.measureText(p.c).width, 0); let x = w / 2 - tw / 2; g.textAlign = "left";
    parts.forEach(p => { g.fillStyle = H ? "#fff" : p.color; g.fillText(p.c, x, 336); x += g.measureText(p.c).width; });
    g.textAlign = "center"; g.fillStyle = C(H, "#e2b866"); g.font = `700 68px Cinzel, Georgia, serif`; g.fillText(fmtIdx(d.index), w / 2, 440);
    g.fillStyle = C(H, "#9a8761"); g.font = `600 25px 'Barlow Condensed', sans-serif`; g.fillText(`I N D E X   ·   ${tierOf(d.index).toUpperCase().split("").join(" ")}`, w / 2, 488);
    if (d.cheating) { g.save(); g.translate(w - 128, 100); g.rotate(0.32); g.fillStyle = C(H, "#e0354a"); g.fillRect(-150, -27, 300, 54);
      g.fillStyle = H ? "#000" : "#fff"; g.font = `700 33px 'Barlow Condensed', sans-serif`; g.fillText("CHEATER", 0, 12); g.restore(); }
  };
}
function drawDedication(g, w, h, H) {
  bronzeBg(g, w, h, H); panelFrame(g, w, h, H);
  g.textAlign = "center"; g.fillStyle = C(H, "#e2b866"); g.font = `700 56px Cinzel, Georgia, serif`; g.fillText("THE HALL", w / 2, 128);
  g.fillStyle = C(H, "#fbf4e4"); g.font = `600 42px 'Barlow Condensed', sans-serif`;
  [`${fmtNum(META.total)} sweats beaten`, `${fmtNum(META.records)} games logged`, `Ranked by index:`, `FKDR² × stars`].forEach((t, i) => g.fillText(t, w / 2, 222 + i * 68));
}
function drawBanner(d) {
  return (g, w, h, H) => {
    const flag = d && d.cheating;
    const path = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h - 130); g.lineTo(w / 2, h - 6); g.lineTo(0, h - 130); g.closePath(); };
    if (!H) {
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, flag ? "#4a0f19" : "#3a0d14"); bg.addColorStop(0.55, flag ? "#2c080e" : "#22070c"); bg.addColorStop(1, "#0e0507");
      g.fillStyle = bg; path(); g.fill();
      // fabric weave
      const r = rng(7 + (d ? d.rank : 0)); g.save(); path(); g.clip();
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.012})`; g.fillRect(x, 0, 1, h); }
      g.restore();
    }
    const gold = flag ? "#ff7a88" : "#e8c47a";
    g.strokeStyle = C(H, gold); g.lineWidth = 9; path(); g.stroke();
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(28, 28); g.lineTo(w - 28, 28); g.lineTo(w - 28, h - 146); g.lineTo(w / 2, h - 38); g.lineTo(28, h - 146); g.closePath(); g.stroke();
    // embroidered laurel ticks down the sides
    for (let y = 70; y < h - 200; y += 34) { [44, w - 44].forEach((x, s) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (s ? -12 : 12), y - 14); g.stroke(); }); }
    g.textAlign = "center"; g.fillStyle = C(H, flag ? "#ff9aa5" : "#f0cf86");
    if (d) {
      g.font = `900 290px Cinzel, Georgia, serif`; g.fillText(String(d.rank), w / 2, 400);
      g.fillRect(w / 2 - 92, 458, 184, 4);
      g.fillStyle = C(H, "#e6d7b5"); fitFont(g, d.name, "'Barlow Condensed', sans-serif", 600, w - 100, 62); g.fillText(d.name, w / 2, 546);
      g.font = `600 28px 'Barlow Condensed', sans-serif`; g.fillStyle = C(H, "#a08a62"); g.fillText(`FIRST LOGGED ${fmtDate(d.first).toUpperCase()}`, w / 2, 604);
      g.fillText(tierOf(d.index).toUpperCase(), w / 2, 648);
    } else {
      g.font = `700 70px Cinzel, Georgia, serif`; g.fillText("PRISM", w / 2, 300); g.fillRect(w / 2 - 92, 340, 184, 4);
      g.font = `600 42px 'Barlow Condensed', sans-serif`; g.fillStyle = C(H, "#e6d7b5"); ["BEDWARS", "TRACKER"].forEach((t, i) => g.fillText(t, w / 2, 420 + i * 54));
    }
  };
}
function drawNumeral(n) {
  return (g, w, h, H) => { if (!H) { g.fillStyle = "#0d0c0a"; g.fillRect(0, 0, w, h); } panelFrame(g, w, h, H, 10);
    g.textAlign = "center"; g.fillStyle = C(H, "#e2b866"); g.font = `900 ${n === 1 ? 330 : 300}px Cinzel, Georgia, serif`; g.fillText(String(n), w / 2, 378); };
}
function drawInscription(lines) {
  return (g, w, h, H) => {
    if (!H) { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#15130f"); bg.addColorStop(1, "#0a0907"); g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    panelFrame(g, w, h, H, 10); g.textAlign = "center";
    // shrink a line until it fits inside the frame; a single line sits on the optical centre
    lines.forEach(([t, size, y, col]) => { const s = fitFont(g, t, "Cinzel, Georgia, serif", 700, w - 150, size); g.fillStyle = C(H, col); g.fillText(t, w / 2, lines.length === 1 ? h / 2 + s * 0.36 : y); });
  };
}
function drawRoll(g, w, h, H) {
  if (!H) { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#14120e"); bg.addColorStop(1, "#090807"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rng(5); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.03})`; g.fillRect(r() * w, r() * h, 2, 2); } }
  panelFrame(g, w, h, H, 16);
  g.textAlign = "center"; g.fillStyle = C(H, "#e2b866"); g.font = `700 76px Cinzel, Georgia, serif`; g.fillText("ROLL OF HONOUR", w / 2, 150);
  g.fillStyle = C(H, "#a08a62"); g.font = `600 30px 'Barlow Condensed', sans-serif`; g.fillText("THE GREATEST SWEATS WE'VE BEATEN", w / 2, 200);
  g.fillRect(w / 2 - 160, 226, 320, 3);
  const top = 300, step = (h - top - 90) / Math.max(20, DATA.length);
  DATA.forEach((d, i) => {
    const y = top + i * step;
    g.textAlign = "right"; g.fillStyle = C(H, d.rank <= 3 ? "#f0cf86" : "#b99a5e"); g.font = `700 ${Math.round(step * 0.62)}px Cinzel, Georgia, serif`; g.fillText(String(d.rank), 190, y);
    g.textAlign = "left"; g.fillStyle = C(H, d.cheating ? "#ff8a96" : "#efe4cc"); fitFont(g, d.name, "'Barlow Condensed', sans-serif", 600, w - 560, Math.round(step * 0.72)); g.fillText(d.name, 230, y);
    g.textAlign = "right"; g.fillStyle = C(H, "#e2b866"); g.font = `700 ${Math.round(step * 0.6)}px 'Barlow Condensed', sans-serif`; g.fillText(fmtIdx(d.index), w - 110, y);
  });
}

// ---------- Static geometry batching ----------
// Everything that never moves is merged into one mesh per material, so the whole hall is a handful of draw calls.
const world = new THREE.Group(); scene.add(world);
const BATCH = new Map();
const KEEP_ATTR = new Set(["position", "normal", "uv"]);
function boxUV(g, size) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
const UV_SIZE = { wall: 4, vault: 4, marble: 2, dark: 2 };
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz)); }
function add(key, geo, m, opts = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (!KEEP_ATTR.has(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!opts.keepUV && UV_SIZE[key]) boxUV(g, UV_SIZE[key]);
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!BATCH.has(key)) BATCH.set(key, []);
  BATCH.get(key).push(g);
}
const box = (key, w, h, d, x, y, z, ry = 0) => add(key, new THREE.BoxGeometry(w, h, d), mtx(x, y, z, 0, ry));
function flipGeo(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const a = i + 3 + k, b = i + 6 + k; [p[a], p[b]] = [p[b], p[a]]; [n[a], n[b]] = [n[b], n[a]]; }
  if (uv) for (let i = 0; i < uv.length; i += 6) for (let k = 0; k < 2; k++) { const a = i + 2 + k, b = i + 4 + k; [uv[a], uv[b]] = [uv[b], uv[a]]; }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}
const CAST = new Set(["marble", "dark", "gold", "goldDull", "iron", "velvet", "wood"]);
function flushStatic() {
  for (const [key, list] of BATCH) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), M[key]);
    mesh.receiveShadow = !(M[key] instanceof THREE.MeshBasicMaterial); mesh.castShadow = CAST.has(key); mesh.matrixAutoUpdate = false;
    if (M[key] instanceof THREE.MeshBasicMaterial) mesh.userData.noAO = true;
    world.add(mesh);
  }
  BATCH.clear();
}

// ---------- Layout (metres; +z behind you at the start, the hall runs toward -z) ----------
const SP = 8, BAYS = 9, Z0 = -4;                      // bay centres at Z0 - k*SP
const COL_X = 7.8, WALL_X = 8.6, NICHE_D = 4.2, NICHE_HW = 3, NICHE_SPRING = 5;
const ENT_Y0 = 8.3, ENT_Y1 = 9.3, VAULT_R = WALL_X, VAULT_TOP = ENT_Y1 + VAULT_R;
const DOOR_Z = 10, START_Z = 5;
const COL_ZS = Array.from({ length: BAYS + 1 }, (_, k) => Z0 + SP / 2 - k * SP);
const NAVE_END_Z = COL_ZS[BAYS] - 4;                  // nave side of the wall with the arch into the rotunda
const ROT_R = 15, ROT_Z = NAVE_END_Z - 15.5, ROT_FACE = ROT_Z + 13.4, ROT_WALK = 13.2;
const GATE_HW = 6, GATE_SPRING = 6;
const PLINTH_D = 2.1, PLINTH_TOP = 1.61;
const DAIS = [[8.0, 0.35], [7.1, 0.35], [6.2, 0.35]]; // radius, height of each step; the top step must hold all three podiums (#2/#3 corners reach r 5.87)
const DAIS_TOP = DAIS.reduce((a, s) => a + s[1], 0);
const byRank = new Map(DATA.map(d => [d.rank, d]));
// hall slots: #20 + the dedication in the first bay, then 19..4 alternating left/right
const slots = [{ rank: 20 }, { ded: true }];
for (let r = 19; r >= 4; r--) slots.push({ rank: r });
slots.forEach((s, i) => { s.pair = Math.floor(i / 2); s.side = i % 2 === 0 ? -1 : 1; s.z = Z0 - s.pair * SP; });
const CHANDELIER_ZS = [0, 2, 4, 6, 8].map(k => Z0 - k * SP);
const OCULUS_ZS = [1, 3, 5, 7].map(k => Z0 - k * SP + 1);
const MOON_DIR = new THREE.Vector3(0.32, -1, 0.2).normalize();

// ---------- Colliders (2D footprints with a top height) ----------
const SOLIDS = [];
const solidBox = (x0, x1, z0, z1, top = 99) => SOLIDS.push({ k: 0, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top });
const solidCirc = (x, z, r, top = 99) => SOLIDS.push({ k: 1, x, z, r, top });
const solidSeg = (ax, az, bx, bz, r, top) => SOLIDS.push({ k: 2, ax, az, bx, bz, r, top });

// ---------- Shape helpers ----------
function archPts(cx, cy, hw, spring, seg = 32) {
  const p = [new THREE.Vector2(cx - hw, cy), new THREE.Vector2(cx + hw, cy), new THREE.Vector2(cx + hw, cy + spring)];
  for (let i = 1; i < seg; i++) { const a = i / seg * Math.PI; p.push(new THREE.Vector2(cx + Math.cos(a) * hw, cy + spring + Math.sin(a) * hw)); }
  p.push(new THREE.Vector2(cx - hw, cy + spring));
  return p;
}
function halfRing(ro, ri, seg = 48) {
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI; const v = [Math.cos(a) * ro, Math.sin(a) * ro]; i ? s.lineTo(...v) : s.moveTo(...v); }
  for (let i = seg; i >= 0; i--) { const a = i / seg * Math.PI; s.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
  return s;
}
function lathe(pts, seg = 32, phiStart = 0, phiLen = Math.PI * 2) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLen); }
function arcPts(cx, cy, r, a0, a1, n) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }

// ---------- Columns ----------
function flutedShaft(r0, r1, h, flutes = 20, depth = 0.035) {
  const radSeg = flutes * 8, hSeg = 6, pos = [], nor = [], uv = [], idx = [];
  const prof = (t) => Math.pow(Math.abs(Math.sin(t * flutes / 2)), 0.6);
  for (let j = 0; j <= hSeg; j++) {
    const v = j / hSeg, y = v * h, R = lerp(r0, r1, v) * (1 + 0.012 * Math.sin(v * Math.PI));
    for (let i = 0; i <= radSeg; i++) {
      const t = i / radSeg * Math.PI * 2, r = R - depth * prof(t), dt = 1e-3;
      const dr = -depth * (prof(t + dt) - prof(t - dt)) / (2 * dt);
      const tx = dr * Math.sin(t) + r * Math.cos(t), tz = dr * Math.cos(t) - r * Math.sin(t);
      const n = new THREE.Vector3(-tz, (r0 - r1) / h * Math.hypot(tx, tz), tx).normalize();
      pos.push(Math.sin(t) * r, y, Math.cos(t) * r); nor.push(n.x, n.y, n.z); uv.push(i / radSeg * Math.PI * r0, y / 2);
    }
  }
  for (let j = 0; j < hSeg; j++) for (let i = 0; i < radSeg; i++) { const a = j * (radSeg + 1) + i, b = a + radSeg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const COLUMN = (() => {
  const base = [[0.76, 0], [0.76, 0.05], ...arcPts(0.67, 0.13, 0.085, -Math.PI / 2, Math.PI / 2, 8), [0.6, 0.22], [0.58, 0.25], ...arcPts(0.6, 0.29, 0.05, -Math.PI / 2, Math.PI / 2, 6), [0.56, 0.35], [0.55, 0.37]];
  const cap = [[0.47, 0], [0.47, 0.08], [0.5, 0.1], ...arcPts(0.5, 0.42, 0.3, -Math.PI / 2, 0, 8).map(([r, y]) => [r - 0.0, y]), [0.8, 0.44], [0.8, 0.48]];
  return { shaft: flutedShaft(0.55, 0.47, 6.75), base: lathe(base, 40), cap: lathe(cap, 40), ring: new THREE.TorusGeometry(0.5, 0.045, 8, 40) };
})();
function column(x, z) {
  box("dark", 1.5, 0.35, 1.5, x, 0.175, z);
  add("marble", COLUMN.base, mtx(x, 0.35, z), { keepUV: true });
  add("marble", COLUMN.shaft, mtx(x, 0.72, z), { keepUV: true });
  add("gold", COLUMN.ring, mtx(x, 7.5, z, Math.PI / 2));
  add("marble", COLUMN.cap, mtx(x, 7.47, z), { keepUV: true });
  box("marble", 1.62, 0.35, 1.62, x, 8.125, z);
  solidCirc(x, z, 0.8);
}

// ---------- The nave ----------
function buildNave() {
  const L = DOOR_Z - NAVE_END_Z, zMid = (DOOR_Z + NAVE_END_Z) / 2;
  // side walls with arched niche openings
  [-1, 1].forEach(s => {
    const sh = new THREE.Shape();
    const pts = [[s * NAVE_END_Z, 0], [s * DOOR_Z, 0], [s * DOOR_Z, ENT_Y1], [s * NAVE_END_Z, ENT_Y1]].map(([a, b]) => new THREE.Vector2(a, b));
    if (s < 0) pts.reverse();
    sh.setFromPoints(pts);
    slots.filter(sl => sl.side === s).forEach(sl => sh.holes.push(new THREE.Path(archPts(s * sl.z, 0, NICHE_HW, NICHE_SPRING))));
    // left wall: shape x = -z, faces +x; right wall: shape x = z, faces -x
    add("wall", new THREE.ShapeGeometry(sh, 24), mtx(s * WALL_X, 0, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2));
    // colliders: wall segments between the niche openings
    const opens = slots.filter(sl => sl.side === s).map(sl => sl.z).sort((a, b) => b - a);
    let zTop = DOOR_Z;
    opens.forEach(oz => { solidBox(s * WALL_X, s * (WALL_X + 1), oz + NICHE_HW, zTop); zTop = oz - NICHE_HW; });
    solidBox(s * WALL_X, s * (WALL_X + 1), NAVE_END_Z - 0.5, zTop);
    // entablature: architrave, frieze and cornice running the length of the hall
    const prof = [[0, ENT_Y0], [1.3, ENT_Y0], [1.3, 8.62], [1.36, 8.62], [1.36, 8.75], [1.2, 8.75], [1.2, 9.05], [1.45, 9.08], [1.6, 9.16], [1.6, ENT_Y1], [0, ENT_Y1]];
    const es = new THREE.Shape(prof.map(([a, b]) => new THREE.Vector2(a, b)));
    let eg = new THREE.ExtrudeGeometry(es, { depth: L, bevelEnabled: false, curveSegments: 1 });
    if (s > 0) { eg.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)); eg = flipGeo(eg); }
    add("marble", eg, mtx(s > 0 ? WALL_X : -WALL_X, 0, NAVE_END_Z));
    box("goldLine", 0.02, 0.05, L, s * (WALL_X - 1.215), 8.9, zMid);
    box("gold", 0.08, 0.04, L, s * (WALL_X - 1.31), 8.6, zMid);
    // dado rail along the visible wall
    box("gold", 0.06, 0.06, L, s * (WALL_X - 0.03), 1.05, zMid);
    COL_ZS.forEach(z => column(s * COL_X, z));
  });
  // barrel vault: a recessed shell, a grid of ribs making the coffers, gold rosettes in each coffer
  const shell = new THREE.CylinderGeometry(VAULT_R + 0.22, VAULT_R + 0.22, L, 96, 1, true, Math.PI / 2, Math.PI);
  shell.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  add("vault", flipGeo(shell), mtx(0, ENT_Y1, zMid));
  const NA = 11;
  for (let k = 1; k < NA; k++) { const a = k / NA * Math.PI, r = VAULT_R + 0.1; add("vault", new THREE.BoxGeometry(0.34, 0.26, L), mtx(Math.cos(a) * r, ENT_Y1 + Math.sin(a) * r, zMid, 0, 0, a - Math.PI / 2)); }
  const small = new THREE.ExtrudeGeometry(halfRing(VAULT_R + 0.22, VAULT_R - 0.04), { depth: 0.3, bevelEnabled: false, curveSegments: 1 });
  const big = new THREE.ExtrudeGeometry(halfRing(VAULT_R + 0.22, VAULT_R - 0.5), { depth: 0.9, bevelEnabled: false, curveSegments: 1 });
  const bigGold = new THREE.TorusGeometry(VAULT_R - 0.5, 0.035, 6, 72, Math.PI);
  const rosette = lathe([[0, 0.1], [0.08, 0.09], [0.16, 0.05], [0.2, 0.0]], 10);
  for (let z = DOOR_Z - 2; z > NAVE_END_Z + 0.5; z -= 2) {
    if (COL_ZS.some(c => Math.abs(c - z) < 0.01)) { add("marble", big, mtx(0, ENT_Y1, z - 0.45)); add("goldLine", bigGold, mtx(0, ENT_Y1, z)); }
    else add("vault", small, mtx(0, ENT_Y1, z - 0.15));
  }
  for (let zc = DOOR_Z - 1; zc > NAVE_END_Z; zc -= 2) for (let k = 0; k < NA; k++) {
    const a = (k + 0.5) / NA * Math.PI, r = VAULT_R + 0.2;
    if (k === 5 && OCULUS_ZS.some(o => Math.abs(o - zc) < 0.01)) continue;
    add("gold", rosette, mtx(Math.cos(a) * r, ENT_Y1 + Math.sin(a) * r, zc, 0, 0, a + Math.PI / 2));
  }
  // round skylights at the top of the vault
  OCULUS_ZS.forEach(z => {
    add("glass", new THREE.CircleGeometry(0.72, 40), mtx(0, VAULT_TOP + 0.2, z, Math.PI / 2));
    add("gold", new THREE.TorusGeometry(0.76, 0.05, 8, 48), mtx(0, VAULT_TOP + 0.18, z, Math.PI / 2));
  });
  // vestibule: framed marble panels on the walls
  [-1, 1].forEach(s => [2.2, 7.6].forEach(z => {
    box("dark", 0.06, 4.6, 2.6, s * (WALL_X - 0.03), 4.2, z);
    [[0, 6.5, 2.7, 0.08], [0, 1.9, 2.7, 0.08]].forEach(([, y, w, t]) => box("gold", 0.08, t, w, s * (WALL_X - 0.05), y, z));
    [z - 1.35, z + 1.35].forEach(zz => box("gold", 0.08, 4.68, 0.08, s * (WALL_X - 0.05), 4.2, zz));
  }));
  // the doors you came in through, with "HALL OF FAME" above them
  const dw = new THREE.Shape(archPts(0, 0, WALL_X, ENT_Y1, 48)); dw.holes.push(new THREE.Path(archPts(0, 0, 2.5, 5.6)));
  add("wall", new THREE.ShapeGeometry(dw, 32), mtx(0, 0, DOOR_Z, 0, Math.PI));
  solidBox(-WALL_X - 1, WALL_X + 1, DOOR_Z - 0.3, DOOR_Z + 1);
  const dframe = new THREE.Shape(archPts(0, 0, 3.0, 5.6)); dframe.holes.push(new THREE.Path(archPts(0, 0, 2.5, 5.6)));
  add("marble", new THREE.ExtrudeGeometry(dframe, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 32 }), mtx(0, 0, DOOR_Z - 0.02, 0, Math.PI));
  box("gold", 0.8, 1.0, 0.36, 0, 8.25, DOOR_Z - 0.12);
  [-1, 1].forEach(s => {
    box("wood", 2.42, 5.6, 0.24, s * 1.23, 2.8, DOOR_Z + 0.05);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) box("wood", 0.86, 1.45, 0.08, s * 1.23 + (c - 0.5) * 1.06, 1.0 + r * 1.75, DOOR_Z - 0.1);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) add("gold", new THREE.SphereGeometry(0.035, 8, 6), mtx(s * 1.23 + (c - 1) * 1.06, 0.3 + r * 0.82, DOOR_Z - 0.08));
    add("gold", new THREE.TorusGeometry(0.17, 0.025, 8, 24), mtx(s * 0.32, 2.9, DOOR_Z - 0.12));
    box("gold", 0.05, 5.6, 0.1, s * 0.02, 2.8, DOOR_Z - 0.08);
  });
  // fanlight over the door
  add("iron", new THREE.CircleGeometry(2.5, 48, 0, Math.PI), mtx(0, 5.6, DOOR_Z + 0.08, 0, Math.PI));
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; add("gold", new THREE.BoxGeometry(0.05, 2.45, 0.05), mtx(Math.cos(a) * 1.22, 5.6 + Math.sin(a) * 1.22, DOOR_Z - 0.0, 0, 0, a - Math.PI / 2)); }
  add("gold", new THREE.TorusGeometry(2.5, 0.05, 6, 48, Math.PI), mtx(0, 5.6, DOOR_Z - 0.02));
  // the gateway into the rotunda, a deep arch with the inscription above
  const gw = new THREE.Shape(archPts(0, 0, WALL_X, ENT_Y1, 48)); gw.holes.push(new THREE.Path(archPts(0, 0, GATE_HW, GATE_SPRING)));
  add("wall", new THREE.ShapeGeometry(gw, 32), mtx(0, 0, NAVE_END_Z));
  const gframe = new THREE.Shape(archPts(0, 0, GATE_HW + 0.55, GATE_SPRING)); gframe.holes.push(new THREE.Path(archPts(0, 0, GATE_HW, GATE_SPRING)));
  add("marble", new THREE.ExtrudeGeometry(gframe, { depth: NAVE_END_Z - ROT_FACE + 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 40 }), mtx(0, 0, ROT_FACE - 0.06));
  add("gold", new THREE.TorusGeometry(GATE_HW + 0.02, 0.04, 6, 64, Math.PI), mtx(0, GATE_SPRING, NAVE_END_Z + 0.12));
  box("gold", 1.0, 1.2, 0.4, 0, GATE_SPRING + GATE_HW + 0.45, NAVE_END_Z + 0.1);
  [-1, 1].forEach(s => solidBox(s * GATE_HW, s * (WALL_X + 1), ROT_FACE - 0.1, NAVE_END_Z + 0.2));
}

// ---------- Niches ----------
function buildNiche(slot) {
  const s = slot.side, N = mtx(s * WALL_X, 0, slot.z, 0, -s * Math.PI / 2);
  const at = (geo, m) => N.clone().multiply(m || new THREE.Matrix4());
  // back wall, side walls and the half-barrel vault (local +z faces the aisle, the niche goes to -z)
  add("wall", new THREE.ShapeGeometry(new THREE.Shape(archPts(0, 0, NICHE_HW, NICHE_SPRING)), 24), at(null, mtx(0, 0, -NICHE_D)));
  [-1, 1].forEach(e => add("wall", new THREE.PlaneGeometry(NICHE_D, NICHE_SPRING), at(null, mtx(e * NICHE_HW, NICHE_SPRING / 2, -NICHE_D / 2, 0, -e * Math.PI / 2))));
  const nv = new THREE.CylinderGeometry(NICHE_HW, NICHE_HW, NICHE_D, 40, 1, true, Math.PI / 2, Math.PI); nv.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  add("vault", flipGeo(nv), at(null, mtx(0, NICHE_SPRING, -NICHE_D / 2)));
  // ribs inside the niche vault
  [-1.4, -2.8].forEach(z => add("marble", new THREE.ExtrudeGeometry(halfRing(NICHE_HW + 0.02, NICHE_HW - 0.12, 32), { depth: 0.16, bevelEnabled: false }), at(null, mtx(0, NICHE_SPRING, z - 0.08))));
  // archivolt around the opening, keystone and a gold fillet
  const av = new THREE.Shape(archPts(0, 0, NICHE_HW + 0.42, NICHE_SPRING)); av.holes.push(new THREE.Path(archPts(0, 0, NICHE_HW, NICHE_SPRING)));
  add("marble", new THREE.ExtrudeGeometry(av, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 32 }), at(null, mtx(0, 0, 0.02)));
  add("gold", new THREE.TorusGeometry(NICHE_HW + 0.02, 0.035, 6, 48, Math.PI), at(null, mtx(0, NICHE_SPRING, 0.12)));
  add("gold", new THREE.BoxGeometry(0.62, 0.86, 0.34), at(null, mtx(0, NICHE_SPRING + NICHE_HW + 0.22, 0.12)));
  // dark marble dado with a gold rail inside the niche
  add("dark", new THREE.BoxGeometry(NICHE_HW * 2, 1.0, 0.06), at(null, mtx(0, 0.5, -NICHE_D + 0.03)));
  add("gold", new THREE.BoxGeometry(NICHE_HW * 2, 0.05, 0.1), at(null, mtx(0, 1.02, -NICHE_D + 0.05)));
  [-1, 1].forEach(e => { add("dark", new THREE.BoxGeometry(0.06, 1.0, NICHE_D), at(null, mtx(e * (NICHE_HW - 0.03), 0.5, -NICHE_D / 2)));
    add("gold", new THREE.BoxGeometry(0.1, 0.05, NICHE_D), at(null, mtx(e * (NICHE_HW - 0.05), 1.02, -NICHE_D / 2))); });
  // plinth
  const pz = -PLINTH_D;
  [["dark", 2.4, 0.22, 0.11], ["marble", 2.2, 0.12, 0.28], ["dark", 1.9, 1.05, 0.865], ["marble", 2.15, 0.1, 1.44], ["marble", 2.3, 0.12, 1.55]]
    .forEach(([k, w, h, y]) => add(k, new THREE.BoxGeometry(w, h, w), at(null, mtx(0, y, pz))));
  // gold frame for the plaque on the plinth's front
  const fz = pz + 0.95 + 0.012;
  [[0, 1.33, 1.62, 0.05], [0, 0.43, 1.62, 0.05]].forEach(([x, y, w, h]) => add("gold", new THREE.BoxGeometry(w, h, 0.03), at(null, mtx(x, y, fz))));
  [-0.79, 0.79].forEach(x => add("gold", new THREE.BoxGeometry(0.05, 0.95, 0.03), at(null, mtx(x, 0.88, fz))));
  // lamp housing in the niche vault
  add("gold", new THREE.CylinderGeometry(0.16, 0.24, 0.22, 20), at(null, mtx(0, 7.72, -0.95)));
  // velvet rope on three gold posts
  const posts = [-62, 0, 62].map(a => { const r = a * Math.PI / 180; return new THREE.Vector3(Math.sin(r) * 1.75, 0, pz + Math.cos(r) * 1.75); });
  const post = lathe([[0.17, 0], [0.17, 0.03], [0.1, 0.06], [0.035, 0.09], [0.03, 0.88], [0.05, 0.9], [0.05, 0.93], [0.0001, 1.02]], 16);
  posts.forEach(p => { add("gold", post, at(null, mtx(p.x, 0, p.z))); add("gold", new THREE.SphereGeometry(0.055, 12, 8), at(null, mtx(p.x, 0.99, p.z))); });
  const wp = posts.map(p => p.clone().applyMatrix4(N));
  for (let i = 0; i < 2; i++) {
    const a = posts[i], b = posts[i + 1], pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(lerp(a.x, b.x, t), 0.9 - Math.sin(t * Math.PI) * 0.2, lerp(a.z, b.z, t))); }
    add("velvet", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.028, 6), at());
    solidSeg(wp[i].x, wp[i].z, wp[i + 1].x, wp[i + 1].z, 0.06, 0.95);
  }
  wp.forEach(p => solidCirc(p.x, p.z, 0.17, 1.0));
  // colliders: back wall, side walls, plinth
  const wc = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(N);
  const c1 = wc(-NICHE_HW - 0.6, -NICHE_D), c2 = wc(NICHE_HW + 0.6, -NICHE_D - 1); solidBox(c1.x, c2.x, c1.z, c2.z);
  [-1, 1].forEach(e => { const a = wc(e * NICHE_HW, 0.05), b = wc(e * (NICHE_HW + 0.6), -NICHE_D - 0.5); solidBox(a.x, b.x, a.z, b.z); });
  const p1 = wc(-1.2, pz - 1.2), p2 = wc(1.2, pz + 1.2); solidBox(p1.x, p2.x, p1.z, p2.z);
  return N;
}

// ---------- Rotunda ----------
function buildRotunda() {
  const gap = Math.asin(6.7 / ROT_R);
  const cyl = new THREE.CylinderGeometry(ROT_R, ROT_R, 13, 160, 1, true, gap, Math.PI * 2 - gap * 2);
  const uv = cyl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 - gap * 2) * ROT_R / 4, uv.getY(i) * 13 / 4);
  add("wall", flipGeo(cyl), mtx(0, 6.5, ROT_Z), { keepUV: true });
  const dome = new THREE.SphereGeometry(ROT_R, 128, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const du = dome.attributes.uv; for (let i = 0; i < du.count; i++) du.setXY(i, du.getX(i) * Math.PI * 2 * ROT_R / 4, du.getY(i) * ROT_R * 1.57 / 4);
  add("vault", flipGeo(dome), mtx(0, 13, ROT_Z), { keepUV: true });
  // rotunda side of the gateway: a flat wall with the arch
  const fw = new THREE.Shape([[-6.75, 0], [6.75, 0], [6.75, 13.05], [-6.75, 13.05]].map(([a, b]) => new THREE.Vector2(a, b))); fw.holes.push(new THREE.Path(archPts(0, 0, GATE_HW + 0.55, GATE_SPRING)));
  add("wall", new THREE.ShapeGeometry(fw, 32), mtx(0, 0, ROT_FACE - 0.07, 0, Math.PI));
  // dome ribs, rings and oculus
  for (let i = 0; i < 24; i++) add("marble", new THREE.TorusGeometry(ROT_R - 0.12, 0.16, 6, 40, Math.PI / 2 - 0.14), mtx(0, 13, ROT_Z, 0, i / 24 * Math.PI * 2));
  [20, 38, 56, 72].forEach(deg => { const t = deg * Math.PI / 180; add("marble", new THREE.TorusGeometry(ROT_R * Math.sin(t) - 0.12, 0.14, 6, 128), mtx(0, 13 + ROT_R * Math.cos(t), ROT_Z, Math.PI / 2)); });
  const ros = lathe([[0, 0.12], [0.1, 0.11], [0.2, 0.06], [0.26, 0.0]], 10);
  [[29, 1], [47, 0.85], [64, 0.7]].forEach(([deg]) => { const t = deg * Math.PI / 180; for (let i = 0; i < 24; i++) { const p = (i + 0.5) / 24 * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(t) * Math.sin(p), Math.cos(t), Math.sin(t) * Math.cos(p)); const pos = dir.clone().multiplyScalar(ROT_R - 0.04);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), new THREE.Vector3(0, 1, 0)); m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    m.setPosition(pos.x, 13 + pos.y, ROT_Z + pos.z); add("gold", ros, m); } });
  const ot = 9 * Math.PI / 180;
  add("gold", new THREE.TorusGeometry(ROT_R * Math.sin(ot), 0.12, 8, 64), mtx(0, 13 + ROT_R * Math.cos(ot) - 0.05, ROT_Z, Math.PI / 2));
  add("glass", new THREE.CircleGeometry(ROT_R * Math.sin(ot), 48), mtx(0, 13 + ROT_R * Math.cos(ot) + 0.02, ROT_Z, Math.PI / 2));
  // colonnade with its entablature, attic cornice
  const colAngles = []; for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.62) colAngles.push(a); }
  colAngles.forEach(a => column(Math.sin(a) * 14.1, ROT_Z + Math.cos(a) * 14.1));
  const ep = [[ROT_R, ENT_Y1], [13.4, ENT_Y1], [13.4, 9.16], [13.55, 9.08], [13.8, 9.05], [13.8, 8.75], [13.64, 8.75], [13.64, 8.62], [13.7, 8.62], [13.7, ENT_Y0], [ROT_R, ENT_Y0]];
  add("marble", lathe(ep, 160, gap, Math.PI * 2 - gap * 2), mtx(0, 0, ROT_Z));
  add("goldLine", new THREE.TorusGeometry(13.79, 0.025, 4, 160, Math.PI * 2 - gap * 2), mtx(0, 8.9, ROT_Z, Math.PI / 2, 0, Math.PI / 2 + gap));
  add("marble", lathe([[ROT_R, 12.7], [14.6, 12.7], [14.5, 12.85], [14.35, 13.0], [ROT_R, 13.0]], 160, gap, Math.PI * 2 - gap * 2), mtx(0, 0, ROT_Z));
  add("marble", lathe([[ROT_R, 13.0], [14.5, 13.0], [14.5, 13.25], [ROT_R, 13.3]], 160), mtx(0, 0, ROT_Z));
  // wall panels between the columns (the back one holds the Roll of Honour)
  colAngles.forEach((a, i) => { const b = colAngles[(i + 1) % colAngles.length]; let m = (a + b) / 2; if (b < a) return;
    if (Math.abs(m - Math.PI) < 0.05) return;
    const x = Math.sin(m) * 14.93, z = ROT_Z + Math.cos(m) * 14.93;
    add("dark", new THREE.BoxGeometry(2.7, 5.4, 0.06), mtx(x, 4.3, z, 0, m));
    [[0, 7.03, 2.8, 0.08], [0, 1.57, 2.8, 0.08]].forEach(([, y, w, t]) => add("gold", new THREE.BoxGeometry(w, t, 0.08), mtx(x - Math.sin(m) * 0.02, y, z - Math.cos(m) * 0.02, 0, m)));
    [-1.4, 1.4].forEach(o => add("gold", new THREE.BoxGeometry(0.08, 5.5, 0.08), mtx(x - Math.sin(m) * 0.02 + Math.cos(m) * o, 4.3, z - Math.cos(m) * 0.02 - Math.sin(m) * o, 0, m)));
  });
  // stepped dais
  let y = 0;
  DAIS.forEach(([r, h], i) => { add(i === 2 ? "dark" : "marble", new THREE.CylinderGeometry(r, r + 0.06, h, 128), mtx(0, y + h / 2, ROT_Z));
    add("goldLine", new THREE.TorusGeometry(r + 0.01, 0.02, 4, 160), mtx(0, y + h, ROT_Z, Math.PI / 2)); solidCirc(0, ROT_Z, r, y + h); y += h; });
}

// ---------- Shared effect materials ----------
const U = { time: { value: 0 }, flame: { value: 0.15 } };
function beamMaterial(color, soft = 1.6, noise = 0.5) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 0 }, uTime: U.time, uFog: { value: scene.fog.density }, uSoft: { value: soft }, uNoise: { value: noise } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower, uTime, uFog, uSoft, uNoise; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h(i), h(i + vec3(1., 0., 0.)), f.x), mix(h(i + vec3(0., 1., 0.)), h(i + vec3(1., 1., 0.)), f.x), f.y),
                   mix(mix(h(i + vec3(0., 0., 1.)), h(i + vec3(1., 0., 1.)), f.x), mix(h(i + vec3(0., 1., 1.)), h(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
      void main(){ float edge = pow(clamp(abs(dot(vN, vV)), 0., 1.), uSoft); float fall = pow(clamp(vUv.y, 0., 1.), 1.3);
        float dust = mix(1., .5 + n3(vW * 1.4 + vec3(0., -uTime * .3, uTime * .12)) * .5 + n3(vW * 3.1 + vec3(uTime * .2, -uTime * .5, 0.)) * .5, uNoise);
        float fogK = exp(-vD * uFog * 1.1);
        gl_FragColor = vec4(max(uColor * edge * fall * uPower * dust * fogK, 0.), 1.); }`,
  });
}
function radialTex(stops, size = 128) {
  return canvasTex(size, size, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}
let GLOW_TEX, SHADOW_TEX;
function decal(color, w, h, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: GLOW_TEX, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.userData.noAO = true; return m;
}

// Flames and soft glows: one instanced, camera-facing quad set each, for every candle and brazier in the hall.
const FL = { pos: [], size: [], seed: [] }, GL = { pos: [], size: [], col: [] };
const addFlame = (x, y, z, w, h) => { FL.pos.push(x, y, z); FL.size.push(w, h); FL.seed.push(Math.random()); };
const addGlow = (x, y, z, s, r, g, b) => { GL.pos.push(x, y, z); GL.size.push(s); GL.col.push(r, g, b); };
function buildFlames() {
  const quad = (yOff) => { const b = new THREE.PlaneGeometry(1, 1); b.translate(0, yOff, 0); const g = new THREE.InstancedBufferGeometry(); g.index = b.index; g.setAttribute("position", b.attributes.position); g.setAttribute("uv", b.attributes.uv); return g; };
  const fg = quad(0.5);
  fg.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(FL.pos), 3)); fg.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(FL.size), 2));
  fg.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(FL.seed), 1)); fg.instanceCount = FL.seed.length;
  const flames = new THREE.Mesh(fg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uPower: U.flame },
    vertexShader: `attribute vec3 aPos; attribute vec2 aSize; attribute float aSeed; uniform float uTime; varying vec2 vUv; varying float vFl;
      void main(){ vUv = uv; float fl = .86 + .09 * sin(uTime * 11. + aSeed * 40.) + .06 * sin(uTime * 23. + aSeed * 13.); vFl = fl;
        vec4 mv = viewMatrix * vec4(aPos, 1.); vec2 o = position.xy * aSize * vec2(1., fl); o.x += sin(uTime * 6. + aSeed * 9.) * .1 * aSize.x * position.y;
        mv.xy += o; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uPower; varying vec2 vUv; varying float vFl;
      void main(){ float x = vUv.x - .5, y = vUv.y; float w = 1.1 * (1. - y) * sqrt(max(y, 0.)) + .001; float d = abs(x) / w;
        float body = (1. - smoothstep(.55, 1., d)) * smoothstep(0., .06, y) * (1. - smoothstep(.8, 1., y));
        float core = (1. - smoothstep(0., .55, d)) * (1. - smoothstep(.15, .55, y)) * smoothstep(0., .08, y);
        vec3 col = mix(vec3(1., .38, .08), vec3(1., .72, .32), clamp(core + (1. - y) * .3, 0., 1.)) * body * 2.4 + vec3(1., .93, .78) * core * 2.4;
        gl_FragColor = vec4(max(col * uPower * vFl, 0.), 1.); }`,
  }));
  const gg = quad(0);
  gg.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(GL.pos), 3)); gg.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(GL.size), 1));
  gg.setAttribute("aCol", new THREE.InstancedBufferAttribute(new Float32Array(GL.col), 3)); gg.instanceCount = GL.size.length;
  const glows = new THREE.Mesh(gg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uPower: U.flame, uFog: { value: scene.fog.density } },
    vertexShader: `attribute vec3 aPos; attribute float aSize; attribute vec3 aCol; uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying float vD;
      void main(){ vUv = uv; vCol = aCol * (.92 + .08 * sin(uTime * 9. + aPos.x * 3. + aPos.z)); vec4 mv = viewMatrix * vec4(aPos, 1.); vD = length(mv.xyz); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uPower, uFog; varying vec2 vUv; varying vec3 vCol; varying float vD;
      void main(){ float r = length(vUv - .5) * 2.; float a = pow(max(1. - r, 0.), 2.2); gl_FragColor = vec4(max(vCol * a * uPower * exp(-vD * uFog * .8), 0.), 1.); }`,
  }));
  [flames, glows].forEach(m => { m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5; scene.add(m); });
}
// Rising embers over the braziers
let embers;
function buildEmbers(spots) {
  const N = 90 * spots.length, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const s = spots[i % spots.length]; pos.set([s.x, s.y, s.z], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  embers = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.time, uPower: U.flame, uScale: { value: innerHeight * DPR } },
    vertexShader: `attribute float aSeed; uniform float uTime, uScale; varying float vA;
      void main(){ float t = fract(uTime * (.18 + aSeed * .2) + aSeed * 7.); vec3 p = position;
        p.y += t * 3.2; p.x += sin(t * 6. + aSeed * 30.) * .35 * t + (aSeed - .5) * .5; p.z += cos(t * 5. + aSeed * 20.) * .35 * t;
        vA = (1. - t) * smoothstep(0., .1, t); vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = uScale * .012 * (.5 + aSeed) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uPower; varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(1., .55, .2) * max(1. - r, 0.) * vA * 3. * uPower, 1.); }`,
  }));
  embers.frustumCulled = false; embers.userData.noAO = true; scene.add(embers);
}
// Dust motes drifting through the hall
let dust;
function buildDust() {
  const N = LOAD_Q.tex >= 2048 ? 3200 : 1600, pos = new Float32Array(N * 3), r = rng(99);
  for (let i = 0; i < N; i++) {
    if (i < N * 0.8) pos.set([(r() - 0.5) * 16, r() * 14, DOOR_Z - r() * (DOOR_Z - NAVE_END_Z)], i * 3);
    else { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 13; pos.set([Math.sin(a) * rr, r() * 18, ROT_Z + Math.cos(a) * rr], i * 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.time, uScale: { value: innerHeight * DPR }, uFog: { value: scene.fog.density } },
    vertexShader: `uniform float uTime, uScale, uFog; varying float vA;
      void main(){ vec3 p = position; float s = fract(sin(dot(p.xz, vec2(12.9, 78.2))) * 437.5);
        p.y = mod(p.y + uTime * (.05 + s * .08), 16.); p.x += sin(uTime * .21 + s * 40.) * .6; p.z += cos(uTime * .17 + s * 30.) * .6;
        vec4 mv = modelViewMatrix * vec4(p, 1.); float d = -mv.z; vA = (.35 + .65 * pow(.5 + .5 * sin(uTime * (1. + s * 2.) + s * 60.), 3.)) * exp(-d * uFog * 1.5) * smoothstep(.4, 2.5, d) * mix(1., .12, smoothstep(5., 11., p.y));
        gl_PointSize = uScale * .0045 * (.6 + s) / max(d, .1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(1., .88, .7) * max(1. - r * r, 0.) * vA * .7, 1.); }`,
  }));
  dust.frustumCulled = false; dust.userData.noAO = true; scene.add(dust);
}

// ---------- Chandeliers, braziers, moonbeams ----------
function chandelier(z) {
  const cy = 8.7;
  const link = new THREE.TorusGeometry(0.055, 0.014, 4, 10);
  let i = 0; for (let y = cy + 1.12; y < VAULT_TOP - 0.05; y += 0.15, i++) add("goldDull", link, mtx(0, y, z, 0, (i % 2) * Math.PI / 2, 0, 1, 1.5, 1));
  add("gold", lathe([[0.0001, -1.0], [0.06, -0.97], [0.11, -0.85], [0.05, -0.68], [0.17, -0.48], [0.21, -0.32], [0.09, -0.17], [0.07, 0.2], [0.13, 0.36], [0.06, 0.52], [0.05, 0.95], [0.1, 1.05], [0.0001, 1.12]].map(([r, y]) => [r, y + cy]), 24), mtx(0, 0, z));
  add("gold", new THREE.TorusGeometry(1.35, 0.035, 6, 64), mtx(0, cy - 0.04, z, Math.PI / 2));
  add("gold", new THREE.TorusGeometry(0.8, 0.028, 6, 48), mtx(0, cy + 0.46, z, Math.PI / 2));
  const cup = lathe([[0.0001, 0], [0.075, 0.02], [0.095, 0.065], [0.065, 0.085]], 12);
  const candle = new THREE.CylinderGeometry(0.034, 0.036, 0.24, 10);
  const tier = (n, R, y0, yArm, off) => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, yArm, 0), new THREE.Vector3(R * 0.45, yArm - 0.12, 0), new THREE.Vector3(R * 0.85, yArm + 0.02, 0), new THREE.Vector3(R, y0, 0)]);
    const arm = new THREE.TubeGeometry(curve, 14, 0.022, 6);
    for (let k = 0; k < n; k++) {
      const a = (k + off) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      add("gold", arm, mtx(0, 0, z, 0, -a));
      add("gold", cup, mtx(c * R, y0, z - s * R));
      add("candle", candle, mtx(c * R, y0 + 0.2, z - s * R));
      addFlame(c * R, y0 + 0.33, z - s * R, 0.085, 0.2);
    }
  };
  tier(10, 1.35, cy + 0.02, cy - 0.32, 0); tier(6, 0.8, cy + 0.5, cy + 0.2, 0.5);
  const oct = new THREE.OctahedronGeometry(0.045, 0);
  for (let k = 0; k < 30; k++) { const a = k / 30 * Math.PI * 2; add("crystal", oct, mtx(Math.cos(a) * 1.35, cy - 0.2, z - Math.sin(a) * 1.35, 0, a, 0, 1, 2.4, 1)); }
  for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2, rr = 0.55 + (k % 2) * 0.15; add("crystal", oct, mtx(Math.cos(a) * rr, cy - 0.55 - (k % 2) * 0.15, z - Math.sin(a) * rr, 0, a, 0, 1, 2.2, 1)); }
  add("crystal", new THREE.OctahedronGeometry(0.11, 0), mtx(0, cy - 1.2, z, 0, 0, 0, 1, 2, 1));
  addGlow(0, cy + 0.2, z, 5.5, 1, 0.62, 0.3); addGlow(0, cy + 0.2, z, 2.2, 1, 0.75, 0.45);
}
const BRAZIERS = [-1, 1].map(s => new THREE.Vector3(s * 4.6, 0, DOOR_Z - 2.6));
function brazier(p) {
  add("gold", lathe([[0.52, 0], [0.52, 0.07], [0.3, 0.12], [0.16, 0.26], [0.1, 0.5], [0.13, 0.56], [0.08, 0.64], [0.08, 1.06], [0.15, 1.12], [0.12, 1.2], [0.2, 1.26], [0.55, 1.34], [0.8, 1.55], [0.86, 1.62], [0.8, 1.65], [0.0001, 1.52]], 32), mtx(p.x, 0, p.z));
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.3; const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * 0.62, 1.45, Math.sin(a) * 0.62), new THREE.Vector3(Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7), new THREE.Vector3(Math.cos(a) * 0.42, 0.35, Math.sin(a) * 0.42), new THREE.Vector3(Math.cos(a) * 0.6, 0.03, Math.sin(a) * 0.6)]);
    add("gold", new THREE.TubeGeometry(curve, 16, 0.035, 6), mtx(p.x, 0, p.z)); }
  add("ember", new THREE.CircleGeometry(0.74, 24), mtx(p.x, 1.56, p.z, -Math.PI / 2));
  [[0, 0, 0.75, 1.9], [0.22, 0.1, 0.55, 1.4], [-0.2, 0.12, 0.55, 1.5], [0.05, -0.22, 0.5, 1.3], [0.1, 0.25, 0.45, 1.1], [-0.25, -0.1, 0.45, 1.2]].forEach(([dx, dz, w, h]) => addFlame(p.x + dx, 1.5, p.z + dz, w, h));
  addGlow(p.x, 2.2, p.z, 6, 0.7, 0.34, 0.12); addGlow(p.x, 2.0, p.z, 2.6, 0.75, 0.46, 0.22);
  solidCirc(p.x, p.z, 0.9);
}
const moonBeams = [];
function moonBeam(z) {
  const top = new THREE.Vector3(0, VAULT_TOP + 0.1, z), t = top.y / -MOON_DIR.y, bot = top.clone().addScaledVector(MOON_DIR, t);
  const len = top.distanceTo(bot);
  const geo = new THREE.CylinderGeometry(0.5, 0.95, len, 40, 1, true);
  const mat = beamMaterial(0x9fb6ff, 1.8, 0.75);
  const m = new THREE.Mesh(geo, mat); m.position.copy(top).add(bot).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); m.userData.noAO = true; scene.add(m);
  const pool = decal(new THREE.Color(0x8ea6ff), 2.5, 2.5 / Math.abs(MOON_DIR.y) * 1.0, 0); pool.position.set(bot.x, 0.02, bot.z); pool.rotation.z = Math.atan2(MOON_DIR.x, MOON_DIR.z); scene.add(pool);
  moonBeams.push({ m, pool });
}

// ---------- Cloth banners ----------
function clothMaterial(rel, phase) {
  const mat = new THREE.MeshStandardMaterial({ map: rel.map, normalMap: rel.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0.05, alphaTest: 0.5, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: rel.map, emissiveIntensity: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uPhase = { value: phase };
    sh.vertexShader = "uniform float uTime; uniform float uPhase;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float hang = 1. - uv.y; float wv = sin(uTime * 1.25 + position.y * 1.7 + uPhase) * .045 + sin(uTime * .7 + position.x * 2.1 + uPhase * 2.) * .025;
      transformed.z += wv * hang * hang * 1.6; transformed.x += sin(uTime * .5 + uPhase) * .03 * hang * hang;`);
  };
  mat.customProgramCacheKey = () => "cloth";
  return mat;
}
function banner(rel, w, h, phase) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 6, 24), clothMaterial(rel, phase)); m.castShadow = true; m.receiveShadow = true; return m; }

// ---------- Minecraft player model (real skins) ----------
function fallbackSkin() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "#3a3f4a"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#c69c7a"; g.fillRect(0, 0, 32, 16); g.fillStyle = "#2b2f38"; g.fillRect(8, 0, 8, 8);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return { tex: t, slim: false };
}
async function loadSkin(src) {
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  if (img.height === 32) { // legacy skin: copy right limbs to the left
    const flip = (sx, sy, dx, dy) => { g.save(); g.translate(dx + 16, dy); g.scale(-1, 1); g.drawImage(c, sx, sy, 16, 16, 0, 0, 16, 16); g.restore(); };
    flip(0, 16, 16, 48); flip(40, 16, 32, 48);
  }
  let slim = true; const px = g.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { slim = false; break; }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, slim };
}
function skinBox(w, h, d, u, v, inflate = 0) {
  const g = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
  const F = [[u + d + w, v + d, d, h], [u, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h]];
  const uv = g.attributes.uv;
  F.forEach(([x, y, fw, fh], f) => { const x1 = x / 64, x2 = (x + fw) / 64, y1 = 1 - y / 64, y2 = 1 - (y + fh) / 64, a = f * 4;
    uv.setXY(a, x1, y1); uv.setXY(a + 1, x2, y1); uv.setXY(a + 2, x1, y2); uv.setXY(a + 3, x2, y2); });
  return g;
}
const SWORD = [
  "..............OO", ".............OLO", "............OLMO", "...........OLMO.", "..........OLMO..", ".........OLMO...", "........OLMO....", "...OO..OLMO.....",
  "...OGOOLMO......", "....OGLMO.......", ".....OGO........", "....OHOGO.......", "...OHO.OGO......", ".OOHO...OO......", ".OHO............", ".OO.............",
];
const SWORD_COL = { O: 0x0b3a36, L: 0xb4fff6, M: 0x36e6cc, G: 0x2b1d0d, H: 0x6b4a24 };
function makeSword() {
  const grp = new THREE.Group(); const bx = new THREE.BoxGeometry(1, 1, 1);
  const byCol = {}; SWORD.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") (byCol[ch] ||= []).push([x, y]); }));
  Object.entries(byCol).forEach(([ch, cells]) => {
    const mat = new THREE.MeshStandardMaterial({ color: SWORD_COL[ch], roughness: 0.3, metalness: ch === "H" ? 0 : 0.35, emissive: ch === "L" || ch === "M" ? SWORD_COL[ch] : 0, emissiveIntensity: ch === "L" ? 0.35 : 0.15 });
    const im = new THREE.InstancedMesh(bx, mat, cells.length); const m = new THREE.Matrix4(); im.castShadow = true;
    cells.forEach(([x, y], i) => { m.makeTranslation(x - 3.5, 12.5 - y, 0); im.setMatrixAt(i, m); }); grp.add(im);
  });
  return grp;
}
function makePlayer(skin) {
  const { tex, slim } = skin; const aw = slim ? 3 : 4;
  const base = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  const over = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const part = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const head = new THREE.Group(); head.position.set(0, 24, 0); body.add(head);
  part(head, skinBox(8, 8, 8, 0, 0), base, 0, 4, 0); part(head, skinBox(8, 8, 8, 32, 0, 0.5), over, 0, 4, 0);
  part(body, skinBox(8, 12, 4, 16, 16), base, 0, 18, 0); part(body, skinBox(8, 12, 4, 16, 32, 0.25), over, 0, 18, 0);
  const rArm = new THREE.Group(); rArm.position.set(-(4 + aw / 2), 22, 0); body.add(rArm);
  part(rArm, skinBox(aw, 12, 4, 40, 16), base, 0, -4, 0); part(rArm, skinBox(aw, 12, 4, 40, 32, 0.25), over, 0, -4, 0);
  const lArm = new THREE.Group(); lArm.position.set(4 + aw / 2, 22, 0); body.add(lArm);
  part(lArm, skinBox(aw, 12, 4, 32, 48), base, 0, -4, 0); part(lArm, skinBox(aw, 12, 4, 48, 48, 0.25), over, 0, -4, 0);
  const rLeg = new THREE.Group(); rLeg.position.set(-2, 12, 0); root.add(rLeg);
  part(rLeg, skinBox(4, 12, 4, 0, 16), base, 0, -6, 0); part(rLeg, skinBox(4, 12, 4, 0, 32, 0.25), over, 0, -6, 0);
  const lLeg = new THREE.Group(); lLeg.position.set(2, 12, 0); root.add(lLeg);
  part(lLeg, skinBox(4, 12, 4, 16, 48), base, 0, -6, 0); part(lLeg, skinBox(4, 12, 4, 0, 48, 0.25), over, 0, -6, 0);
  // Held like in-game: the grip sits in the fist, the sword's flat side lines up with the arm,
  // and the blade points forward and up. `grip` tilts it further when the player salutes.
  const sword = makeSword(); sword.scale.setScalar(0.8); sword.rotation.y = -Math.PI / 2;
  const grip = new THREE.Group(); grip.position.set(0, -10.6, 0.3); grip.add(sword); rArm.add(grip);
  root.scale.setScalar(1 / 16);
  return { root, body, head, rArm, lArm, rLeg, lLeg, sword, grip, mats: [base, over], phase: Math.random() * 10 };
}

// ---------- Exhibits ----------
const exhibits = [], hitTargets = [];
const plaqueGeo = new THREE.PlaneGeometry(1.5, 0.82);
function trimMaterial(flag) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(flag ? 0xff3a4e : 0xffc56b), toneMapped: false }); }
function plaqueMaterial(rel) { return new THREE.MeshStandardMaterial({ map: rel.map, normalMap: rel.normal, roughness: 0.38, metalness: 0.75, envMapIntensity: 1.4, emissive: 0xffffff, emissiveMap: rel.map, emissiveIntensity: 0 }); }
function buildNicheExhibit(slot, N, skin) {
  const d = slot.ded ? null : byRank.get(slot.rank), flag = !!(d && d.cheating), s = slot.side;
  const g = new THREE.Group(); g.position.set(s * WALL_X, 0, slot.z); g.rotation.y = -s * Math.PI / 2; world.add(g); g.updateMatrixWorld();
  const L = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.035, 1.94), trimMaterial(flag)); trim.position.set(0, 1.375, -PLINTH_D); trim.userData.noAO = true; g.add(trim);
  const plaque = new THREE.Mesh(plaqueGeo, plaqueMaterial(reliefPanel(1024, 560, d ? drawPlaque(d) : drawDedication))); plaque.position.set(0, 0.88, -PLINTH_D + 0.958); g.add(plaque);
  const ban = banner(reliefPanel(512, 1164, drawBanner(d), 2), 2.2, 5.0, slot.z * 0.7 + s); ban.position.set(0, 5.15, -NICHE_D + 0.16); g.add(ban);
  add("gold", new THREE.CylinderGeometry(0.03, 0.03, 2.6, 10), g.matrixWorld.clone().multiply(mtx(0, 7.7, -NICHE_D + 0.16, 0, 0, Math.PI / 2)));
  [-1.3, 1.3].forEach(x => add("gold", new THREE.SphereGeometry(0.07, 12, 8), g.matrixWorld.clone().multiply(mtx(x, 7.7, -NICHE_D + 0.16))));
  const coneColor = flag ? 0xff6a7a : 0xffd8a0;
  const lamp = new THREE.Vector3(0, 7.6, -0.95), foot = new THREE.Vector3(0, 1.75, -PLINTH_D);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1.25, lamp.distanceTo(foot), 40, 1, true), beamMaterial(coneColor, 1.8, 0.45));
  cone.position.copy(lamp).add(foot).multiplyScalar(0.5); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lamp.clone().sub(foot).normalize()); cone.userData.noAO = true; g.add(cone);
  const pool = decal(new THREE.Color(coneColor), 4.8, 3.4, 0); pool.position.set(0, 0.018, -0.9); g.add(pool);
  const ex = { d, slot, group: g, cone, pool, plaque, banner: ban, trim, power: 0, target: 0, near: 0, podium: false, flag, lightW: 0,
    x: s * (WALL_X + PLINTH_D), z: slot.z, lightPos: L(0, 7.55, -0.95), lightTarget: L(0, 2.3, -PLINTH_D), center: L(0, 2.6, -PLINTH_D),
    stand: L(s * 0, 0, 0) };
  // where to stand to look at this one: in the aisle, a little toward the entrance
  ex.stand = new THREE.Vector3(s * 5.3, 0, slot.z + 1.3);
  if (d) {
    const fig = makePlayer(skin || fallbackSkin()); fig.root.position.set(0, PLINTH_TOP, -PLINTH_D); fig.root.rotation.y = s * 0.25; g.add(fig.root); ex.fig = fig;
  } else {
    // the dedication plinth holds a gold trophy
    const cup = new THREE.Group(); cup.position.set(0, PLINTH_TOP, -PLINTH_D); g.add(cup);
    const body = new THREE.Mesh(lathe([[0.36, 0], [0.36, 0.08], [0.16, 0.15], [0.09, 0.3], [0.14, 0.4], [0.07, 0.56], [0.1, 0.66], [0.42, 0.8], [0.56, 1.08], [0.52, 1.4], [0.49, 1.43], [0.46, 1.4], [0.5, 1.1], [0.38, 0.86], [0.0001, 0.8]], 48), M.gold);
    body.castShadow = true; cup.add(body);
    [-1, 1].forEach(e => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 24, Math.PI * 1.2), M.gold); h.position.set(e * 0.56, 1.1, 0); h.rotation.z = e > 0 ? -Math.PI * 0.6 : Math.PI * 0.4; h.castShadow = true; cup.add(h); });
    ex.cup = cup;
  }
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.8, 2.6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 2.4, -PLINTH_D); g.add(hit); hit.userData.ex = ex; hitTargets.push(hit);
  exhibits.push(ex);
}

// ---------- The podium, the prism and the Roll of Honour ----------
let prism, prismBeams = [], beamIn, specRing, rollPlane;
// a gilded lamp ring hung from the oculus on six rods; each podium's spotlight hangs from it (rotunda-local coordinates)
const CORONA = { y: 14.2, r: 5.0, z: 0.6, rodTop: 27.55, rodR: 2.2 };
function buildCorona() {
  const at = (x, y, z, q) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, ROT_Z + z), q || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  const { y, r, z } = CORONA;
  add("gold", new THREE.TorusGeometry(r, 0.085, 10, 160), at(0, y, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))));
  add("goldDull", new THREE.TorusGeometry(r, 0.05, 8, 160), at(0, y - 0.42, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))));
  add("goldDull", new THREE.TorusGeometry(r - 0.02, 0.035, 6, 160), at(0, y + 0.3, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))));
  for (let i = 0; i < 36; i++) { // balusters between the rings, a finial on every third
    const a = i / 36 * Math.PI * 2, x = Math.sin(a) * r, zz = z + Math.cos(a) * r;
    add("goldDull", lathe([[0.03, 0], [0.05, 0.08], [0.03, 0.2], [0.045, 0.36], [0.03, 0.5], [0.04, 0.72]], 8), at(x, y - 0.42, zz));
    if (i % 3 === 0) { add("gold", new THREE.SphereGeometry(0.075, 12, 8), at(x, y + 0.42, zz)); add("gold", new THREE.ConeGeometry(0.04, 0.22, 8), at(x, y + 0.6, zz)); }
  }
  for (let i = 0; i < 6; i++) { // suspension rods up to the oculus rim
    const a = (i + 0.5) / 6 * Math.PI * 2, lo = new THREE.Vector3(Math.sin(a) * r, y + 0.3, z + Math.cos(a) * r), hi = new THREE.Vector3(Math.sin(a) * CORONA.rodR, CORONA.rodTop, Math.cos(a) * CORONA.rodR);
    const mid = lo.clone().add(hi).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hi.clone().sub(lo).normalize());
    add("goldDull", new THREE.CylinderGeometry(0.028, 0.028, lo.distanceTo(hi), 6), at(mid.x, mid.y, mid.z, q));
    add("gold", new THREE.SphereGeometry(0.07, 10, 8), at(lo.x, lo.y, lo.z));
  }
}
const LAMP_CAN = lathe([[0.0001, 0.36], [0.11, 0.36], [0.16, 0.31], [0.17, 0.05], [0.2, -0.12], [0.245, -0.22], [0.25, -0.26], [0.225, -0.26], [0.205, -0.2]], 24);
// a spotlight hung under the ring on a short stem, at the ring point nearest above-front of the podium, aimed at the statue
function coronaLamp(p, target, flag) {
  const { y, r, z } = CORONA, a = Math.atan2(p.x, p.z + (p.rank === 1 ? 6 : 2) - z);
  const ring = new THREE.Vector3(Math.sin(a) * r, y - 0.42, z + Math.cos(a) * r), pivot = ring.clone().add(new THREE.Vector3(0, -0.55, 0));
  const dir = target.clone().sub(pivot).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const at = (v, qq) => new THREE.Matrix4().compose(new THREE.Vector3(v.x, v.y, ROT_Z + v.z), qq || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  add("goldDull", new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), at(ring.clone().add(new THREE.Vector3(0, -0.25, 0))));
  add("gold", new THREE.SphereGeometry(0.07, 10, 8), at(pivot));
  add("gold", LAMP_CAN, at(pivot, q));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.205, 24), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: true }));
  lens.userData.base = new THREE.Color(flag ? 0xff8592 : 0xfff0d6); lens.userData.noAO = true;
  lens.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  const mouth = pivot.clone().addScaledVector(dir, 0.21); lens.position.set(mouth.x, mouth.y, ROT_Z + mouth.z); world.add(lens);
  return { mouth, lens };
}
const PODIUM = [{ rank: 1, x: 0, z: -1.2, h: 1.9, s: 2.0 }, { rank: 2, x: -3.9, z: 1.4, h: 1.25, s: 1.65 }, { rank: 3, x: 3.9, z: 1.4, h: 0.8, s: 1.65 }];
function buildPodium(skinOf) {
  const R = new THREE.Group(); R.position.set(0, 0, ROT_Z); world.add(R);
  const SR = [5.9, 6.0, 6.08, 6.17]; // spectrum inlay just inside the rim of the dais top
  specRing = new THREE.Mesh(new THREE.RingGeometry(SR[0], SR[3], 160), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPower: { value: 0 }, uTime: U.time },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uPower; uniform float uTime; varying vec3 vP; vec3 hue(float h){ return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
      void main(){ float a = atan(vP.y, vP.x) / 6.2831853 + .5; float r = length(vP.xy); float band = smoothstep(${SR[0].toFixed(2)}, ${SR[1].toFixed(2)}, r) * (1. - smoothstep(${SR[2].toFixed(2)}, ${SR[3].toFixed(2)}, r));
        gl_FragColor = vec4(max(hue(a + uTime * .03) * band * uPower * 1.3, 0.), 1.); }`,
  }));
  specRing.rotation.x = -Math.PI / 2; specRing.position.y = DAIS_TOP + 0.012; specRing.userData.noAO = true; R.add(specRing);
  buildCorona();
  PODIUM.forEach(p => {
    const d = byRank.get(p.rank); if (!d) return;
    const g = new THREE.Group(); g.position.set(p.x, DAIS_TOP, p.z); R.add(g);
    const wm = mtx(p.x, DAIS_TOP, ROT_Z + p.z);
    add("dark", new THREE.BoxGeometry(2.4, p.h, 2.4), wm.clone().multiply(mtx(0, p.h / 2, 0)));
    add("marble", new THREE.BoxGeometry(2.62, 0.14, 2.62), wm.clone().multiply(mtx(0, p.h + 0.07, 0)));
    add("marble", new THREE.BoxGeometry(2.6, 0.12, 2.6), wm.clone().multiply(mtx(0, 0.06, 0)));
    solidBox(p.x - 1.3, p.x + 1.3, ROT_Z + p.z - 1.3, ROT_Z + p.z + 1.3);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.43, 0.04, 2.43), trimMaterial(d.cheating)); trim.position.y = p.h - 0.08; trim.userData.noAO = true; g.add(trim);
    const nrel = reliefPanel(512, 512, drawNumeral(p.rank), 3);
    const sz = Math.min(1.6, p.h * 0.9);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshStandardMaterial({ map: nrel.map, normalMap: nrel.normal, metalness: 0.7, roughness: 0.35, emissive: 0xffffff, emissiveMap: nrel.map, emissiveIntensity: 0 }));
    num.position.set(0, p.h / 2, 1.205); g.add(num);
    const fig = makePlayer(skinOf.get(p.rank) || fallbackSkin()); fig.root.scale.multiplyScalar(p.s); fig.root.position.y = p.h + 0.14; g.add(fig.root); fig.phase = p.rank * 3.1;
    // lectern at the foot of the dais with the plaque
    const lect = new THREE.Group(); lect.position.set(p.x * 1.3, 0, ROT_Z + (p.rank === 1 ? 9.3 : 8.6)); if (p.rank !== 1) lect.rotation.y = -Math.sign(p.x) * 0.25; world.add(lect); lect.updateMatrixWorld();
    add("dark", new THREE.BoxGeometry(2.2, 0.62, 1.0), lect.matrixWorld.clone().multiply(mtx(0, 0.31, -0.25)));
    add("gold", new THREE.BoxGeometry(2.26, 0.05, 1.06), lect.matrixWorld.clone().multiply(mtx(0, 0.645, -0.25)));
    const lean = new THREE.Group(); lean.position.set(0, 0.67, 0.2); lean.rotation.x = -0.62; lect.add(lean);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.12, 0.06), M.gold); back.position.set(0, 0.56, -0.04); lean.add(back);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.04), plaqueMaterial(reliefPanel(1024, 560, drawPlaque(d)))); plq.position.set(0, 0.56, 0.012); lean.add(plq);
    const lc = new THREE.Vector3(0, 0, -0.1).applyMatrix4(lect.matrixWorld); solidBox(lc.x - 1.15, lc.x + 1.15, lc.z - 0.75, lc.z + 0.75, 0.72);
    const headY = DAIS_TOP + p.h + 0.14 + 1.75 * p.s;
    // the beam starts at this podium's lamp on the ring above and runs past the statue to its feet
    const lamp = coronaLamp(p, new THREE.Vector3(p.x, headY - 1.2 * p.s, p.z), d.cheating);
    const tgt = new THREE.Vector3(p.x, headY - 1.2 * p.s, p.z), dir = tgt.clone().sub(lamp.mouth).normalize();
    const len = lamp.mouth.distanceTo(tgt) + 1.1 * p.s;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 1.25 * p.s / 1.3, len, 40, 1, true), beamMaterial(d.cheating ? 0xff7080 : 0xfff0d0, 1.6, 0.4));
    cone.position.copy(lamp.mouth).addScaledVector(dir, len / 2); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()); cone.userData.noAO = true; R.add(cone);
    const ex = { d, group: g, fig, cone, plaque: plq, banner: num, trim, power: 0, target: 0, near: 0, podium: true, rank: p.rank, flag: !!d.cheating, lightW: 0,
      x: p.x, z: ROT_Z + p.z, lightPos: lamp.mouth.clone().addScaledVector(dir, 0.15).add(new THREE.Vector3(0, 0, ROT_Z)), lightTarget: tgt.clone().add(new THREE.Vector3(0, 0, ROT_Z)), lens: lamp.lens,
      center: new THREE.Vector3(p.x, headY - p.s, ROT_Z + p.z), stand: new THREE.Vector3(p.x * 0.55, 0, ROT_Z + (p.rank === 1 ? 11.6 : 10.6)) };
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.8, p.h + 3.4 * p.s, 2.8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = (p.h + 3.4 * p.s) / 2; g.add(hit); hit.userData.ex = ex; hitTargets.push(hit);
    exhibits.push(ex);
  });
  // the prism above #1
  prism = new THREE.Group(); prism.position.set(0, 10.6, -1.2); R.add(prism);
  const pg = new THREE.CylinderGeometry(1.5, 1.5, 1.3, 3); pg.rotateX(Math.PI / 2); pg.rotateZ(Math.PI);
  const glassMat = quality === "low"
    ? new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 0.9, roughness: 0.05, envMapIntensity: 3, transparent: true, opacity: 0.55 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 1.6, ior: 1.6, dispersion: 3, envMapIntensity: 2.4, transparent: true });
  const glass = new THREE.Mesh(pg, glassMat); glass.userData.noAO = true; glass.layers.set(2); prism.add(glass);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pg), new THREE.LineBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.1), toneMapped: false })); prism.add(edges);
  beamIn = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 16.6, 32, 1, true), beamMaterial(0xf2f6ff, 1.6, 0.6)); beamIn.position.set(0, 10.6 + 8.3, -1.2); beamIn.userData.noAO = true; R.add(beamIn);
  const HUES = [0xff3b3b, 0xff9a2e, 0xffe14a, 0x4dff7a, 0x3fd8ff, 0x5b6cff, 0xc25bff];
  HUES.forEach((h, i) => {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.32, 11, 16, 1, true), beamMaterial(h, 1.4, 0.3)); beam.userData.noAO = true;
    const piv = new THREE.Group(); piv.position.copy(prism.position); R.add(piv);
    beam.position.y = -5.5; piv.add(beam); piv.userData = { a: (i / HUES.length) * Math.PI * 2, i }; prismBeams.push(piv);
  });
  // Roll of Honour on the back wall, facing the entrance
  const roll = reliefPanel(1024, 1462, drawRoll, 2);
  rollPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 5.85), new THREE.MeshStandardMaterial({ map: roll.map, normalMap: roll.normal, metalness: 0.55, roughness: 0.42, emissive: 0xffffff, emissiveMap: roll.map, emissiveIntensity: 0 }));
  rollPlane.position.set(0, 4.9, ROT_Z - 14.86); world.add(rollPlane);
  [[0, 7.88, 4.3, 0.1], [0, 1.92, 4.3, 0.1]].forEach(([x, y, w, h]) => box("gold", w, h, 0.1, x, y, ROT_Z - 14.84));
  [-2.1, 2.1].forEach(x => box("gold", 0.1, 6.06, 0.1, x, 4.9, ROT_Z - 14.84));
}
function inscription(lines, w, h, cw, ch) {
  const rel = reliefPanel(cw, ch, drawInscription(lines), 3);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: rel.map, normalMap: rel.normal, metalness: 0.6, roughness: 0.4, emissive: 0xffffff, emissiveMap: rel.map, emissiveIntensity: 0.12 }));
}

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0x7d8aa8, 0x2a1c10, 0.32));
const pool = [];
for (let i = 0; i < LOAD_Q.lights; i++) {
  const s = new THREE.SpotLight(0xffe2b4, 0, 15, 0.5, 0.7, 1.4);
  s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.035; s.shadow.camera.near = 0.6; s.shadow.camera.far = 15;
  s.userData = { ex: null, w: 0 }; scene.add(s, s.target); pool.push(s);
}
function applyShadows() { const n = QUALITY[quality].shadows; pool.forEach((s, i) => { s.castShadow = i < n; }); }
applyShadows();
const rotLight = new THREE.SpotLight(0xfff1d8, 0, 42, 0.42, 0.6, 1.2); rotLight.position.set(0, 26, ROT_Z - 1.2); rotLight.target.position.set(0, 2, ROT_Z - 1.2); scene.add(rotLight, rotLight.target);
const rotFill = new THREE.PointLight(0x9fb4ff, 0, 30, 1.6); rotFill.position.set(0, 7, ROT_Z + 8); scene.add(rotFill);
const brazierLights = BRAZIERS.map(p => { const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.5); l.position.set(p.x, 2.5, p.z); scene.add(l); return l; });
const chandLight = new THREE.PointLight(0xffc98a, 0, 24, 1.5); chandLight.userData = { z: CHANDELIER_ZS[0], w: 0 }; chandLight.position.set(0, 8.4, CHANDELIER_ZS[0]); scene.add(chandLight);

// ---------- Polished floor with blurred planar reflections ----------
// The scene is rendered once more from a mirrored camera into a mip-mapped target; the floor samples
// it at a blur level set by its own roughness, so marble reads soft and the brass inlays read sharp.
const REFL = { rt: null, cam: new THREE.PerspectiveCamera(), on: false, tex: { value: null }, mat: { value: new THREE.Matrix4() }, k: { value: 0 }, lod: { value: 5 } };
let floor;
function reflSize() { const s = QUALITY[quality].refl || 0.35; return [Math.max(64, Math.floor(innerWidth * DPR * s)), Math.max(64, Math.floor(innerHeight * DPR * s))]; }
function setupReflection() {
  REFL.on = QUALITY[quality].refl > 0;
  if (REFL.on && !REFL.rt) {
    const [w, h] = reflSize();
    REFL.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    REFL.tex.value = REFL.rt.texture;
  } else if (REFL.on) REFL.rt.setSize(...reflSize());
  REFL.k.value = REFL.on ? 0.9 : 0;
  if (floor) floor.material.envMapIntensity = REFL.on ? 0.35 : 0.9;
}
function buildFloor() {
  const z0 = ROT_Z - 16, z1 = DOOR_Z + 0.5, geo = new THREE.PlaneGeometry(32, z1 - z0, 1, 1);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, (z0 + z1) / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, -p.getZ(i) / 4);
  const mat = new THREE.MeshStandardMaterial({ map: T.floor.albedo, roughnessMap: T.floor.orm, metalnessMap: T.floor.orm, normalMap: T.floor.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 1, envMapIntensity: 0.4 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRefl = REFL.tex; sh.uniforms.uReflMat = REFL.mat; sh.uniforms.uRefl = REFL.k; sh.uniforms.uReflLod = REFL.lod;
    sh.vertexShader = "uniform mat4 uReflMat; varying vec4 vReflUv;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vReflUv = uReflMat * modelMatrix * vec4(transformed, 1.0);");
    sh.fragmentShader = "uniform sampler2D tRefl; uniform float uRefl; uniform float uReflLod; varying vec4 vReflUv;\n" + sh.fragmentShader.replace("#include <opaque_fragment>", `
  if (uRefl > 0.0) {
    vec2 ruv = vReflUv.xy / max(vReflUv.w, 1e-4) + (normal.xy - nonPerturbedNormal.xy) * 0.05;
    float lod = clamp(roughnessFactor * uReflLod, 0.0, uReflLod);
    vec3 rc = min(textureLod(tRefl, ruv, lod).rgb, vec3(40.0));
    float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float fr = 0.05 + 0.95 * pow(1.0 - NoV, 5.0);
    float k = uRefl * mix(0.32, 1.0, fr) * (1.0 - roughnessFactor * 0.85);
    outgoingLight += rc * k * mix(vec3(1.0), diffuseColor.rgb * 1.5, metalnessFactor);
  }
  #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "hof-floor";
  floor = new THREE.Mesh(geo, mat); floor.receiveShadow = true; floor.matrixAutoUpdate = false; floor.updateMatrix(); world.add(floor);
  // red velvet runner with a gold border, all the way from the doors to the dais
  const rz0 = ROT_Z + DAIS[0][0] + 0.6, rz1 = DOOR_Z - 0.6, rl = rz1 - rz0;
  const rtex = canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = "#4e0913"; g.fillRect(0, 0, w, h);
    const r = rng(12); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < .5 ? "0,0,0" : "140,20,30"},${r() * 0.12})`; g.fillRect(r() * w, r() * h, 1, 2); }
    g.fillStyle = "#c79a45"; g.fillRect(12, 0, 6, h); g.fillRect(w - 18, 0, 6, h); g.fillRect(28, 0, 2, h); g.fillRect(w - 30, 0, 2, h);
    g.strokeStyle = "rgba(199,154,69,.55)"; g.lineWidth = 3;
    for (let y = 0; y < h; y += 128) { g.beginPath(); g.moveTo(w / 2, y + 20); g.lineTo(w / 2 + 50, y + 64); g.lineTo(w / 2, y + 108); g.lineTo(w / 2 - 50, y + 64); g.closePath(); g.stroke();
      g.beginPath(); g.arc(w / 2, y + 64, 10, 0, Math.PI * 2); g.stroke(); }
  });
  rtex.wrapT = THREE.RepeatWrapping; rtex.repeat.set(1, rl / 3.2);
  const rmat = new THREE.MeshPhysicalMaterial({ map: rtex, color: 0xd2c2c2, roughness: 0.95, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color(0xc0485a), sheenRoughness: 0.5, envMapIntensity: 0.4 });
  const run = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, rl), rmat); run.position.set(0, 0.015, (rz0 + rz1) / 2); run.receiveShadow = true; world.add(run);
}
function renderReflection() {
  if (!REFL.on || !REFL.rt) return;
  const rc = REFL.cam, cam = camera;
  cam.updateMatrixWorld();
  const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); if (cp.y <= 0.01) return;
  const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
  const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
  rc.position.set(cp.x, -cp.y, cp.z);
  rc.up.set(0, 1, 0).applyMatrix4(rot); rc.up.y = -rc.up.y;
  rc.lookAt(look.x, -look.y, look.z);
  rc.far = cam.far; rc.near = cam.near; rc.fov = cam.fov; rc.aspect = cam.aspect; rc.updateMatrixWorld(); rc.projectionMatrix.copy(cam.projectionMatrix);
  REFL.mat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  // oblique near plane so nothing under the floor shows up in the reflection
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(rc.matrixWorldInverse);
  const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), pm = rc.projectionMatrix, q = new THREE.Vector4();
  q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]; q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
  clip.multiplyScalar(2 / clip.dot(q));
  pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1 - 0.003; pm.elements[14] = clip.w;
  floor.visible = false; dust.visible = false;
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(REFL.rt); renderer.clear(); renderer.render(scene, rc); renderer.setRenderTarget(prevRT);
  floor.visible = true; dust.visible = true;
}

// ---------- Post processing ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: LOAD_Q.msaa }));
composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.8;
gtao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.6, thickness: 1.5, scale: 1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
{ const ss = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => ss(Math.ceil(w / 2), Math.ceil(h / 2)); }  // ambient occlusion at half resolution
gtao.overrideVisibility = function () {
  const c = this._visibilityCache;
  this.scene.traverse(o => { c.set(o, o.visible); if (o.isPoints || o.isLine || o.userData.noAO || (o.material && o.material.transparent && !o.material.alphaTest)) o.visible = false; });
};
gtao.enabled = QUALITY[quality].ao;
composer.addPass(gtao);
// scrub NaN/Inf pixels (some GPUs make them in glass or additive shaders) so bloom can't smear them into black blocks
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    bool bad = !(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b) || c.r > 6e4 || c.g > 6e4 || c.b > 6e4;
    gl_FragColor = bad ? vec4(0., 0., 0., 1.) : vec4(clamp(c.rgb, 0., 48.), 1.); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.55, 0.85); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uAberr: { value: 0.0007 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; uniform float uAberr; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec2 d = vUv - .5; float r = dot(d, d);
      vec3 col; col.r = texture2D(tDiffuse, vUv + d * uAberr * r * 8.).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv - d * uAberr * r * 8.).b;
      col *= 1. - smoothstep(.2, 1.05, r * 1.7);
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(col, col * vec3(.9, .97, 1.12), (1. - smoothstep(0., .22, l)) * .4);
      col = mix(col, col * vec3(1.06, 1., .9), smoothstep(.3, 1.6, l) * .35);
      col += (h(vUv * vec2(1917., 1093.) + uTime) - .5) * .012 * (.35 + l);
      gl_FragColor = vec4(max(col, 0.) * uFade, 1.); }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ---------- Sound (WebAudio, synthesized, through a big-hall reverb) ----------
const Sound = {
  ctx: null, master: null, wet: null, on: true,
  init() {
    if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(); this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(this.on ? 0.9 : 0, ctx.currentTime + 2);
    // reverb: 3.2 s of decaying stereo noise
    const len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 200 ? i / 200 : 1); }
    const conv = ctx.createConvolver(); conv.buffer = ir; this.wet = ctx.createGain(); this.wet.gain.value = 0.55; this.wet.connect(conv); conv.connect(this.master);
    // drone: detuned low fifths through a slow lowpass
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.7; lp.connect(this.master);
    const dg = ctx.createGain(); dg.gain.value = 0.05; dg.connect(lp);
    [55, 55.4, 82.4, 110.2, 164.8].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i < 2 ? "sawtooth" : "sine"; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = i < 2 ? 0.35 : 0.5; o.connect(g); g.connect(dg); o.start(); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.01; n.connect(bp); bp.connect(ng); ng.connect(this.master); n.start();
    // fire crackle near the braziers
    const fc = ctx.createBufferSource(); fc.buffer = buf; fc.loop = true; const fh = ctx.createBiquadFilter(); fh.type = "highpass"; fh.frequency.value = 1800;
    this.fire = ctx.createGain(); this.fire.gain.value = 0; fc.connect(fh); fh.connect(this.fire); this.fire.connect(this.master); fc.start();
    this.noise = buf;
  },
  out(node, wet = 0.5) { node.connect(this.master); if (wet > 0) { const g = this.ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(this.wet); } },
  set(on) { this.on = on; if (this.ctx) this.master.gain.linearRampToValueAtTime(on ? 0.9 : 0, this.ctx.currentTime + 0.4); },
  boom(big = false) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(big ? 120 : 95, t); o.frequency.exponentialRampToValueAtTime(big ? 32 : 42, t + (big ? 1.6 : 0.7));
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.8 : 0.36, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 2.6 : 1.1)); o.connect(g); this.out(g, 0.6); o.start(t); o.stop(t + 3);
    const n = ctx.createBufferSource(); n.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(big ? 2400 : 1400, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(big ? 0.3 : 0.14, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); n.connect(f); f.connect(ng); this.out(ng, 0.8); n.start(t); n.stop(t + 1);
    if (big) [523.25, 659.25, 783.99, 1046.5].forEach((fr, i) => { const s = ctx.createOscillator(); s.type = "triangle"; s.frequency.value = fr; const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t + 0.1 + i * 0.09); sg.gain.exponentialRampToValueAtTime(0.045, t + 0.15 + i * 0.09); sg.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); s.connect(sg); this.out(sg, 0.7); s.start(t); s.stop(t + 4); });
  },
  step(soft) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = soft ? "lowpass" : "bandpass"; f.frequency.value = soft ? 500 : 1700 + Math.random() * 500; f.Q.value = soft ? 0.7 : 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(soft ? 0.12 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.12 : 0.07)); n.connect(f); f.connect(g); this.out(g, soft ? 0.15 : 0.6); n.start(t, Math.random()); n.stop(t + 0.15);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(soft ? 70 : 110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08); const og = ctx.createGain(); og.gain.setValueAtTime(soft ? 0.12 : 0.09, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); this.out(og, 0.3); o.start(t); o.stop(t + 0.12);
  },
  land(h) { const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.35, 0.12 + h * 0.08), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); this.out(g, 0.6); o.start(t); o.stop(t + 0.3); this.step(false); },
  tick() { const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 880; const g = ctx.createGain(); g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); this.out(g, 0.4); o.start(t); o.stop(t + 0.3); },
};

// ---------- Environment light: capture the finished hall into a cube map so gold and marble reflect the real room ----------
function captureEnvironment() {
  const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.1, 140, crt); scene.add(cc);
  const saved = exhibits.map(e => [e.power, e.near]); const k = REFL.k.value; REFL.k.value = 0;
  exhibits.forEach(e => { e.power = 1; e.target = 1; }); U.flame.value = 1; updateExhibits(0, 0); ambientLights(0, 1);
  pool.forEach((l, i) => { const e = exhibits.filter(x => !x.podium)[i * 2]; if (e) { assignLight(l, e); l.userData.w = 1; l.intensity = 60; } });
  const envs = [new THREE.Vector3(0, 4.2, -30), new THREE.Vector3(0, 5, ROT_Z + 4)].map(p => {
    cc.position.copy(p); renderer.shadowMap.needsUpdate = true; cc.update(renderer, scene); return pmrem.fromCubemap(crt.texture).texture;
  });
  ENV.hall = envs[0]; ENV.rot = envs[1]; scene.environment = ENV.hall; scene.environmentIntensity = 0.7;
  scene.remove(cc); crt.dispose();
  exhibits.forEach((e, i) => { e.power = saved[i][0]; e.target = 0; e.near = saved[i][1]; }); U.flame.value = 0.15; REFL.k.value = k;
  pool.forEach(l => { l.userData.ex = null; l.userData.w = 0; l.intensity = 0; });
  updateExhibits(0, 0);
}
const ENV = { hall: null, rot: null };

// ---------- Player: walking, running, jumping, collisions ----------
const PL = { pos: new THREE.Vector3(0, 0, START_Z), vel: new THREE.Vector3(), yaw: 0, pitch: 0, ground: true, eyeOff: 0, r: 0.32, stepDist: 0, fov: 0, airT: 0, peakY: 0 };
const EYE = 1.65, WALK = 4.3, RUN = 7.4, GRAV = 26, JUMP_V = 8.1, STEP_UP = 0.42;
function groundAt(x, z, feetY) {
  let g = 0;
  for (const s of SOLIDS) {
    if (s.top > feetY + STEP_UP + 0.001 || s.top >= 90) continue;
    if (s.k === 0 ? (x > s.x0 - 0.05 && x < s.x1 + 0.05 && z > s.z0 - 0.05 && z < s.z1 + 0.05) : s.k === 1 ? (Math.hypot(x - s.x, z - s.z) < s.r + 0.05) : false) g = Math.max(g, s.top);
  }
  return g;
}
function collide(p, feetY) {
  const r = PL.r;
  for (let it = 0; it < 3; it++) {
    for (const s of SOLIDS) {
      if (s.top <= feetY + STEP_UP) continue;
      let cx, cz, rr = r;
      if (s.k === 0) {
        if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1) { // inside: leave by the shortest way
          const o = [[p.x - s.x0, -1, 0], [s.x1 - p.x, 1, 0], [p.z - s.z0, 0, -1], [s.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          p.x += o[1] * (o[0] + r); p.z += o[2] * (o[0] + r); continue;
        }
        cx = clamp(p.x, s.x0, s.x1); cz = clamp(p.z, s.z0, s.z1);
      } else if (s.k === 1) { cx = s.x; cz = s.z; rr = r + s.r; }
      else { const ax = s.bx - s.ax, az = s.bz - s.az, t = clamp(((p.x - s.ax) * ax + (p.z - s.az) * az) / (ax * ax + az * az || 1), 0, 1); cx = s.ax + ax * t; cz = s.az + az * t; rr = r + s.r; }
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4; const k = (rr - d) / d; p.x += dx * k; p.z += dz * k; }
    }
    // the rotunda's round wall (open toward the gateway)
    if (p.z < ROT_FACE) { const dx = p.x, dz = p.z - ROT_Z, d = Math.hypot(dx, dz), lim = ROT_WALK - r;
      if (d > lim && !(Math.abs(p.x) < GATE_HW - r && dz > 11)) { p.x = dx / d * lim; p.z = ROT_Z + dz / d * lim; } }
  }
  p.z = Math.min(p.z, DOOR_Z - 0.35); p.x = clamp(p.x, -13.4, 13.4);
}
const keys = {};
const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const moveKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyZ", "KeyQ"];
function inputVector() {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
  f += -joy.y; s += joy.x;
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  return [f, s];
}
function updatePlayer(dt) {
  const [f, s] = inputVector(), moving = Math.abs(f) + Math.abs(s) > 0.05;
  if (moving && (AP.active || S.tour)) stopGlide();
  const run = keys.ShiftLeft || keys.ShiftRight || joyRun();
  const sp = run ? RUN : WALK, sy = Math.sin(PL.yaw), cy = Math.cos(PL.yaw);
  const wx = (-sy * f + cy * s) * sp, wz = (-cy * f - sy * s) * sp;
  const p = PL.pos;
  if (AP.active) glideStep(dt);
  glideLook(dt);
  if (!AP.active) {
    const acc = PL.ground ? 12 : 2.5;
    PL.vel.x += (wx - PL.vel.x) * Math.min(1, acc * dt); PL.vel.z += (wz - PL.vel.z) * Math.min(1, acc * dt);
    p.x += PL.vel.x * dt; p.z += PL.vel.z * dt;
  }
  collide(p, p.y);
  // vertical
  if ((keys.Space || jumpQueued) && PL.ground && !AP.active) { PL.vel.y = JUMP_V; PL.ground = false; PL.peakY = p.y; }
  jumpQueued = false;
  PL.vel.y -= GRAV * dt; p.y += PL.vel.y * dt; PL.peakY = Math.max(PL.peakY, p.y);
  const g = groundAt(p.x, p.z, p.y);
  if (p.y <= g) {
    if (!PL.ground && PL.peakY - g > 0.5) Sound.land(PL.peakY - g);
    if (g > p.y + 0.02 && PL.ground) PL.eyeOff -= g - p.y; // smooth step-ups
    p.y = g; PL.vel.y = 0; PL.ground = true; PL.peakY = g;
  } else if (PL.ground && p.y - g < STEP_UP + 0.01 && PL.vel.y <= 0) { PL.eyeOff += p.y - g; p.y = g; PL.vel.y = 0; } // walking down a step
  else PL.ground = false;
  PL.eyeOff *= Math.exp(-dt * 12);
  // footsteps
  const hs = AP.active ? AP.v : Math.hypot(PL.vel.x, PL.vel.z);
  if (PL.ground && hs > 0.8) { PL.stepDist += hs * dt; const stride = run ? 2.0 : 1.55; if (PL.stepDist > stride) { PL.stepDist = 0; Sound.step(Math.abs(p.x) < 1.6 && p.z > ROT_Z + 6.8 && p.z < DOOR_Z - 0.6); } }
  else PL.stepDist = Math.max(0, PL.stepDist - dt);
  PL.speed = hs; PL.running = run && hs > WALK + 0.5;
}
let jumpQueued = false;
function joyRun() { return Math.hypot(joy.x, joy.y) > 0.92; }

// ---------- Glide (click a sweat, the list, N/P) and the tour ----------
const AP = { active: false, pts: [], i: 0, ex: null, v: 0, look: 1, settle: 0, remain: 0, dir: [0, -1] };
function headWorld(ex, out = new THREE.Vector3()) {
  if (ex.fig) { ex.fig.head.getWorldPosition(out); out.y += ex.podium ? 0.35 : 0.25; return out; }
  if (ex.cup) { ex.cup.getWorldPosition(out); out.y += 0.9; return out; }
  return out.copy(ex.center);
}
function glideTo(ex) {
  const p = PL.pos, t = ex.stand.clone(), pts = [];
  const inRot = p.z < ROT_FACE + 0.3, tRot = t.z < ROT_FACE + 0.3;
  if (!inRot && Math.abs(p.x) > WALL_X - 0.6) pts.push(new THREE.Vector3(Math.sign(p.x) * 6.2, 0, p.z));
  if (inRot && (Math.hypot(p.x, p.z - ROT_Z) < 9.5 || p.z < ROT_Z + 7)) {
    const a = Math.atan2(p.x || 0.01, p.z - ROT_Z), side = Math.sign(p.x || (t.x || 1));
    pts.push(new THREE.Vector3(Math.sin(a) * 10.2, 0, ROT_Z + Math.cos(a) * 10.2));
    if (!tRot || Math.abs(t.x) < 1 || Math.sign(t.x) === side) pts.push(new THREE.Vector3(side * 10.6, 0, ROT_Z + 9.8));
  }
  if (inRot && !tRot) { pts.push(new THREE.Vector3(0, 0, ROT_Z + 11.8)); pts.push(new THREE.Vector3(0, 0, NAVE_END_Z + 1.5)); }
  if (!inRot && tRot) { pts.push(new THREE.Vector3(0, 0, NAVE_END_Z + 1.5)); pts.push(new THREE.Vector3(0, 0, ROT_Z + 11.8)); }
  pts.push(t);
  Object.assign(AP, { active: true, pts, i: 0, ex, v: AP.active ? AP.v : 0, look: 1, settle: 0 });
  PL.vel.set(0, PL.vel.y, 0); document.body.classList.add("gliding");
}
function glideStep(dt) {
  const p = PL.pos, tgt = AP.pts[AP.i];
  let remain = Math.hypot(tgt.x - p.x, tgt.z - p.z); for (let k = AP.i; k < AP.pts.length - 1; k++) remain += AP.pts[k].distanceTo(AP.pts[k + 1]);
  const vmax = Math.min(S.tour ? 5 : 7, 1.2 + remain * 1.6);
  AP.v += (vmax - AP.v) * Math.min(1, dt * 3);
  const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), stepLen = AP.v * dt;
  if (d <= Math.max(stepLen, 0.04)) { p.x = tgt.x; p.z = tgt.z; if (++AP.i >= AP.pts.length) { AP.active = false; AP.v = 0; AP.arrived = Math.max(simTime, 1e-3); AP.settle = 1.4; document.body.classList.remove("gliding"); } }
  else { p.x += dx / d * stepLen; p.z += dz / d * stepLen; }
  AP.remain = remain; AP.dir = [dx, dz];
}
// look where we're going, then at the sweat as we arrive (and for a moment after)
function glideLook(dt) {
  if (!AP.look || !AP.ex || (!AP.active && !(AP.settle > 0))) return;
  if (!AP.active) AP.settle -= dt;
  const p = PL.pos, h = headWorld(AP.ex, new THREE.Vector3()), eye = new THREE.Vector3(p.x, p.y + EYE, p.z);
  let ty, tp;
  if (!AP.active || AP.remain < 7) { ty = Math.atan2(-(h.x - eye.x), -(h.z - eye.z)); tp = Math.atan2(h.y - eye.y, Math.hypot(h.x - eye.x, h.z - eye.z)) - (innerWidth < 720 ? 0.12 : 0); }
  else { ty = Math.atan2(-AP.dir[0], -AP.dir[1]); tp = 0.02; }
  PL.yaw += wrapAngle(ty - PL.yaw) * Math.min(1, dt * 3.2); PL.pitch += (tp - PL.pitch) * Math.min(1, dt * 3.2);
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function stopGlide() { AP.active = false; AP.v = 0; AP.settle = 0; document.body.classList.remove("gliding"); stopTour(); }
const STOPS = [];
const S = { mode: "gate", introT: 0, ignited: 0, tour: false, tourI: 0, attn: null };
function startTour() {
  S.tour = true; const near = STOPS.reduce((b, ex, i) => { const d = ex.stand.distanceTo(PL.pos); return d < b[0] ? [d, i] : b; }, [1e9, 0])[1];
  S.tourI = near; glideTo(STOPS[S.tourI]); AP.arrived = 0; $("#tourBtn").setAttribute("aria-pressed", "true");
}
function stopTour() { if (!S.tour) return; S.tour = false; $("#tourBtn").setAttribute("aria-pressed", "false"); }
function tourStep() {
  if (!S.tour || AP.active) return;
  const ex = STOPS[S.tourI]; if (!AP.arrived) return;
  // dwell on the sim clock, so a paused or throttled tab doesn't skip stops
  if (simTime - AP.arrived > (ex.podium ? 6.5 : 4.8)) { S.tourI++; if (S.tourI >= STOPS.length) { stopTour(); return; } const t = S.tour; glideTo(STOPS[S.tourI]); S.tour = t; AP.arrived = 0; }
}
function jump(dir) {
  const cur = S.attn && STOPS.includes(S.attn) ? STOPS.indexOf(S.attn) : STOPS.reduce((b, ex, i) => { const d = ex.stand.distanceTo(PL.pos); return d < b[0] ? [d, i] : b; }, [1e9, -1])[1];
  const next = clamp(cur + dir, 0, STOPS.length - 1); stopTour(); glideTo(STOPS[next]); Sound.tick();
}

// ---------- UI: rail, card, pause, crosshair ----------
const rail = $("#rail");
function buildRail() {
  STOPS.forEach((ex, i) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.i = i; if (ex.flag) b.classList.add("flag");
    b.innerHTML = `<span class="nm">${esc(ex.d.name)}</span><span class="rk">${ex.d.rank}</span><span class="tick"></span>`;
    b.setAttribute("aria-label", `Number ${ex.d.rank}, ${ex.d.name}: walk there`);
    b.addEventListener("click", () => { stopTour(); glideTo(ex); Sound.tick(); });
    rail.appendChild(b);
  });
}
const card = $("#card"); let cardEx = null, cardHideT = 0;
function cardHtml(ex) {
  if (!ex.d) {
    return `<div class="c-top"><span class="c-rank">THE HALL</span></div><div class="c-name">Prism Hall of Fame</div>
      <div class="c-index"><b>${fmtNum(META.total)}</b><span>sweats beaten so far</span></div>
      <div class="c-meta">Every player in our sweat log, ranked by <b>index = FKDR² × stars</b> from their lifetime stats when we logged them. Cheaters count too, marked in red. The top 20 stand in this hall. The top three wait under the prism at the end.</div>
      <div class="c-meta">Built from <b>${fmtNum(META.records)}</b> logged games, live data from ${esc(META.generated)}.</div>`;
  }
  const d = ex.d;
  const chips = d.beaten.map(n => `<span class="chip" style="color:var(${ROSTER_VAR[n] || "--ivory"})">${esc(n)}</span>`).join("");
  const notes = (d.notes || []).map(n => `<div class="c-note">“${esc(n.text)}”<small>${esc(n.by || "someone")} · ${esc(fmtDate(n.at))}</small></div>`).join("");
  const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<div class="c-top"><span class="c-rank">Nº ${d.rank} OF ${fmtNum(META.total)}</span>${d.cheating ? `<span class="c-flag">CHEATER</span>` : `<span class="c-tier">${esc(tierOf(d.index))}</span>`}</div>
    <div class="c-name">${esc(d.name)}</div><div class="c-tag">${prestigeHtml(d.star)}</div>
    <div class="c-index"><b>${fmtIdx(d.index)}</b><span>index · FKDR² × stars</span></div>
    <dl class="c-grid">${stat("FKDR", fmtRatio(d.fkdr))}${stat("WLR", fmtRatio(d.wlr))}${stat("BBLR", fmtRatio(d.bblr))}${stat("KDR", fmtRatio(d.kdr))}${stat("Finals", fmtNum(d.finals))}${stat("Beds", fmtNum(d.beds))}${stat("Kills", fmtNum(d.kills))}${stat("Met", d.times + "×")}</dl>
    <div class="c-sec">Beaten by</div><div class="chips">${chips || '<span class="c-meta">nobody tagged</span>'}</div>
    <div class="c-meta">First logged <b>${esc(fmtDate(d.first))}</b>${d.times > 1 ? `, last <b>${esc(fmtDate(d.last))}</b>` : ""}${d.addedBy ? ` · added by <b>${esc(d.addedBy)}</b>` : ""}${d.boosting ? " · <b>boosting</b>" : ""}</div>
    ${notes ? `<div class="c-sec">Notes</div>${notes}` : ""}`;
}
function showCard(ex, side) {
  if (ex === cardEx && card.classList.contains("show")) { card.classList.toggle("l", side === "l"); card.classList.toggle("r", side === "r"); return; }
  cardEx = ex; card.classList.remove("show"); clearTimeout(cardHideT);
  cardHideT = setTimeout(() => { card.innerHTML = cardHtml(ex); card.classList.toggle("ded", !ex.d); card.classList.remove("l", "r"); card.classList.add(side); requestAnimationFrame(() => card.classList.add("show")); }, card.innerHTML ? 240 : 0);
}
function hideCard() { if (!cardEx) return; cardEx = null; clearTimeout(cardHideT); card.classList.remove("show"); }
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3200); }

// ---------- Input ----------
const isLocked = () => document.pointerLockElement === canvas;
function lock() {
  if (TOUCH || isLocked() || S.mode === "gate") return;
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch (e) {} }); } catch (e) { try { canvas.requestPointerLock(); } catch (e2) {} }
}
document.addEventListener("pointerlockerror", () => { if (S.mode === "free") toast("Click the hall again to look around with the mouse"); });
document.addEventListener("pointerlockchange", () => { document.body.classList.toggle("locked", isLocked()); updatePaused(); if (!isLocked()) Object.keys(keys).forEach(k => keys[k] = false); });
function updatePaused() { document.body.classList.toggle("paused", S.mode === "free" && !TOUCH && !isLocked()); }
const SENS = 0.0022;
function look(dx, dy, k = SENS) { if ((AP.active || AP.settle > 0) && Math.hypot(dx, dy) > 2) { AP.look = 0; AP.settle = 0; } PL.yaw -= dx * k; PL.pitch = clamp(PL.pitch - dy * k, -1.45, 1.45); }
document.addEventListener("mousemove", (e) => { if (isLocked() && S.mode === "free") look(e.movementX, e.movementY); });
addEventListener("keydown", (e) => {
  if (S.mode === "intro" && ["Escape", "Space", "Enter"].includes(e.code)) { skipIntro(); return; }
  if (S.mode !== "free") return;
  if (e.target && e.target.closest && e.target.closest("a, input, textarea")) return;
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "Space") jumpQueued = true;
  if (e.repeat) return;
  if (e.code === "KeyT") { S.tour ? stopGlide() : startTour(); }
  if (e.code === "KeyN" || e.code === "BracketRight" || e.code === "PageDown") jump(1);
  if (e.code === "KeyP" || e.code === "BracketLeft" || e.code === "PageUp") jump(-1);
  if (e.code === "KeyR") { stopGlide(); goStart(); }
  if (e.code === "KeyM") $("#soundBtn").click();
  if (e.code === "KeyF") { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().then(() => lock()).catch(() => {}); }
  if (e.code === "Enter" && !isLocked()) lock();
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => Object.keys(keys).forEach(k => keys[k] = false));
function raycastAt(nx, ny) {
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx, ny), camera); ray.far = 40;
  const h = ray.intersectObjects(hitTargets, false)[0]; return h ? h.object.userData.ex : null;
}
// mouse: click to walk (pointer lock); without lock, drag to look and click a sweat to walk to it
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (S.mode !== "free") return;
  if (e.pointerType === "touch") return touchDown(e);
  if (isLocked()) { if (e.button === 0) { const ex = raycastAt(0, 0); if (ex) { stopTour(); glideTo(ex); Sound.tick(); } } return; }
  drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch { }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return touchMove(e);
  if (drag && !isLocked()) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { look(e.movementX || 0, e.movementY || 0, 0.004); } }
  if (!isLocked() && S.mode === "free") canvas.style.cursor = raycastAt((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1) ? "pointer" : (drag && drag.moved ? "grabbing" : "grab");
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "touch") return touchUp(e);
  if (!drag) return; const d = drag; drag = null;
  if (!d.moved && S.mode === "free") { const ex = raycastAt((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); if (ex) { stopTour(); glideTo(ex); Sound.tick(); } lock(); }
});
$("#pause").addEventListener("click", () => lock());
// touch: left thumb joystick, drag elsewhere to look, tap a sweat to walk to it
const touchLook = { id: null, x: 0, y: 0, t: 0, moved: false };
const joyEl = $("#joy"), knob = $("#joy i");
function touchDown(e) {
  if (e.clientX < innerWidth * 0.45 && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; joyEl.classList.add("on"); knob.style.transform = ""; }
  else if (touchLook.id === null) Object.assign(touchLook, { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  try { canvas.setPointerCapture(e.pointerId); } catch { }
}
function touchMove(e) {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), m = 56; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`; }
  else if (e.pointerId === touchLook.id) { const dx = e.clientX - touchLook.x, dy = e.clientY - touchLook.y; if (Math.hypot(dx, dy) > 8) touchLook.moved = true; look(dx, dy, 0.0055); touchLook.x = e.clientX; touchLook.y = e.clientY; }
}
function joyEnd() { joy.id = null; joy.x = joy.y = 0; joyEl.classList.remove("on"); joyEl.style.left = joyEl.style.top = ""; knob.style.transform = ""; } // back to its resting spot
function touchUp(e) {
  if (e.pointerId === joy.id) joyEnd();
  else if (e.pointerId === touchLook.id) { if (!touchLook.moved && performance.now() - touchLook.t < 350) { const ex = raycastAt((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); if (ex) { stopTour(); glideTo(ex); Sound.tick(); } } touchLook.id = null; }
}
canvas.addEventListener("pointercancel", (e) => { if (e.pointerId === joy.id) joyEnd(); if (e.pointerId === touchLook.id) touchLook.id = null; drag = null; });
$("#jumpBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); jumpQueued = true; });
$("#tourBtn").addEventListener("click", () => { S.tour ? stopGlide() : startTour(); });
$("#soundBtn").addEventListener("click", (e) => { const b = $("#soundBtn"); const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); Sound.set(on); });
$("#restartBtn").addEventListener("click", () => { stopGlide(); goStart(); });
$("#qualityBtn").addEventListener("click", () => { const i = (QORDER.indexOf(quality) + 1) % QORDER.length; setQuality(QORDER[i], true); toast(`Quality: ${QUALITY[quality].label}`); });
function goStart() { PL.pos.set(0, 0, START_Z); PL.vel.set(0, 0, 0); PL.yaw = 0; PL.pitch = 0; }

// ---------- Quality changes ----------
function setQuality(q, byUser) {
  quality = q; if (byUser) { store.set("hof.quality", q); qUser = true; }
  DPR = dprFor(q); renderer.setPixelRatio(DPR); composer.setPixelRatio(DPR);
  gtao.enabled = QUALITY[q].ao; applyShadows(); setupReflection(); onResize();
  $("#qualityBtn").textContent = QUALITY[q].label;
}
let qUser = qUserSet;
const perf = { t: 0, n: 0, cool: 0 };
function watchPerf(dt) {
  if (SHOT || qUser || S.mode !== "free" || document.hidden) return;
  perf.cool -= dt; perf.t += dt; perf.n++;
  if (perf.t >= 3) { const fps = perf.n / perf.t; perf.t = 0; perf.n = 0;
    if (fps < 34 && perf.cool <= 0 && quality !== "low") { setQuality(QORDER[QORDER.indexOf(quality) - 1], false); perf.cool = 6; toast(`Switched to ${QUALITY[quality].label} quality to keep things smooth`); } }
}

// ---------- Intro ----------
const INTRO = 7.2;
const gate = $("#gate"), enter = $("#enter");
enter.addEventListener("click", () => { Sound.init(); begin(); });
function begin() {
  gate.classList.add("gone"); S.mode = "intro"; S.introT = 0; S.ignited = 0;
  if (!TOUCH && !SHOT) { try { canvas.requestPointerLock(); } catch (e) {} }
  if (REDUCED) { skipIntro(); return; }
  setTimeout(() => { if (S.mode === "intro") $("#introTitle").classList.add("on"); }, 700);
  setTimeout(() => $("#introTitle").classList.remove("on"), 4600);
}
function skipIntro() { S.introT = INTRO; exhibits.forEach(ex => ex.target = 1); U.flame.value = 1; $("#introTitle").classList.remove("on"); finishIntro(); }
function finishIntro() {
  if (S.mode === "free") return; S.mode = "free"; document.body.classList.add("free");
  goStart(); canvas.focus({ preventScroll: true }); updatePaused();
}

// ---------- Per-frame updates ----------
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3(), fwd = new THREE.Vector3();
function updateExhibits(dt, time) {
  for (const ex of exhibits) {
    ex.power += (ex.target - ex.power) * Math.min(1, dt * (ex.podium ? 1.2 : 2.6));
    const p = ex.power; ex.near += ((ex === S.attn ? 1 : 0) - ex.near) * Math.min(1, dt * 3);
    ex.cone.material.uniforms.uPower.value = p * (ex.podium ? 0.38 : 0.5 - ex.near * 0.18);
    if (ex.pool) ex.pool.material.opacity = p * (0.2 + ex.near * 0.16);
    if (ex.lens) ex.lens.material.color.copy(ex.lens.userData.base).multiplyScalar(0.05 + p * 2.6);
    ex.plaque.material.emissiveIntensity = p * (ex.podium ? 0.06 + ex.near * 0.05 : 0.1 + ex.near * 0.16);
    ex.banner.material.emissiveIntensity = p * (ex.podium ? 0.3 : 0.05 + ex.near * 0.06);
    ex.trim.material.color.setRGB(1, ex.flag ? 0.23 : 0.77, ex.flag ? 0.3 : 0.42).multiplyScalar(0.08 + p * (1.3 + ex.near * 0.8));
    if (ex.cup) ex.cup.rotation.y = time * 0.25;
    const f = ex.fig; if (!f) continue;
    f.mats.forEach(m => m.emissiveIntensity = p * (0.04 + (1 - ex.lightW) * 0.3));
    const ph = time + f.phase;
    f.body.position.y = Math.sin(ph * 1.6) * 0.18; f.body.scale.y = 1 + Math.sin(ph * 1.6) * 0.004;
    f.lArm.rotation.z = 0.06 + Math.sin(ph * 1.6) * 0.03; f.lArm.rotation.x = Math.sin(ph * 0.8) * 0.05;
    const raise = ex.near; f.rArm.rotation.x = lerp(-0.38 + Math.sin(ph * 0.8) * 0.04, -1.75, ease(raise)); f.rArm.rotation.z = -0.06 - raise * 0.1; f.grip.rotation.x = lerp(0.15, 0.95, ease(raise));
    f.head.getWorldPosition(tmpV); const dist = tmpV.distanceTo(camera.position);
    let hy = 0, hx = 0;
    if (dist < (ex.podium ? 30 : 16) && p > 0.5) { tmpL.copy(camera.position); f.root.worldToLocal(tmpL); tmpL.sub(f.head.position); hy = clamp(Math.atan2(tmpL.x, tmpL.z), -0.9, 0.9); hx = clamp(-Math.atan2(tmpL.y, Math.hypot(tmpL.x, tmpL.z)), -0.5, 0.4); }
    f.head.rotation.y += (hy - f.head.rotation.y) * Math.min(1, dt * 3); f.head.rotation.x += (hx - f.head.rotation.x) * Math.min(1, dt * 3);
    f.sword.children.forEach(m => m.material.emissiveIntensity = (m.material.color.getHex() === SWORD_COL.L ? 0.35 : 0.15) + raise * 0.9);
  }
  const rp = exhibits.filter(e => e.podium).reduce((a, e) => Math.max(a, e.power), 0);
  rotLight.intensity = rp * 320; rotFill.intensity = rp * 24; rollPlane.material.emissiveIntensity = rp * 0.16;
  specRing.material.uniforms.uPower.value = rp * 0.5; beamIn.material.uniforms.uPower.value = rp * 0.9;
  prism.rotation.y = Math.sin(time * 0.3) * 0.6; prism.position.y = 10.6 + Math.sin(time * 0.7) * 0.15;
  prismBeams.forEach(piv => { const { a } = piv.userData, aa = a + time * 0.25; piv.rotation.set(Math.cos(aa) * 0.62, 0, Math.sin(aa) * 0.62); piv.position.y = prism.position.y; piv.children[0].material.uniforms.uPower.value = rp * 1.05; });
}
function assignLight(l, e) { const u = l.userData; u.ex = e; u.w = 0; l.position.copy(e.lightPos); l.target.position.copy(e.lightTarget); l.target.updateMatrixWorld(); l.color.set(e.flag ? 0xff8592 : 0xffe0b0); l.angle = e.podium ? 0.24 : 0.5; l.distance = e.podium ? 24 : 15; }
function updateLights(dt) {
  const cp = camera.position; camera.getWorldDirection(fwd);
  const want = exhibits.filter(e => e.power > 0.02).map(e => { const dx = e.center.x - cp.x, dz = e.center.z - cp.z, d = Math.hypot(dx, dz) || 1; return [e, d - ((dx * fwd.x + dz * fwd.z) / d) * 5]; })
    .sort((a, b) => a[1] - b[1]).slice(0, pool.length).map(a => a[0]);
  pool.forEach(l => { const u = l.userData; const ok = u.ex && want.includes(u.ex); u.w = ok ? Math.min(1, u.w + dt * 3) : Math.max(0, u.w - dt * 4); if (!ok && u.w <= 0) u.ex = null; });
  const nShadow = QUALITY[quality].shadows;
  want.forEach((e, rank) => {
    if (pool.some(l => l.userData.ex === e)) return; const free = pool.filter(l => !l.userData.ex); if (!free.length) return;
    assignLight(rank < nShadow ? (free.find(l => l.castShadow) || free[0]) : (free.find(l => !l.castShadow) || free[0]), e);
  });
  exhibits.forEach(e => e.lightW = 0);
  pool.forEach(l => { const u = l.userData; if (!u.ex) { l.intensity = 0; return; } l.intensity = u.ex.power * u.w * (u.ex.podium ? 150 : 75) * (1 + u.ex.near * 0.25); u.ex.lightW = Math.max(u.ex.lightW, u.w); });
}
function ambientLights(time, fl) {
  brazierLights.forEach((l, i) => l.intensity = fl * (22 + Math.sin(time * 11 + i * 3) * 2.5 + Math.sin(time * 23.7 + i) * 1.8));
  // the chandelier light follows the nearest chandelier
  const cz = camera.position.z, near = CHANDELIER_ZS.reduce((b, z) => Math.abs(z - cz) < Math.abs(b - cz) ? z : b, CHANDELIER_ZS[0]), u = chandLight.userData;
  if (near !== u.z) { u.w -= 0.08; if (u.w <= 0) { u.z = near; chandLight.position.z = near; } } else u.w = Math.min(1, u.w + 0.05);
  chandLight.intensity = fl * Math.max(0, u.w) * (cz > ROT_FACE ? 34 : 0) * (0.96 + Math.sin(time * 9) * 0.04);
  moonBeams.forEach(b => { b.m.material.uniforms.uPower.value = 0.3 * (0.35 + fl * 0.65); b.pool.material.opacity = 0.14 * (0.35 + fl * 0.65); });
}

// ---------- Frame loop ----------
const clock = new THREE.Clock();
let simTime = 0;
function frame() { tick(Math.min(clock.getDelta(), 0.05), true); requestAnimationFrame(frame); }
function tick(dt, draw) {
  simTime += dt; const time = simTime; U.time.value = time;
  if (S.mode === "gate") {
    camera.position.set(Math.sin(time * 0.1) * 0.5, 6.2, DOOR_Z - 1.6); camera.rotation.set(-0.12, Math.sin(time * 0.08) * 0.04, 0);
    grade.uniforms.uFade.value = Math.min(1, grade.uniforms.uFade.value + dt * 0.5);
    exhibits.forEach(ex => ex.target = ex.podium ? 0.35 : 0);
  } else if (S.mode === "intro") {
    S.introT += dt; const t = S.introT, k = ease(Math.min(1, t / INTRO));
    camera.position.set(0, lerp(6.2, EYE, k), lerp(DOOR_Z - 1.6, START_Z, k)); camera.rotation.set(lerp(-0.12, 0, k), 0, 0);
    U.flame.value = lerp(0.15, 1, clamp((t - 0.2) / 2.4, 0, 1));
    const pairT = (i) => 0.9 + i * 0.36;
    while (S.ignited <= BAYS && t > (S.ignited < BAYS ? pairT(S.ignited) : pairT(BAYS) + 0.5)) {
      const i = S.ignited; S.ignited++;
      if (i < BAYS) { exhibits.filter(ex => !ex.podium && ex.slot.pair === i).forEach(ex => ex.target = 1); Sound.boom(false); }
      else { exhibits.filter(ex => ex.podium).forEach(ex => ex.target = 1); Sound.boom(true); }
    }
    if (t >= INTRO) finishIntro();
  } else {
    updatePlayer(dt); tourStep();
    const run = PL.running ? 1 : 0; PL.fov += (run * 6 - PL.fov) * Math.min(1, dt * 4);
    const bobA = REDUCED ? 0 : Math.min(1, PL.speed / WALK) * (PL.ground ? 1 : 0);
    PL.bobT = (PL.bobT || 0) + dt * (PL.running ? 12 : 9) * bobA;
    camera.position.set(PL.pos.x, PL.pos.y + EYE + PL.eyeOff + Math.abs(Math.sin(PL.bobT)) * 0.05 * bobA, PL.pos.z);
    camera.rotation.set(PL.pitch, PL.yaw, Math.sin(PL.bobT) * 0.004 * bobA);
    const baseFov = innerWidth / innerHeight < 1 ? 76 : 64;
    if (Math.abs(camera.fov - (baseFov + PL.fov)) > 0.01) { camera.fov = baseFov + PL.fov; camera.updateProjectionMatrix(); }
    scene.environment = camera.position.z < ROT_FACE ? ENV.rot : ENV.hall;
    if (Sound.fire) Sound.fire.gain.value = 0.05 * clamp(1 - (DOOR_Z - 2.6 - camera.position.z) / 14, 0, 1);
  }
  // what are we looking at
  if (S.mode === "free") {
    camera.getWorldDirection(fwd); let best = null, bestA = 0.42;
    for (const ex of exhibits) {
      headWorld(ex, tmpV); tmpV.sub(camera.position); const d = tmpV.length(); if (d > (ex.podium ? 26 : 13.5)) continue;
      const a = fwd.angleTo(tmpV.normalize()), a2 = AP.ex === ex ? a * 0.5 : a;
      if (a2 < bestA) { bestA = a2; best = ex; }
    }
    S.attn = best;
    if (best) { headWorld(best, tmpV).project(camera); showCard(best, tmpV.x < 0 ? "r" : "l"); } else hideCard();
    const ci = best && best.d ? STOPS.indexOf(best) : -1;
    rail.querySelectorAll("button").forEach((b, i) => b.classList.toggle("cur", i === ci));
    $("#progress i").style.width = clamp((START_Z - PL.pos.z) / (START_Z - (ROT_Z + 10)) * 100, 0, 100).toFixed(1) + "%";
  } else S.attn = null;
  updateExhibits(dt, time); updateLights(dt); ambientLights(time, U.flame.value);
  grade.uniforms.uTime.value = time % 10;
  if (S.mode !== "gate") grade.uniforms.uFade.value = Math.min(1, grade.uniforms.uFade.value + dt);
  if (draw) { renderer.shadowMap.needsUpdate = true; renderReflection(); composer.render(dt); }
  watchPerf(dt);
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth, innerHeight);
  if (REFL.rt) REFL.rt.setSize(...reflSize());
  [dust, embers].forEach(o => { if (o) o.material.uniforms.uScale.value = innerHeight * DPR; });
}
addEventListener("resize", onResize);

// ---------- Boot ----------
async function buildHall() {
  enter.textContent = "Building the hall…";
  await new Promise(r => setTimeout(r, 30));
  bakeAll(); makeMaterials();
  M.ember = new THREE.MeshBasicMaterial({ map: radialTex([[0, "#fff2c0"], [0.35, "#ff8a2a"], [0.8, "#7a1a04"], [1, "#2a0a02"]], 256), color: new THREE.Color(1.6, 1.0, 0.7), toneMapped: false });
  GLOW_TEX = radialTex([[0, "rgba(255,240,215,1)"], [0.35, "rgba(255,215,160,.35)"], [1, "rgba(255,200,140,0)"]]);
  buildNave(); buildRotunda();
  const niches = new Map(slots.map(sl => [sl, buildNiche(sl)]));
  CHANDELIER_ZS.forEach(chandelier); BRAZIERS.forEach(brazier); OCULUS_ZS.forEach(moonBeam);
  try { await Promise.all(["700 50px Cinzel", "900 50px Cinzel", "700 50px 'Barlow Condensed'", "600 50px 'Barlow Condensed'"].map(f => document.fonts.load(f))); } catch (e) {}
  const skins = await Promise.all(DATA.map(d => loadSkin(d.skin).catch(() => null)));
  const skinOf = new Map(DATA.map((d, i) => [d.rank, skins[i]]));
  slots.forEach(sl => { if (sl.ded || byRank.get(sl.rank)) buildNicheExhibit(sl, niches.get(sl), skinOf.get(sl.rank)); });
  buildPodium(skinOf);
  const top = inscription([["HALL OF FAME", 230, 268, "#e2b866"]], 8.6, 1.55, 2048, 370); top.position.set(0, 10.5, DOOR_Z - 0.06); top.rotation.y = Math.PI; world.add(top);
  const gateIns = inscription([["THE GREATEST SWEATS WE'VE BEATEN", 132, 0, "#e2b866"]], 10.4, 1.5, 2560, 370); gateIns.position.set(0, 14.4, NAVE_END_Z + 0.06); world.add(gateIns);
  // Prism banners in the entrance hall
  [-1, 1].forEach(s => { const b = banner(reliefPanel(512, 1164, drawBanner(null), 2), 2.0, 4.55, s * 3); b.position.set(s * (WALL_X - 0.12), 4.35, 4.9); b.rotation.y = -s * Math.PI / 2; b.material.emissiveIntensity = 0.1; world.add(b);
    add("gold", new THREE.CylinderGeometry(0.03, 0.03, 2.4, 10), mtx(s * (WALL_X - 0.12), 6.7, 4.9, Math.PI / 2)); });
  flushStatic(); buildFloor(); buildFlames(); buildEmbers(BRAZIERS.map(p => new THREE.Vector3(p.x, 1.55, p.z))); buildDust();
  camera.layers.enable(2);
  setupReflection();
  captureEnvironment();
}
$("#brandSub").textContent = `Top 20 of ${fmtNum(META.total)} sweats · ranked by FKDR² × stars`;
$("#qualityBtn").textContent = QUALITY[quality].label;
if (TOUCH) document.body.classList.add("touch");
renderer.shadowMap.autoUpdate = false;
buildHall().then(() => {
  const hallEx = exhibits.filter(e => !e.podium && e.d).sort((a, b) => b.z - a.z || (a.slot.side - b.slot.side));
  const pod = [3, 2, 1].map(r => exhibits.find(e => e.podium && e.rank === r)).filter(Boolean);
  STOPS.push(...hallEx, ...pod);
  buildRail();
  enter.disabled = false; enter.textContent = "Enter the hall";
  window.__hof = { S, PL, AP, exhibits, STOPS, glideTo, skipIntro, begin, camera, setQuality, renderer,
    tp(x, z, yaw = 0, pitch = 0, y = 0) { PL.pos.set(x, y, z); PL.vel.set(0, 0, 0); PL.yaw = yaw; PL.pitch = pitch; AP.active = false; } };
  if (SHOT) { window.__hof.step = (sec, fps = 20) => { const n = Math.max(1, Math.round(sec * fps)); for (let i = 0; i < n; i++) tick(1 / fps, i === n - 1); }; window.__hof.step(0.05); }
  else requestAnimationFrame(frame);
}).catch(err => { console.error(err); $("#fail").style.display = "grid"; });
