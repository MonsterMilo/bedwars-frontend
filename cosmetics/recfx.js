// Recorded final kill effects.
//
// Each effect in cosmetics/fx/<id>.json is the packet stream Hypixel sent while
// its lobby preview played (recorded with the proxy's full capture), trimmed
// to the preview and moved so the victim stands at 0,0,0. This file replays
// that stream the way the 1.8.9 client does: packets are handled at the start
// of each 50 ms tick, entities interpolate and animate with the client's own
// rules, and particles spawn and move with the constants of 1.8's EntityFX
// classes (read from the game files). Nothing about an effect is made up here:
// what is not in the recording is the client's own behaviour.
import * as THREE from "three";

const MC = "cosmetics/mc/";
const D2R = Math.PI / 180;
const TICK = 50;

/* ------------------------------------------------------------ small helpers */
const rand = Math.random;
let gauss2 = null;
function gauss() { // java.util.Random.nextGaussian
  if (gauss2 !== null) { const g = gauss2; gauss2 = null; return g; }
  let v1, v2, s;
  do { v1 = 2 * rand() - 1; v2 = 2 * rand() - 1; s = v1 * v1 + v2 * v2; } while (s >= 1 || s === 0);
  const m = Math.sqrt(-2 * Math.log(s) / s); gauss2 = v2 * m; return v1 * m;
}
const randInt = (n) => Math.floor(rand() * n);
const wrap = (a) => { a %= 360; if (a >= 180) a -= 360; if (a < -180) a += 360; return a; };
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => a + wrap(b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const B2D = 360 / 256; // packet angle bytes to degrees

const TL = new THREE.TextureLoader();
const texCache = {};
function tex(name) {
  if (!texCache[name]) {
    const t = new THREE.Texture();
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    img(name).then((i) => { t.image = i; t.needsUpdate = true; }).catch(() => {});
    texCache[name] = t;
  }
  return texCache[name];
}
const imgCache = {};
function img(name) {
  if (!imgCache[name]) imgCache[name] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = name.includes("/") ? name : MC + name + ".png"; });
  return imgCache[name];
}
const ALL_TEX = ["particles", "explosion", "ascii", "entity_chicken", "entity_wolf", "entity_bat", "entity_squid", "entity_skeleton", "entity_steve", "entity_experience_orb", "armor_leather_layer_1", "armor_leather_layer_1_overlay",
  "rabbit_brown", "rabbit_white", "rabbit_black", "rabbit_white_splotched", "rabbit_gold", "rabbit_salt", "cosmetics/skins/killer.png", "cosmetics/skins/dummy.png",
  "item_iron_sword", "item_stick", "item_bone", "item_cookie", "item_gold_ingot", "item_beef_raw", "item_beef_cooked", "item_leather", "item_egg", "item_fireworks", "item_leather_chestplate",
  "block_gold_block", "block_pumpkin_side", "block_pumpkin_top", "block_pumpkin_face_off", "block_pumpkin_face_on", "block_torch_on", "block_anvil_base", "block_anvil_top_damaged_0", "block_redstone_block", "block_tnt_side", "block_tnt_top", "block_tnt_bottom", "block_dirt", "block_gravel"];
const matCache = {};
// Entity materials: lit like the rest of the studio. `hurt` tints them the way
// the game's hurt overlay does (30% red over the lit texture).
function emat(name, opts = {}) {
  const k = name + JSON.stringify(opts);
  if (!matCache[k]) {
    const m = new THREE.MeshLambertMaterial({ map: tex(name), alphaTest: 0.1, side: THREE.DoubleSide, ...opts });
    matCache[k] = m;
  }
  return matCache[k];
}

/* ------------------------------------------------------------ box models
   ModelRenderer boxes in pixels, y down, face toward -z (the game's model
   space); placed here as (x, -y, -z), which is the game's own turn of the
   model into the world (its scale(-1,-1,1) and 180 degree yaw). */
function makeModelKit(setBoxUV) {
  function cube(parent, mat, tw, th, u, v, [x, y, z, w, h, d], mirror = false, inf = 0) {
    const g = new THREE.BoxGeometry((w + 2 * inf) / 16 || 0.0001, (h + 2 * inf) / 16 || 0.0001, (d + 2 * inf) / 16 || 0.0001);
    setBoxUV(g, u, v, w, h, d, th, tw, mirror);
    g.translate((x + w / 2) / 16, -(y + h / 2) / 16, -(z + d / 2) / 16);
    const m = new THREE.Mesh(g, mat); parent.add(m); return m;
  }
  function piece(parent, rp = [0, 0, 0]) {
    const g = new THREE.Group(); g.rotation.order = "ZYX"; setRP(g, rp); if (parent) parent.add(g); return g;
  }
  function setRP(g, [x, y, z]) { g.position.set(x / 16, -y / 16, -z / 16); }
  function rot(g, x = 0, y = 0, z = 0) { g.rotation.set(x, -y, -z); }
  return { cube, piece, setRP, rot };
}

/* ------------------------------------------------------------ the font
   ascii.png with the widths FontRenderer measures from it, colour codes and
   bold, drawn into a canvas the size of the game's name tag. */
const FC = { 0: "#000000", 1: "#0000AA", 2: "#00AA00", 3: "#00AAAA", 4: "#AA0000", 5: "#AA00AA", 6: "#FFAA00", 7: "#AAAAAA", 8: "#555555", 9: "#5555FF", a: "#55FF55", b: "#55FFFF", c: "#FF5555", d: "#FF55FF", e: "#FFFF55", f: "#FFFFFF" };
let font = null;
async function loadFont() {
  if (font) return font;
  const im = await img("ascii");
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, 128, 128).data, widths = [];
  for (let i = 0; i < 256; i++) {
    const cx = (i % 16) * 8, cy = Math.floor(i / 16) * 8; let l = 7;
    for (; l >= 0; l--) { let empty = true; for (let y = 0; y < 8; y++) if (px[((cy + y) * 128 + cx + l) * 4 + 3] > 0) { empty = false; break; } if (!empty) break; }
    widths[i] = i === 32 ? 4 : l + 2;
  }
  const tinted = {};
  const tint = (col) => tinted[col] || (tinted[col] = (() => { const t = document.createElement("canvas"); t.width = 128; t.height = 128; const tg = t.getContext("2d"); tg.drawImage(im, 0, 0); tg.globalCompositeOperation = "source-in"; tg.fillStyle = col; tg.fillRect(0, 0, 128, 128); return t; })());
  const CHARS = "ÀÁÂÈÊËÍÓÔÕÚßãõğİıŒœŞşŴŵžȇ\u0000\u0000\u0000\u0000\u0000\u0000\u0000 !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u0000";
  const idx = (ch) => { const i = CHARS.indexOf(ch); return i < 0 ? 63 : i; };
  function runs(s) { // [{ch, color, bold}]
    const out = []; let color = "#FFFFFF", bold = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "§" && i + 1 < s.length) { const k = s[++i].toLowerCase(); if (FC[k]) { color = FC[k]; bold = false; } else if (k === "l") bold = true; else if (k === "r") { color = "#FFFFFF"; bold = false; } continue; }
      out.push({ ch: s[i], color, bold });
    }
    return out;
  }
  const width = (s) => runs(s).reduce((w, r) => w + widths[idx(r.ch)] + (r.bold ? 1 : 0), 0);
  function draw(g2, s, x0, y0, S, alpha = 1) {
    let x = x0; g2.globalAlpha = alpha;
    for (const r of runs(s)) {
      const i = idx(r.ch), w = widths[i];
      if (r.ch !== " ") { const sh = tint(r.color); for (const o of r.bold ? [0, 1] : [0]) g2.drawImage(sh, (i % 16) * 8, Math.floor(i / 16) * 8, 8, 8, (x + o) * S, y0 * S, 8 * S, 8 * S); }
      x += w + (r.bold ? 1 : 0);
    }
    g2.globalAlpha = 1;
  }
  font = { width, draw };
  return font;
}
// A name tag as RendererLivingEntity.renderLivingLabel draws it: a 25% black
// box one pixel round the text, the text seen through walls at low alpha and
// drawn properly where it is not hidden. 1 pixel = 0.02666667 blocks.
function nameTag(text) {
  const g = new THREE.Group();
  const make = () => {
    const w = font.width(text), j = Math.floor(w / 2), S = 4;
    const c = document.createElement("canvas"); c.width = (2 * j + 2) * S; c.height = 9 * S;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(0, 0, c.width, c.height);
    font.draw(x, text, 1 + (j - Math.floor(w / 2)) - (w / 2 - j > 0 ? 0 : 0), 1, S);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    const P = 0.02666667;
    for (const [depth, op] of [[false, 0.13], [true, 1]]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: depth, depthWrite: false, opacity: op }));
      s.center.set(0.5, 8 / 9); s.scale.set((2 * j + 2) * P, 9 * P, 1); s.renderOrder = depth ? 11 : 10; g.add(s);
    }
  };
  if (font) make(); else loadFont().then(make);
  return g;
}

/* ------------------------------------------------------------ items
   Flat items are the game's generated item model: the 16x16 picture with one
   pixel of thickness and a side face on every edge pixel. Blocks use their
   real block model (cosmetics/mc/models.json, baked from the game's models). */
let MODELS = null;
const modelsReady = fetch(MC + "models.json").then((r) => r.json()).then((j) => { MODELS = j; });
const ITEM_TEX = {
  267: "item_iron_sword", 280: "item_stick", 352: "item_bone", 357: "item_cookie", 266: "item_gold_ingot", 363: "item_beef_raw", 364: "item_beef_cooked",
  334: "item_leather", 344: "item_egg", 401: "item_fireworks", 299: "item_leather_chestplate",
};
const DYES = ["black", "red", "green", "brown", "blue", "purple", "cyan", "silver", "gray", "pink", "lime", "yellow", "light_blue", "magenta", "orange", "white"];
const BLOCK_ITEM = { 41: "gold_block", 86: "pumpkin", 91: "lit_pumpkin", 46: "tnt", 145: "anvil" };
function itemTexName(it) { if (it.id === 351) return "item_dye_" + DYES[(it.d || 0) & 15]; return ITEM_TEX[it.id]; }

const flatGeoCache = {};
async function flatItemGeo(name) {
  if (flatGeoCache[name]) return flatGeoCache[name];
  const im = await img(name), W = im.width, H = im.height;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  const a = g.getImageData(0, 0, W, H).data, solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 0;
  const pos = [], uv = [], nor = [], z0 = 7.5 / 16, z1 = 8.5 / 16;
  const quad = (p, t, n) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); uv.push(...t[i]); nor.push(...n); } };
  quad([[0, 1, z1], [0, 0, z1], [1, 0, z1], [1, 1, z1]], [[0, 1], [0, 0], [1, 0], [1, 1]], [0, 0, 1]);
  quad([[1, 1, z0], [1, 0, z0], [0, 0, z0], [0, 1, z0]], [[1, 1], [1, 0], [0, 0], [0, 1]], [0, 0, -1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y)) continue;
    const X0 = x / W, X1 = (x + 1) / W, Y1 = 1 - y / H, Y0 = 1 - (y + 1) / H;
    const u0 = (x + 0.25) / W, u1 = (x + 0.75) / W, v0 = 1 - (y + 0.25) / H, v1 = 1 - (y + 0.75) / H, T = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
    if (!solid(x - 1, y)) quad([[X0, Y1, z0], [X0, Y0, z0], [X0, Y0, z1], [X0, Y1, z1]], T, [-1, 0, 0]);
    if (!solid(x + 1, y)) quad([[X1, Y1, z1], [X1, Y0, z1], [X1, Y0, z0], [X1, Y1, z0]], T, [1, 0, 0]);
    if (!solid(x, y - 1)) quad([[X0, Y1, z0], [X0, Y1, z1], [X1, Y1, z1], [X1, Y1, z0]], T, [0, 1, 0]);
    if (!solid(x, y + 1)) quad([[X0, Y0, z1], [X0, Y0, z0], [X1, Y0, z0], [X1, Y0, z1]], T, [0, -1, 0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return (flatGeoCache[name] = geo);
}
// A block model in 0..1 block space, faces as the game bakes them.
const FACE = {
  north: (a, b) => [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]]],
  south: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]],
  west: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], b[2]], [a[0], a[1], a[2]]],
  east: (a, b) => [[b[0], b[1], b[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]]],
  up: (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]],
  down: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]]],
};
function blockMesh(name) {
  const g = new THREE.Group();
  const els = MODELS?.[name]; if (!els) return g;
  const byTex = {};
  for (const e of els) {
    const a = e.from.map((v) => v / 16), b = e.to.map((v) => v / 16);
    let rotM = null;
    if (e.rot) {
      const o = new THREE.Vector3(...e.rot.origin.map((v) => v / 16)), ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[e.rot.axis];
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax), e.rot.angle * D2R);
      rotM = (p) => new THREE.Vector3(...p).sub(o).applyQuaternion(q).add(o).toArray();
    }
    for (const [dir, f] of Object.entries(e.faces)) {
      let P = FACE[dir](a, b); if (rotM) P = P.map(rotM);
      const [u0, v0, u1, v1] = f.uv.map((v) => v / 16);
      const C = [[u0, 1 - v0], [u1, 1 - v0], [u1, 1 - v1], [u0, 1 - v1]], k = (f.r || 0) / 90;
      const T = [0, 1, 2, 3].map((i) => C[(i - k + 4) % 4]);
      const L = byTex[f.t] || (byTex[f.t] = { pos: [], uv: [] });
      for (const i of [0, 3, 2, 0, 2, 1]) { L.pos.push(...P[i]); L.uv.push(...T[i]); }
    }
  }
  for (const [t, L] of Object.entries(byTex)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(L.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(L.uv, 2));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, emat("block_" + t, { side: THREE.FrontSide })));
  }
  return g;
}

/* ------------------------------------------------------------ heads
   TileEntitySkullRenderer: an 8x8x8 head (and the 0.25 inflated hat layer for
   player heads), bottom at the origin, face toward -z in model space. */
function headMesh(kit, it) {
  const g = new THREE.Group();
  if (it.id === 397 && (it.d || 0) === 0) { // skeleton skull, 64x32
    const m = emat("entity_skeleton"); kit.cube(g, m, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8]);
  } else {
    const name = it.head ? `cosmetics/heads/${it.head}.png` : "entity_steve";
    const m = emat(name);
    kit.cube(g, m, 64, 64, 0, 0, [-4, -8, -4, 8, 8, 8]);
    kit.cube(g, m, 64, 64, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.25);
  }
  return g;
}

/* ------------------------------------------------------------ particles
   One batch per texture sheet, drawn as camera-facing quads in a single
   instanced mesh. Each particle carries the fields of the game's EntityFX. */
const PVERT = `
attribute vec3 ipos; attribute float isize; attribute vec4 iuv; attribute vec4 icol;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(ipos, 1.0);
  mv.xy += position.xy * isize;
  vUv = vec2(mix(iuv.x, iuv.z, uv.x), 1.0 - mix(iuv.w, iuv.y, uv.y));
  vCol = vec4(pow(icol.rgb, vec3(2.2)), icol.a);
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv) * vCol;
  if (t.a < 0.004) discard;
  gl_FragColor = t;
  #include <colorspace_fragment>
}`;
class Batch {
  constructor(parent, texture, w, h, max = 4000) {
    this.w = w; this.h = h; this.max = max; this.list = [];
    const base = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute("position", base.attributes.position); g.setAttribute("uv", base.attributes.uv);
    this.cap = 8192;
    this.a = { ipos: new Float32Array(this.cap * 3), isize: new Float32Array(this.cap), iuv: new Float32Array(this.cap * 4), icol: new Float32Array(this.cap * 4) };
    g.setAttribute("ipos", new THREE.InstancedBufferAttribute(this.a.ipos, 3)); g.setAttribute("isize", new THREE.InstancedBufferAttribute(this.a.isize, 1));
    g.setAttribute("iuv", new THREE.InstancedBufferAttribute(this.a.iuv, 4)); g.setAttribute("icol", new THREE.InstancedBufferAttribute(this.a.icol, 4));
    g.instanceCount = 0; this.g = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { map: { value: texture } }, vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false }));
    this.mesh.frustumCulled = false; parent.add(this.mesh);
  }
  add(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(p); }
  tick(world) { for (let i = this.list.length - 1; i >= 0; i--) { const p = this.list[i]; p.update(world); if (p.dead) this.list.splice(i, 1); } }
  draw(pt) {
    let n = 0; const A = this.a;
    for (const p of this.list) {
      if (n >= this.cap) break;
      const q = p.quad(pt); if (!q) continue;
      A.ipos[n * 3] = lerp(p.px, p.x, pt); A.ipos[n * 3 + 1] = lerp(p.py, p.y, pt); A.ipos[n * 3 + 2] = lerp(p.pz, p.z, pt);
      A.isize[n] = q.size; A.iuv[n * 4] = q.u0 / this.w; A.iuv[n * 4 + 1] = q.v0 / this.h; A.iuv[n * 4 + 2] = q.u1 / this.w; A.iuv[n * 4 + 3] = q.v1 / this.h;
      A.icol[n * 4] = q.r; A.icol[n * 4 + 1] = q.g; A.icol[n * 4 + 2] = q.b; A.icol[n * 4 + 3] = q.a;
      n++;
    }
    this.g.instanceCount = n;
    for (const k of ["ipos", "isize", "iuv", "icol"]) this.g.attributes[k].needsUpdate = true;
  }
  clear() { this.list = []; this.g.instanceCount = 0; }
}

// EntityFX: shared state and the base movement (moveEntity against the floor
// at y = 0, the lobby floor the preview stands on).
class FX {
  constructor(x, y, z, mx, my, mz, withMotion) {
    this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z;
    this.r = this.g = this.b = 1; this.a = 1; this.age = 0; this.grav = 0; this.noClip = false; this.onGround = false;
    this.jx = rand() * 3; this.jy = rand() * 3;
    this.scale = (rand() * 0.5 + 0.5) * 2;
    this.maxAge = Math.floor(4 / (rand() * 0.9 + 0.1));
    this.mx = this.my = this.mz = 0; this.tex = 0; this.hw = 0.1; this.hh = 0.2;
    if (withMotion) {
      this.mx = mx + (rand() * 2 - 1) * 0.4; this.my = my + (rand() * 2 - 1) * 0.4; this.mz = mz + (rand() * 2 - 1) * 0.4;
      const f = (rand() + rand() + 1) * 0.15, f1 = Math.sqrt(this.mx * this.mx + this.my * this.my + this.mz * this.mz);
      this.mx = this.mx / f1 * f * 0.4; this.my = this.my / f1 * f * 0.4 + 0.1; this.mz = this.mz / f1 * f * 0.4;
    }
  }
  prev() { this.px = this.x; this.py = this.y; this.pz = this.z; }
  move(dx, dy, dz) {
    if (!this.noClip && this.y >= 0 && this.y + dy < 0) { dy = -this.y; this.my = 0; this.onGround = true; }
    else this.onGround = !this.noClip && this.y + dy <= 0 && dy <= 0 && this.y >= 0;
    this.x += dx; this.y += dy; this.z += dz;
  }
  update() {
    this.prev();
    if (this.age++ >= this.maxAge) this.dead = true;
    this.my -= 0.04 * this.grav; this.move(this.mx, this.my, this.mz);
    this.mx *= 0.98; this.my *= 0.98; this.mz *= 0.98;
    if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; }
  }
  // Size used when drawing (0.1 * particleScale is half the quad).
  size() { return 0.1 * this.scale; }
  quad(pt) {
    const i = this.tex, u0 = (i % 16) * 8, v0 = Math.floor(i / 16) * 8;
    return { size: this.size(pt), u0, v0, u1: u0 + 7.99, v1: v0 + 7.99, r: this.r, g: this.g, b: this.b, a: this.a };
  }
}
const grow32 = (p, pt) => clamp((p.age + pt) / p.maxAge * 32, 0, 1);
class Heart extends FX { // EntityHeartFX (heart, 34)
  constructor(x, y, z) { super(x, y, z, 0, 0, 0, true); this.mx *= 0.01; this.my *= 0.01; this.mz *= 0.01; this.my += 0.1; this.scale *= 0.75 * 2; this.base = this.scale; this.maxAge = 16; this.tex = 80; }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; const y0 = this.y; this.move(this.mx, this.my, this.mz); if (this.y === y0) { this.mx *= 1.1; this.mz *= 1.1; } this.mx *= 0.86; this.my *= 0.86; this.mz *= 0.86; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Flame extends FX { // EntityFlameFX (flame, 26)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, mx, my, mz, true);
    this.mx = this.mx * 0.01 + mx; this.my = this.my * 0.01 + my; this.mz = this.mz * 0.01 + mz;
    this.x += (rand() - rand()) * 0.05; this.y += (rand() - rand()) * 0.05; this.z += (rand() - rand()) * 0.05; this.prev();
    this.base = this.scale; this.maxAge = Math.floor(8 / (rand() * 0.8 + 0.2)) + 4; this.noClip = true; this.tex = 48;
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.move(this.mx, this.my, this.mz); this.mx *= 0.96; this.my *= 0.96; this.mz *= 0.96; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { const f = (this.age + pt) / this.maxAge; return 0.1 * this.base * (1 - f * f * 0.5); }
}
class Reddust extends FX { // EntityReddustFX (reddust, 30): colour from the packet
  constructor(x, y, z, r, g, b) {
    super(x, y, z, 0, 0, 0, true); this.mx *= 0.1; this.my *= 0.1; this.mz *= 0.1;
    if (r === 0) r = 1;
    const f = rand() * 0.4 + 0.6;
    this.r = (rand() * 0.2 + 0.8) * r * f; this.g = (rand() * 0.2 + 0.8) * g * f; this.b = (rand() * 0.2 + 0.8) * b * f;
    this.scale *= 0.75; this.base = this.scale; this.maxAge = Math.floor(8 / (rand() * 0.8 + 0.2));
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = 7 - Math.floor(this.age * 8 / this.maxAge); const y0 = this.y; this.move(this.mx, this.my, this.mz); if (this.y === y0) { this.mx *= 1.1; this.mz *= 1.1; } this.mx *= 0.96; this.my *= 0.96; this.mz *= 0.96; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Smoke extends FX { // EntitySmokeFX (smoke 11 at 1x, largesmoke 12 at 2.5x)
  constructor(x, y, z, mx, my, mz, s = 1) {
    super(x, y, z, 0, 0, 0, true); this.mx = this.mx * 0.1 + mx; this.my = this.my * 0.1 + my; this.mz = this.mz * 0.1 + mz;
    this.r = this.g = this.b = rand() * 0.3; this.scale *= 0.75 * s; this.base = this.scale; this.maxAge = Math.floor(Math.floor(8 / (rand() * 0.8 + 0.2)) * s);
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = 7 - Math.floor(this.age * 8 / this.maxAge); this.my += 0.004; const y0 = this.y; this.move(this.mx, this.my, this.mz); if (this.y === y0) { this.mx *= 1.1; this.mz *= 1.1; } this.mx *= 0.96; this.my *= 0.96; this.mz *= 0.96; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Cloud extends FX { // EntityCloudFX (cloud, 29)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, 0, 0, 0, true); const f = 2.5; this.mx = this.mx * 0.1 + mx; this.my = this.my * 0.1 + my; this.mz = this.mz * 0.1 + mz;
    this.r = this.g = this.b = 1 - rand() * 0.3; this.scale *= 0.75 * f; this.base = this.scale; this.maxAge = Math.floor(Math.floor(8 / (rand() * 0.8 + 0.3)) * f);
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = 7 - Math.floor(this.age * 8 / this.maxAge); this.move(this.mx, this.my, this.mz); this.mx *= 0.96; this.my *= 0.96; this.mz *= 0.96; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Spell extends FX { // EntitySpellFX as mobSpell (15): colour = the packet's offsets
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, 0.5 - rand(), my, 0.5 - rand(), true); this.my *= 0.2; if (mx === 0 && mz === 0) { this.mx *= 0.1; this.mz *= 0.1; }
    this.scale *= 0.75; this.base = this.scale; this.maxAge = Math.floor(8 / (rand() * 0.8 + 0.2)); this.r = mx; this.g = my; this.b = mz; this.baseTex = 128;
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = this.baseTex + (7 - Math.floor(this.age * 8 / this.maxAge)); this.my += 0.004; const y0 = this.y; this.move(this.mx, this.my, this.mz); if (this.y === y0) { this.mx *= 1.1; this.mz *= 1.1; } this.mx *= 0.96; this.my *= 0.96; this.mz *= 0.96; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Explode extends FX { // EntityExplodeFX (explode, 0)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, mx, my, mz, true); this.mx = mx + (rand() * 2 - 1) * 0.05; this.my = my + (rand() * 2 - 1) * 0.05; this.mz = mz + (rand() * 2 - 1) * 0.05;
    this.r = this.g = this.b = rand() * 0.3 + 0.7; this.scale = rand() * rand() * 6 + 1; this.maxAge = Math.floor(16 / (rand() * 0.8 + 0.2)) + 2;
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = 7 - Math.floor(this.age * 8 / this.maxAge); this.my += 0.004; this.move(this.mx, this.my, this.mz); this.mx *= 0.9; this.my *= 0.9; this.mz *= 0.9; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
}
class Crit extends FX { // EntityCritFX (crit, 9)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, 0, 0, 0, true); this.mx = this.mx * 0.1 + mx * 0.4; this.my = this.my * 0.1 + my * 0.4; this.mz = this.mz * 0.1 + mz * 0.4;
    this.r = this.g = this.b = rand() * 0.3 + 0.6; this.scale *= 0.75; this.base = this.scale; this.maxAge = Math.floor(6 / (rand() * 0.8 + 0.6)); this.tex = 65;
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.move(this.mx, this.my, this.mz); this.g *= 0.96; this.b *= 0.9; this.mx *= 0.7; this.my *= 0.7; this.mz *= 0.7; this.my -= 0.02; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Note extends FX { // EntityNoteFX (note, 23): the x speed picks the colour
  constructor(x, y, z, c) {
    super(x, y, z, 0, 0, 0, true); this.mx *= 0.01; this.my *= 0.01; this.mz *= 0.01; this.my += 0.2;
    this.r = Math.sin(c * Math.PI * 2) * 0.65 + 0.35; this.g = Math.sin((c + 1 / 3) * Math.PI * 2) * 0.65 + 0.35; this.b = Math.sin((c + 2 / 3) * Math.PI * 2) * 0.65 + 0.35;
    this.scale *= 0.75 * 2; this.base = this.scale; this.maxAge = 6; this.tex = 64;
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; const y0 = this.y; this.move(this.mx, this.my, this.mz); if (this.y === y0) { this.mx *= 1.1; this.mz *= 1.1; } this.mx *= 0.66; this.my *= 0.66; this.mz *= 0.66; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { return 0.1 * this.base * grow32(this, pt); }
}
class Lava extends FX { // EntityLavaFX (lava, 27)
  constructor(x, y, z) { super(x, y, z, 0, 0, 0, true); this.mx *= 0.8; this.my = rand() * 0.4 + 0.05; this.mz *= 0.8; this.scale *= rand() * 2 + 0.2; this.base = this.scale; this.maxAge = Math.floor(16 / (rand() * 0.8 + 0.2)); this.tex = 49; }
  update(w) { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; if (rand() > this.age / this.maxAge) w.spawn(new Smoke(this.x, this.y, this.z, this.mx, this.my, this.mz)); this.my -= 0.03; this.move(this.mx, this.my, this.mz); this.mx *= 0.999; this.my *= 0.999; this.mz *= 0.999; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
  size(pt) { const f = (this.age + pt) / this.maxAge; return 0.1 * this.base * (1 - f * f); }
}
class Drip extends FX { // EntityDropParticleFX, water (dripWater, 18)
  constructor(x, y, z) { super(x, y, z, 0, 0, 0, true); this.mx = this.my = this.mz = 0; this.r = 0; this.g = 0; this.b = 1; this.tex = 113; this.grav = 0.06; this.bob = 40; this.maxAge = Math.floor(64 / (rand() * 0.8 + 0.2)); this.hw = 0.005; }
  update(w) {
    this.prev(); this.r = 0.2; this.g = 0.3; this.b = 1; this.my -= this.grav;
    if (this.bob-- > 0) { this.mx *= 0.02; this.my *= 0.02; this.mz *= 0.02; this.tex = 113; } else this.tex = 112;
    this.move(this.mx, this.my, this.mz); this.mx *= 0.98; this.my *= 0.98; this.mz *= 0.98;
    if (this.maxAge-- <= 0) this.dead = true;
    if (this.onGround) { this.dead = true; w.spawn(new Splash(this.x, this.y, this.z, 0, 0, 0)); this.mx *= 0.7; this.mz *= 0.7; }
  }
}
class Splash extends FX { // EntitySplashFX (splash after a drip lands)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, 0, 0, 0, true); this.mx *= 0.3; this.my = rand() * 0.2 + 0.1; this.mz *= 0.3; this.tex = 19 + randInt(4); this.grav = 0.06; this.maxAge = Math.floor(8 / (rand() * 0.8 + 0.2));
    this.grav = 0.04; this.tex++;
    if (my === 0 && (mx !== 0 || mz !== 0)) { this.mx = mx; this.my = my + 0.1; this.mz = mz; }
  }
  update() { this.prev(); this.my -= this.grav; this.move(this.mx, this.my, this.mz); this.mx *= 0.98; this.my *= 0.98; this.mz *= 0.98; if (this.maxAge-- <= 0) this.dead = true; if (this.onGround) { if (rand() < 0.5) this.dead = true; this.mx *= 0.7; this.mz *= 0.7; } }
}
// EntityFireworkSparkFX: the sparks of a firework burst (and of a rocket's trail).
class Spark extends FX {
  constructor(x, y, z, mx, my, mz) { super(x, y, z, 0, 0, 0, false); this.mx = mx; this.my = my; this.mz = mz; this.scale *= 0.75; this.maxAge = 48 + randInt(12); this.baseTex = 160; this.trail = false; this.twinkle = false; this.fade = null; this.full = true; }
  setColor(c) { this.r = ((c >> 16) & 255) / 255; this.g = ((c >> 8) & 255) / 255; this.b = (c & 255) / 255; }
  update(w) {
    this.prev();
    if (this.age++ >= this.maxAge) this.dead = true;
    if (this.age > this.maxAge / 2) {
      this.a = 1 - (this.age - this.maxAge / 2) / this.maxAge;
      if (this.fade) { this.r += (this.fade[0] - this.r) * 0.2; this.g += (this.fade[1] - this.g) * 0.2; this.b += (this.fade[2] - this.b) * 0.2; }
    }
    this.tex = this.baseTex + (7 - Math.floor(this.age * 8 / this.maxAge));
    this.my -= 0.004; this.move(this.mx, this.my, this.mz); this.mx *= 0.91; this.my *= 0.91; this.mz *= 0.91;
    if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; }
    if (this.trail && this.age < this.maxAge / 2 && (this.age + this.maxAge) % 2 === 0) {
      const s = new Spark(this.x, this.y, this.z, 0, 0, 0); s.a = 0.99; s.r = this.r; s.g = this.g; s.b = this.b; s.age = Math.floor(s.maxAge / 2); s.fade = this.fade; s.twinkle = this.twinkle; w.spawn(s);
    }
  }
  quad(pt) {
    if (this.twinkle && this.age >= this.maxAge / 3 && Math.floor((this.age + this.maxAge) / 3) % 2 !== 0) return null;
    return super.quad(pt);
  }
}
// EntityFireworkOverlayFX: the flash at the centre of each burst.
class Overlay extends FX {
  constructor(x, y, z) { super(x, y, z, 0, 0, 0, false); this.maxAge = 4; }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; }
  quad(pt) { const k = this.age + pt - 1; return { size: 7.1 * Math.sin(k * 0.25 * Math.PI), u0: 32, v0: 16, u1: 64, v1: 48, r: this.r, g: this.g, b: this.b, a: 0.6 - k * 0.25 * 0.5 }; }
}
// EntityLargeExplodeFX (largeexplode, 1) on explosion.png.
class LargeExplode extends FX {
  constructor(x, y, z, s) { super(x, y, z, 0, 0, 0, false); this.life = 6 + randInt(4); this.r = this.g = this.b = rand() * 0.6 + 0.4; this.sz = 1 - s * 0.5; this.sheet = "explosion"; }
  update() { this.prev(); this.age++; if (this.age === this.life) this.dead = true; }
  quad(pt) { const i = Math.floor((this.age + pt) * 15 / this.life); if (i > 15) return null; const u0 = (i % 4) * 32, v0 = Math.floor(i / 4) * 32; return { size: 2 * this.sz, u0, v0, u1: u0 + 31.9, v1: v0 + 31.9, r: this.r, g: this.g, b: this.b, a: 1 }; }
}
// EntityHugeExplodeFX (hugeexplosion, 2): spawns six large explosions a tick for 8 ticks.
class HugeExplode extends FX {
  constructor(x, y, z) { super(x, y, z, 0, 0, 0, false); this.t = 0; }
  update(w) { for (let i = 0; i < 6; i++) w.spawn(new LargeExplode(this.x + (rand() - rand()) * 4, this.y + (rand() - rand()) * 4, this.z + (rand() - rand()) * 4, this.t / 8)); this.t++; if (this.t === 8) this.dead = true; }
  quad() { return null; }
}
// EntityDiggingFX / EntityBreakingFX: a random quarter of a block or item picture.
class Crumb extends FX {
  constructor(x, y, z, mx, my, mz, tile, color, exact) {
    super(x, y, z, mx, my, mz, true); this.sheet = "tiles"; this.tile = tile; this.grav = 1; this.r = this.g = this.b = color; this.scale /= 2;
    if (exact) { this.mx = mx; this.my = my; this.mz = mz; }
  }
  quad(pt) {
    const t = this.tile, u0 = (t % 16) * 16 + this.jx / 4 * 16, v0 = Math.floor(t / 16) * 16 + this.jy / 4 * 16;
    return { size: 0.1 * this.scale, u0, v0, u1: u0 + 4, v1: v0 + 4, r: this.r, g: this.g, b: this.b, a: 1 };
  }
}
class Iconcrack extends Crumb { // EntityBreakingFX built from a packet: motion *0.1 + given
  constructor(x, y, z, mx, my, mz, tile) { super(x, y, z, 0, 0, 0, tile, 1, false); this.mx = this.mx * 0.1 + mx; this.my = this.my * 0.1 + my; this.mz = this.mz * 0.1 + mz; }
}

/* ------------------------------------------------------------ the player */
export function createRecFx(kit0) {
  const kit = makeModelKit(kit0.setBoxUV);
  const { cube, piece, setRP, rot } = kit;

  // Tile sheet for block/item crumbs (16px tiles, built once from single pictures).
  const TILES = ["block_redstone_block", "block_pumpkin_side", "block_dirt", "block_gravel", "item_egg", "block_gold_block", "block_anvil_base"];
  const tileCanvas = document.createElement("canvas"); tileCanvas.width = 256; tileCanvas.height = 256;
  const tileTex = new THREE.CanvasTexture(tileCanvas); tileTex.magFilter = tileTex.minFilter = THREE.NearestFilter; tileTex.colorSpace = THREE.SRGBColorSpace; tileTex.generateMipmaps = false;
  Promise.all(TILES.map((n) => img(n))).then((ims) => { const g = tileCanvas.getContext("2d"); ims.forEach((im, i) => g.drawImage(im, 0, 0, 16, 16, (i % 16) * 16, Math.floor(i / 16) * 16, 16, 16)); tileTex.needsUpdate = true; });
  const tileOf = (name) => TILES.indexOf(name);
  const BLOCK_TILE = { 152: "block_redstone_block", 86: "block_pumpkin_side", 41: "block_gold_block", 2: "block_dirt", 3: "block_dirt", 13: "block_gravel", 145: "block_anvil_base" };
  const ITEM_TILE = { 344: "item_egg" };
  const BREAK_SOUND = { 152: ["dig.stone", 1, 1], 86: ["dig.wood", 1, 1], 41: ["dig.stone", 1, 1] };

  // ---- held / worn items -------------------------------------------------
  function itemMesh(it, onReady) { // returns a Group holding the model in 0..1 item space, centred later
    const g = new THREE.Group();
    const block = BLOCK_ITEM[it.id];
    if (block) { modelsReady.then(() => g.add(blockMesh(block))); g.userData.gui3d = true; return g; }
    if (it.id === 397) { const h = headMesh(kit, it); h.userData.skull = true; g.add(h); g.userData.gui3d = true; g.userData.skull = true; return g; }
    const name = itemTexName(it); if (!name) return g;
    flatItemGeo(name).then((geo) => {
      let m = emat(name);
      if (it.id === 299) { // leather armour piece: tinted base with the overlay on top
        const c = new THREE.Color(it.color != null ? it.color : 0xa06540);
        m = new THREE.MeshLambertMaterial({ map: tex(name), alphaTest: 0.1, color: c });
      }
      g.add(new THREE.Mesh(geo, m)); onReady?.();
    });
    return g;
  }
  // RenderItem.renderItem(stack, model): scale 0.5, then the 0..1 model moved to its centre.
  // Built-in models (skulls) turn 180 degrees and use TileEntityItemStackRenderer
  // (translate -0.5,0,-0.5 then scale 2, then renderSkull at the block centre).
  function renderItemNode(it) {
    const outer = new THREE.Group(); outer.scale.setScalar(0.5);
    const m = itemMesh(it);
    if (m.userData.skull) {
      const r = new THREE.Group(); r.rotation.y = Math.PI; outer.add(r);
      // after rotate, translate(-.5,-.5,-.5), then translate(-.5,0,-.5) scale 2, renderSkull(0,0,0,UP): head at (x+.5, y, z+.5) facing up, scale(-1,-1,1)
      const s = new THREE.Group(); s.position.set(-0.5, -0.5, -0.5); r.add(s);
      const s2 = new THREE.Group(); s2.position.set(-0.5, 0, -0.5); s2.scale.setScalar(2); s.add(s2);
      const h = m.children[0]; m.remove(h);
      const hh = new THREE.Group(); hh.position.set(0.5, 0, 0.5); hh.scale.set(-1, -1, 1); s2.add(hh);
      // skull model: box -4..4,-8..0 in model space with rotateAngleY = rotation (0) ; model space y down already handled by scale(-1,-1,1)
      const fix = new THREE.Group(); fix.scale.set(1, -1, -1); hh.add(fix); fix.add(h); // undo the kit's (x,-y,-z) so the GL scale reads directly
    } else {
      m.position.set(-0.5, -0.5, -0.5); outer.add(m);
    }
    outer.userData.gui3d = !!m.userData.gui3d;
    return outer;
  }
  function applyTransform(g, [rx, ry, rz], [tx, ty, tz], s) { // ItemCameraTransforms.applyTransform: T, Ry, Rx, Rz, S
    const a = new THREE.Group(); a.position.set(tx / 16, ty / 16, tz / 16);
    const b = new THREE.Group(); b.rotation.order = "YXZ"; b.rotation.set(rx * D2R, ry * D2R, rz * D2R); a.add(b);
    const c = new THREE.Group(); c.scale.setScalar(s); b.add(c); c.add(g); return a;
  }
  const THIRD = { handheld: [[0, 90, -35], [0, 1.25, -3.5], 0.85], generated: [[-90, 0, 0], [0, 1, -3], 0.55], block: [[10, -45, 170], [0, 1.5, -2.75], 0.375], skull: [[180, -45, 0], [0, 1, -2.5], 0.25] };
  const HANDHELD = new Set([267, 280, 352]);
  // LayerHeldItem on a biped's right arm (the arm group already holds the arm's pivot and turn).
  function heldItem(it, child) {
    // GL space of the arm (y down, z forward as in model space). Build in GL axes then flip with (1,-1,-1).
    const gl = new THREE.Group(); gl.scale.set(1, -1, -1);
    let p = gl;
    if (child) { const c = new THREE.Group(); c.position.set(0, 0.625, 0); c.rotation.x = 20 * D2R; c.scale.setScalar(0.5); p.add(c); p = c; }
    const t = new THREE.Group(); t.position.set(-0.0625, 0.4375, 0.0625); p.add(t); p = t;
    const node = renderItemNode(it), gui3d = node.userData.gui3d;
    if (BLOCK_ITEM[it.id]) { const b = new THREE.Group(); b.position.set(0, 0.1875, -0.3125); b.rotation.order = "XYZ"; b.rotation.set(20 * D2R, 45 * D2R, 0); b.scale.set(-0.375, -0.375, 0.375); p.add(b); p = b; }
    const pre = new THREE.Group(); pre.scale.setScalar(gui3d ? (BLOCK_ITEM[it.id] ? 2 : 1) : 2); p.add(pre); // ItemRenderer 2x for blocks, preTransform 2x for flat items
    const tr = it.id === 397 ? THIRD.skull : BLOCK_ITEM[it.id] ? THIRD.block : HANDHELD.has(it.id) ? THIRD.handheld : THIRD.generated;
    pre.add(applyTransform(node, ...tr));
    return gl;
  }
  // LayerCustomHead on a biped head group.
  function wornHead(it, child) {
    const gl = new THREE.Group(); gl.scale.set(1, -1, -1); let p = gl;
    if (child) { const c = new THREE.Group(); c.scale.setScalar(1.4 / 2); c.position.set(0, 1, 0); p.add(c); p = c; }
    if (it.id === 397) {
      const s = new THREE.Group(); s.scale.set(1.1875, -1.1875, -1.1875); p.add(s);
      // renderSkull(-0.5, 0, -0.5, UP, 180): translate(0,0,0), scale(-1,-1,1), head turned 180 about y
      const s2 = new THREE.Group(); s2.scale.set(-1, -1, 1); s.add(s2);
      const r = new THREE.Group(); r.rotation.y = Math.PI; s2.add(r);
      const fix = new THREE.Group(); fix.scale.set(1, -1, -1); r.add(fix); fix.add(headMesh(kit, it));
    } else {
      const t = new THREE.Group(); t.position.set(0, -0.25, 0); t.rotation.y = Math.PI; t.scale.set(0.625, -0.625, -0.625); p.add(t);
      const two = new THREE.Group(); two.scale.setScalar(BLOCK_ITEM[it.id] ? 2 : 1); t.add(two);
      const node = renderItemNode(it); if (!node.userData.gui3d) node.scale.multiplyScalar(2); two.add(node);
    }
    return gl;
  }

  // ---- living models -----------------------------------------------------
  // Each returns {m (model group in the corpse group), set(e, pt) poses it}.
  function bipedSkin(e, skinTex, slim) {
    const mat = emat(skinTex);
    const m = new THREE.Group();
    const head = piece(m); cube(head, mat, 64, 64, 0, 0, [-4, -8, -4, 8, 8, 8]); cube(head, mat, 64, 64, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.5);
    const body = piece(m); cube(body, mat, 64, 64, 16, 16, [-4, 0, -2, 8, 12, 4]); cube(body, mat, 64, 64, 16, 32, [-4, 0, -2, 8, 12, 4], false, 0.25);
    const aw = slim ? 3 : 4;
    const armR = piece(m, [-5, slim ? 2.5 : 2, 0]); cube(armR, mat, 64, 64, 40, 16, [-3 + (slim ? 1 : 0), -2, -2, aw, 12, 4]); cube(armR, mat, 64, 64, 40, 32, [-3 + (slim ? 1 : 0), -2, -2, aw, 12, 4], false, 0.25);
    const armL = piece(m, [5, slim ? 2.5 : 2, 0]); cube(armL, mat, 64, 64, 32, 48, [-1, -2, -2, aw, 12, 4]); cube(armL, mat, 64, 64, 48, 48, [-1, -2, -2, aw, 12, 4], false, 0.25);
    const legR = piece(m, [-1.9, 12, 0]); cube(legR, mat, 64, 64, 0, 16, [-2, 0, -2, 4, 12, 4]); cube(legR, mat, 64, 64, 0, 32, [-2, 0, -2, 4, 12, 4], false, 0.25);
    const legL = piece(m, [1.9, 12, 0]); cube(legL, mat, 64, 64, 16, 48, [-2, 0, -2, 4, 12, 4]); cube(legL, mat, 64, 64, 0, 48, [-2, 0, -2, 4, 12, 4], false, 0.25);
    const held = new THREE.Group(); armR.add(held);
    return {
      m, scale: 0.9375, parts: { head, body, armR, armL, legR, legL }, held,
      set(e, pt) { // ModelBiped.setRotationAngles + ModelPlayer
        const ls = lerp(e.pls, e.ls, pt) , la = lerp(e.pla, e.la, pt), age = e.age + pt;
        const bodyYaw = lerpAng(e.pbody, e.body, pt), headYaw = lerpAng(e.phead, e.head, pt), pitch = lerp(e.ppitch, e.pitch, pt);
        const hx = pitch * D2R, hy = wrap(headYaw - bodyYaw) * D2R;
        let rax = Math.cos(ls * 0.6662 + Math.PI) * 2 * la * 0.5, lax = Math.cos(ls * 0.6662) * 2 * la * 0.5;
        let raz = 0, laz = 0, ray = 0, lay = 0, by = 0;
        const rlx = Math.cos(ls * 0.6662) * 1.4 * la, llx = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la;
        if (e.eq[0]) rax = rax * 0.5 - Math.PI / 10;
        let rp = [-5, slim ? 2.5 : 2, 0], lp = [5, slim ? 2.5 : 2, 0];
        const sw = e.swingAt(pt);
        if (sw > 0) {
          by = Math.sin(Math.sqrt(sw) * Math.PI * 2) * 0.2;
          rp = [-Math.cos(by) * 5, rp[1], Math.sin(by) * 5]; lp = [Math.cos(by) * 5, lp[1], -Math.sin(by) * 5];
          ray += by; lay += by; lax += by;
          let f = 1 - sw; f *= f; f *= f; f = 1 - f;
          const f2 = Math.sin(f * Math.PI), f3 = Math.sin(sw * Math.PI) * -(hx - 0.7) * 0.75;
          rax = rax - (f2 * 1.2 + f3); ray += by * 2; raz += Math.sin(sw * Math.PI) * -0.4;
        }
        raz += Math.cos(age * 0.09) * 0.05 + 0.05; laz -= Math.cos(age * 0.09) * 0.05 + 0.05;
        rax += Math.sin(age * 0.067) * 0.05; lax -= Math.sin(age * 0.067) * 0.05;
        rot(head, hx, hy, 0); rot(body, 0, by, 0);
        setRP(armR, rp); setRP(armL, lp); rot(armR, rax, ray, raz); rot(armL, lax, lay, laz); rot(legR, rlx, 0, 0); rot(legL, llx, 0, 0);
      },
    };
  }
  function armorStand(e) { // ModelArmorStand: the stand is invisible in every effect, its layers are not
    const m = new THREE.Group(), hl = new THREE.Group(), al = new THREE.Group(); m.add(hl, al);
    const head = piece(hl), body = piece(m), armR = piece(al, [-5, 2, 0]), armL = piece(m, [5, 2, 0]);
    const held = new THREE.Group(); armR.add(held);
    return {
      m, hl, al, scale: 1, parts: { head, body, armR, armL }, held, stand: true,
      set(e) {
        const P = (k, d) => (e.meta[k] || d).map((v) => v * D2R);
        const [hx, hy, hz] = P("11", [0, 0, 0]), [bx, byy, bz] = P("12", [0, 0, 0]), [lx, ly, lz] = P("13", [-10, 0, -10]), [rx, ry, rz] = P("14", [-15, 0, 10]);
        rot(head, hx, hy, hz); rot(body, bx, byy, bz); rot(armL, lx, ly, lz); rot(armR, rx, ry, rz);
      },
    };
  }
  function chicken(e) { // ModelChicken (64x32)
    const mat = emat("entity_chicken"), m = new THREE.Group();
    const headG = new THREE.Group(), bodyG = new THREE.Group(); m.add(headG, bodyG);
    const head = piece(headG, [0, 15, -4]); cube(head, mat, 64, 32, 0, 0, [-2, -6, -2, 4, 6, 3]);
    const bill = piece(headG, [0, 15, -4]); cube(bill, mat, 64, 32, 14, 0, [-2, -4, -4, 4, 2, 2]);
    const chin = piece(headG, [0, 15, -4]); cube(chin, mat, 64, 32, 14, 4, [-1, -2, -3, 2, 2, 2]);
    const body = piece(bodyG, [0, 16, 0]); cube(body, mat, 64, 32, 0, 9, [-3, -4, -3, 6, 8, 6]);
    const legR = piece(bodyG, [-2, 19, 1]); cube(legR, mat, 64, 32, 26, 0, [-1, 0, -3, 3, 5, 3]);
    const legL = piece(bodyG, [1, 19, 1]); cube(legL, mat, 64, 32, 26, 0, [-1, 0, -3, 3, 5, 3]);
    const wingR = piece(bodyG, [-4, 13, 0]); cube(wingR, mat, 64, 32, 24, 13, [0, 0, -3, 1, 4, 6]);
    const wingL = piece(bodyG, [4, 13, 0]); cube(wingL, mat, 64, 32, 24, 13, [-1, 0, -3, 1, 4, 6]);
    if (e.child) { headG.position.set(0, -5 / 16, -2 / 16); bodyG.scale.setScalar(0.5); bodyG.position.y = -24 / 16 * 0.5; }
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt);
        const wing = lerp(e.pwing, e.wing, pt), dest = lerp(e.pdest, e.dest, pt), f = (Math.sin(wing) + 1) * dest;
        const hx = lerp(e.ppitch, e.pitch, pt) * D2R, hy = wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R;
        for (const h of [head, bill, chin]) rot(h, hx, hy, 0);
        rot(body, Math.PI / 2, 0, 0); rot(legR, Math.cos(ls * 0.6662) * 1.4 * la); rot(legL, Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
        rot(wingR, 0, 0, f); rot(wingL, 0, 0, -f);
      },
    };
  }
  const RABBIT = ["brown", "white", "black", "white_splotched", "gold", "salt"];
  function rabbit(e) { // ModelRabbit (64x32), drawn at 0.6 for adults
    const mat = emat("rabbit_" + (RABBIT[e.meta["18"]] || "brown")), m = new THREE.Group();
    const g = new THREE.Group(); g.scale.setScalar(0.6); g.position.y = -0.6; m.add(g);
    const P = (rp, r, u, v, b) => { const p = piece(g, rp); rot(p, ...r); cube(p, mat, 64, 32, u, v, b); return p; };
    const footL = P([3, 17.5, 3.7], [0, 0, 0], 26, 24, [-1, 5.5, -3.7, 2, 1, 7]);
    const footR = P([-3, 17.5, 3.7], [0, 0, 0], 8, 24, [-1, 5.5, -3.7, 2, 1, 7]);
    const thighL = P([3, 17.5, 3.7], [-0.34906584, 0, 0], 30, 15, [-1, 0, 0, 2, 4, 5]);
    const thighR = P([-3, 17.5, 3.7], [-0.34906584, 0, 0], 16, 15, [-1, 0, 0, 2, 4, 5]);
    P([0, 19, 8], [-0.34906584, 0, 0], 0, 0, [-3, -2, -10, 6, 5, 10]);
    const armL = P([3, 17, -1], [-0.17453292, 0, 0], 8, 15, [-1, 0, -1, 2, 7, 2]);
    const armR = P([-3, 17, -1], [-0.17453292, 0, 0], 0, 15, [-1, 0, -1, 2, 7, 2]);
    const head = P([0, 16, -1], [0, 0, 0], 32, 0, [-2.5, -4, -5, 5, 4, 5]);
    const earR = P([0, 16, -1], [0, -0.2617994, 0], 52, 0, [-2.5, -9, -1, 2, 5, 1]);
    const earL = P([0, 16, -1], [0, 0.2617994, 0], 58, 0, [0.5, -9, -1, 2, 5, 1]);
    P([0, 20, 7], [-0.3490659, 0, 0], 52, 6, [-1.5, -1.5, 0, 3, 3, 2]);
    const nose = P([0, 16, -1], [0, 0, 0], 32, 9, [-0.5, -2.5, -5.5, 1, 1, 1]);
    return {
      m, scale: 1,
      set(e, pt) {
        const hx = lerp(e.ppitch, e.pitch, pt) * D2R, hy = wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R;
        rot(nose, hx, hy); rot(head, hx, hy); rot(earR, hx, hy - 0.2617994); rot(earL, hx, hy + 0.2617994);
        const j = Math.sin((e.jumpDur === 0 ? 0 : (e.jumpTicks + pt) / e.jumpDur) * Math.PI);
        rot(thighL, (j * 50 - 21) * D2R); rot(thighR, (j * 50 - 21) * D2R); rot(footL, j * 50 * D2R); rot(footR, j * 50 * D2R);
        rot(armL, (j * -40 - 11) * D2R); rot(armR, (j * -40 - 11) * D2R);
      },
    };
  }
  function wolf(e) { // ModelWolf (64x32), wild wolf standing
    const mat = emat("entity_wolf"), m = new THREE.Group();
    const head = piece(m, [-1, 13.5, -7]);
    cube(head, mat, 64, 32, 0, 0, [-3, -3, -2, 6, 6, 4]); cube(head, mat, 64, 32, 16, 14, [-3, -5, 0, 2, 2, 1]); cube(head, mat, 64, 32, 16, 14, [1, -5, 0, 2, 2, 1]); cube(head, mat, 64, 32, 0, 10, [-1.5, 0, -5, 3, 3, 4]);
    const body = piece(m, [0, 14, 2]); cube(body, mat, 64, 32, 18, 14, [-4, -2, -3, 6, 9, 6]);
    const mane = piece(m, [-1, 14, -3]); cube(mane, mat, 64, 32, 21, 0, [-4, -3, -3, 8, 6, 7]);
    const legs = [[-2.5, 16, 7], [0.5, 16, 7], [-2.5, 16, -4], [0.5, 16, -4]].map((rp) => { const p = piece(m, rp); cube(p, mat, 64, 32, 0, 18, [-1, 0, -1, 2, 8, 2]); return p; });
    const tail = piece(m, [-1, 12, 8]); cube(tail, mat, 64, 32, 9, 18, [-1, 0, -1, 2, 8, 2]);
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt);
        rot(body, Math.PI / 2); rot(mane, Math.PI / 2);
        rot(legs[0], Math.cos(ls * 0.6662) * 1.4 * la); rot(legs[1], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
        rot(legs[2], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(legs[3], Math.cos(ls * 0.6662) * 1.4 * la);
        rot(tail, Math.PI / 5, Math.cos(ls * 0.6662) * 1.4 * la);
        const hx = lerp(e.ppitch, e.pitch, pt) * D2R, hy = wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R;
        rot(head, hx, hy, 0);
      },
    };
  }
  let anyHanging = false;
  function bat(e) { // ModelBat (64x64) at 0.35
    const mat = emat("entity_bat"), m = new THREE.Group();
    const head = piece(m); cube(head, mat, 64, 64, 0, 0, [-3, -3, -3, 6, 6, 6]); cube(head, mat, 64, 64, 24, 0, [-4, -6, -2, 3, 4, 1]); cube(head, mat, 64, 64, 24, 0, [1, -6, -2, 3, 4, 1], true);
    const body = piece(m); cube(body, mat, 64, 64, 0, 16, [-3, 4, -3, 6, 12, 6]); cube(body, mat, 64, 64, 0, 34, [-5, 16, 0, 10, 6, 1]);
    const wr = piece(body); cube(wr, mat, 64, 64, 42, 0, [-12, 1, 1.5, 10, 16, 1]);
    const wro = piece(wr, [-12, 1, 1.5]); cube(wro, mat, 64, 64, 24, 16, [-8, 1, 0, 8, 12, 1]);
    const wl = piece(body); cube(wl, mat, 64, 64, 42, 0, [2, 1, 1.5, 10, 16, 1], true);
    const wlo = piece(wl, [12, 1, 1.5]); cube(wlo, mat, 64, 64, 24, 16, [0, 1, 0, 8, 12, 1], true);
    return {
      m, scale: 0.35, bat: true,
      set(e, pt) {
        const age = e.age + pt, hx = lerp(e.ppitch, e.pitch, pt) * D2R, hy = wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R;
        if (e.meta["16"] & 1) {
          anyHanging = true;
          rot(head, hx, Math.PI - hy, Math.PI); setRP(head, [0, -2, 0]); setRP(wr, [-3, 0, 3]); setRP(wl, [3, 0, 3]);
          rot(body, Math.PI); rot(wr, -0.15707964, -Math.PI * 2 / 5); rot(wro, 0, -1.7278761); rot(wl, -0.15707964, Math.PI * 2 / 5); rot(wlo, 0, 1.7278761);
        } else {
          rot(head, hx, hy, 0); setRP(head, [0, 0, 0]); setRP(wr, [0, 0, 0]); setRP(wl, [0, 0, 0]);
          const a = Math.cos(age * 1.3) * Math.PI * 0.25, wx = anyHanging ? -0.15707964 : 0;
          rot(body, Math.PI / 4 + Math.cos(age * 0.1) * 0.15, 0); rot(wr, wx, a); rot(wl, wx, -a); rot(wro, 0, a * 0.5); rot(wlo, 0, -a * 0.5);
        }
      },
      corpse(e, pt, g) { g.position.y = e.meta["16"] & 1 ? -0.1 : Math.cos((e.age + pt) * 0.3) * 0.1; },
    };
  }
  function squid(e) { // ModelSquid; RenderSquid turns it by the squid's own pitch
    const mat = emat("entity_squid"), m = new THREE.Group();
    const body = piece(m, [0, 8, 0]); cube(body, mat, 64, 32, 0, 0, [-6, -8, -6, 12, 16, 12]);
    const t = [];
    for (let j = 0; j < 8; j++) { const a = j * Math.PI * 2 / 8, p = piece(m, [Math.cos(a) * 5, 15, Math.sin(a) * 5]); cube(p, mat, 64, 32, 48, 0, [-1, 0, -1, 2, 18, 2]); p.userData.y = j * Math.PI * -2 / 8 + Math.PI / 2; t.push(p); }
    return {
      m, scale: 1, squid: true,
      set(e, pt) { const a = lerp(e.ptent, e.tent, pt); for (const p of t) rot(p, a, p.userData.y); },
    };
  }
  const MOB_MODEL = { 30: armorStand, 78: armorStand, 93: chicken, 101: rabbit, 95: wolf, 65: bat, 94: squid };
  const HEIGHT = { 30: 1.975, 78: 1.975, 93: 0.7, 101: 0.7, 95: 0.85, 65: 0.9, 94: 0.95, player: 1.8 };

  /* ---------------------------------------------------------- the world */
  function build(S, data, opts = {}) {
    const root = new THREE.Group(); S.item.add(root);
    const batches = { particles: new Batch(root, tex("particles"), 128, 128), explosion: new Batch(root, tex("explosion"), 128, 128), tiles: new Batch(root, tileTex, 256, 256) };
    const ents = new Map();
    const W = {
      spawn(p) { batches[p.sheet || "particles"].add(p); },
    };
    const listener = new THREE.Vector3(-5, 1.68, 0); // the preview camera (an armor stand's eyes)
    function sound(name, x, y, z, vol, pitch) {
      const d = listener.distanceTo(new THREE.Vector3(x, y, z)), roll = 16 * Math.max(1, vol);
      const gain = Math.min(1, vol) * Math.max(0, 1 - d / roll);
      if (gain > 0.01) S.sound(name, pitch, gain);
    }

    // ---- particles from packets (NetHandlerPlayClient.handleParticles + RenderGlobal.spawnEntityFX)
    function spawnParticle(id, x, y, z, a, b, c, data) {
      let p = null;
      switch (id) {
        case 0: p = new Explode(x, y, z, a, b, c); break;
        case 1: p = new LargeExplode(x, y, z, a); break;
        case 2: p = new HugeExplode(x, y, z); break;
        case 9: p = new Crit(x, y, z, a, b, c); break;
        case 11: p = new Smoke(x, y, z, a, b, c, 1); break;
        case 12: p = new Smoke(x, y, z, a, b, c, 2.5); break;
        case 15: p = new Spell(x, y, z, a, b, c); break;
        case 18: p = new Drip(x, y, z); break;
        case 23: p = new Note(x, y, z, a); break;
        case 26: p = new Flame(x, y, z, a, b, c); break;
        case 27: p = new Lava(x, y, z); break;
        case 29: p = new Cloud(x, y, z, a, b, c); break;
        case 30: p = new Reddust(x, y, z, a, b, c); break;
        case 34: p = new Heart(x, y, z); break;
        case 36: { const t = tileOf(ITEM_TILE[data?.[0]]); if (t >= 0) p = new Iconcrack(x, y, z, a, b, c, t); break; }
        case 38: { const t = tileOf(BLOCK_TILE[(data?.[0] ?? 0) & 4095]); if (t >= 0) p = new Crumb(x, y, z, a, b, c, t, 0.6, true); break; }
        default: return;
      }
      if (p) W.spawn(p);
    }
    function particlesPacket([, , id, x, y, z, ox, oy, oz, sp, n, data]) {
      if (n === 0) spawnParticle(id, x, y, z, sp * ox, sp * oy, sp * oz, data);
      else for (let i = 0; i < n; i++) { const dx = gauss() * ox, dy = gauss() * oy, dz = gauss() * oz, a = gauss() * sp, b = gauss() * sp, c = gauss() * sp; spawnParticle(id, x + dx, y + dy, z + dz, a, b, c, data); }
    }
    function blockBreak(x, y, z, state) { // RenderGlobal.playAuxSFX 2001 / EffectRenderer.addBlockDestroyEffects
      const id = state & 4095, t = tileOf(BLOCK_TILE[id]);
      if (t >= 0) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) for (let l = 0; l < 4; l++) {
        const dx = (j + 0.5) / 4, dy = (k + 0.5) / 4, dz = (l + 0.5) / 4;
        W.spawn(new Crumb(x + dx, y + dy, z + dz, dx - 0.5, dy - 0.5, dz - 0.5, t, 0.6, false));
      }
      const s = BREAK_SOUND[id]; if (s) sound(s[0], x + 0.5, y + 0.5, z + 0.5, (s[1] + 1) / 2, s[2] * 0.8);
    }

    // ---- fireworks (EntityFireworkStarterFX)
    function firework(x, y, z, mx, my, mz, explosions) {
      if (!explosions?.length) return;
      const st = { age: 0, max: explosions.length * 2 - 1, twinkle: explosions.some((e) => e.flicker), x, y, z };
      const far = listener.distanceToSquared(new THREE.Vector3(x, y, z)) >= 256;
      const spark = (sx, sy, sz, vx, vy, vz, colors, fade, trail, twinkle) => {
        const s = new Spark(sx, sy, sz, vx, vy, vz); s.a = 0.99; s.trail = trail; s.twinkle = twinkle;
        s.setColor(colors[randInt(colors.length)]);
        if (fade?.length) { const c = fade[randInt(fade.length)]; s.fade = [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
        W.spawn(s);
      };
      const ball = (speed, size, colors, fade, trail, twinkle) => {
        for (let i = -size; i <= size; i++) for (let j = -size; j <= size; j++) for (let k = -size; k <= size; k++) {
          const d1 = j + (rand() - rand()) * 0.5, d2 = i + (rand() - rand()) * 0.5, d3 = k + (rand() - rand()) * 0.5;
          const d4 = Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3) / speed + gauss() * 0.05;
          spark(x, y, z, d1 / d4 + mx, d2 / d4 + my, d3 / d4 + mz, colors, fade, trail, twinkle);
          if (i !== -size && i !== size && j !== -size && j !== size) k += size * 2 - 1;
        }
      };
      const shaped = (speed, pts, colors, fade, trail, twinkle, creeper) => {
        const d0 = pts[0][0], d1 = pts[0][1];
        spark(x, y, z, d0 * speed + mx, d1 * speed + my, mz, colors, fade, trail, twinkle);
        const f = rand() * Math.PI, d2 = creeper ? 0.034 : 0.34;
        for (let i = 0; i < 3; i++) {
          const d3 = f + i * Math.PI * d2; let d4 = d0, d5 = d1;
          for (let j = 1; j < pts.length; j++) {
            const d6 = pts[j][0], d7 = pts[j][1];
            for (let d8 = 0.25; d8 <= 1; d8 += 0.25) {
              let d9 = (d4 + (d6 - d4) * d8) * speed, d10 = (d5 + (d7 - d5) * d8) * speed;
              const d11 = d9 * Math.sin(d3); d9 *= Math.cos(d3);
              for (let d12 = -1; d12 <= 1; d12 += 2) spark(x, y, z, d9 * d12 + mx, d10 + my, d11 * d12 + mz, colors, fade, trail, twinkle);
            }
            d4 = d6; d5 = d7;
          }
        }
      };
      const burst = (colors, fade, trail, twinkle) => {
        const d0 = gauss() * 0.05, d1 = gauss() * 0.05;
        for (let i = 0; i < 70; i++) spark(x, y, z, mx * 0.5 + gauss() * 0.15 + d0, my * 0.5 + rand() * 0.5, mz * 0.5 + gauss() * 0.15 + d1, colors, fade, trail, twinkle);
      };
      const STAR = [[0, 1], [0.3455, 0.309], [0.9511, 0.309], [0.3795918367346939, -0.12653061224489795], [0.6122448979591837, -0.8040816326530612], [0, -0.35918367346938773]];
      const CREEPER = [[0, 0.2], [0.2, 0.2], [0.2, 0.6], [0.6, 0.6], [0.6, 0.2], [0.2, 0.2], [0.2, 0], [0.4, 0], [0.4, -0.6], [0.2, -0.6], [0.2, -0.4], [0, -0.4]];
      const fx = {
        dead: false, px: x, py: y, pz: z, x, y, z,
        update() {
          if (st.age === 0) {
            const large = explosions.length >= 3 || explosions.some((e) => e.type === 1);
            sound("fireworks." + (large ? "largeBlast" : "blast") + (far ? "_far" : ""), x, y, z, 20, 0.95 + rand() * 0.1);
          }
          if (st.age % 2 === 0 && st.age / 2 < explosions.length) {
            const e = explosions[st.age / 2], c = e.colors?.length ? e.colors : [0xffffff], f = e.fade || [], tr = !!e.trail, tw = !!e.flicker;
            if (e.type === 1) ball(0.5, 4, c, f, tr, tw);
            else if (e.type === 2) shaped(0.5, STAR, c, f, tr, tw, false);
            else if (e.type === 3) shaped(0.5, CREEPER, c, f, tr, tw, true);
            else if (e.type === 4) burst(c, f, tr, tw);
            else ball(0.25, 2, c, f, tr, tw);
            const o = new Overlay(x, y, z), k = c[0]; o.r = ((k >> 16) & 255) / 255; o.g = ((k >> 8) & 255) / 255; o.b = (k & 255) / 255; W.spawn(o);
          }
          st.age++;
          if (st.age > st.max) { if (st.twinkle) sound("fireworks." + (far ? "twinkle_far" : "twinkle"), x, y, z, 20, 0.9 + rand() * 0.15); fx.dead = true; }
        },
        quad() { return null; },
      };
      W.spawn(fx);
    }

    // ---- entities
    const scene3 = new THREE.Group(); root.add(scene3);
    function makeEnt(id, kind, type, x, y, z, yaw, pitch) {
      const e = {
        id, kind, type, x, y, z, px: x, py: y, pz: z, yaw, pitch, pyaw: yaw, ppitch: pitch, head: yaw, phead: yaw, body: 0, pbody: 0,
        mx: 0, my: 0, mz: 0, inc: 0, nx: x, ny: y, nz: z, nyaw: yaw, npitch: pitch, onGround: false, age: 0,
        meta: {}, eq: [null, null, null, null, null], ls: 0, pls: 0, la: 0, pla: 0, swingInt: 0, swinging: false, swing: 0, pswing: 0,
        hurt: 0, death: 0, health: 1, vehicle: null, rider: null, dead: false,
        g: new THREE.Group(),
      };
      e.swingAt = (pt) => { let d = e.swing - e.pswing; if (d < 0) d += 1; return e.pswing + d * pt; };
      scene3.add(e.g); ents.set(id, e); return e;
    }
    function setupLiving(e) {
      const corpse = new THREE.Group(); e.g.add(corpse); e.corpse = corpse;
      const bob = new THREE.Group(); corpse.add(bob); e.bobG = bob;
      e.model = e.kind === "player" ? bipedSkin(e, e.killer ? "cosmetics/skins/killer.png" : "cosmetics/skins/dummy.png", false) : MOB_MODEL[e.type]?.(e);
      if (!e.model) return;
      const mg = new THREE.Group(); const s = e.model.scale; mg.scale.setScalar(s); mg.position.y = 1.5078125 * s; mg.add(e.model.m); bob.add(mg); e.mg = mg;
      e.height = HEIGHT[e.kind === "player" ? "player" : e.type] || 1;
      if ((e.type === 30 || e.type === 78) && (e.meta["10"] & 16)) e.height = 0; // marker stands have no size
      else if ((e.type === 30 || e.type === 78) && e.small) e.height /= 2;
      e.mats = new Set(); e.model.m.traverse((o) => { if (o.material) e.mats.add(o.material); });
      refreshEquipment(e);
    }
    function refreshEquipment(e) {
      const mdl = e.model; if (!mdl) return;
      const small = (e.type === 30 || e.type === 78) && (e.meta["10"] & 1);
      if (mdl.held) { mdl.held.clear(); if (e.eq[0]) mdl.held.add(heldItem(e.eq[0], false)); }
      if (mdl.parts?.head) { const h = mdl.parts.head; if (h.userData.worn) h.remove(h.userData.worn); h.userData.worn = null; if (e.eq[4]) { const w = wornHead(e.eq[4], false); h.add(w); h.userData.worn = w; } }
      if (mdl.parts?.body) { // chestplate (LayerBipedArmor, ModelBiped inflated by 1, leather tinted)
        const b = mdl.parts.body; if (b.userData.armor) { for (const a of b.userData.armor) a.parent.remove(a); } b.userData.armor = null;
        const it = e.eq[3];
        if (it && it.id === 299) {
          const col = new THREE.Color(it.color != null ? it.color : 0xa06540), base = new THREE.MeshLambertMaterial({ map: tex("armor_leather_layer_1"), alphaTest: 0.1, color: col, side: THREE.DoubleSide }), over = emat("armor_leather_layer_1_overlay");
          const added = [];
          for (const m of [base, over]) {
            const bb = piece(b); cube(bb, m, 64, 32, 16, 16, [-4, 0, -2, 8, 12, 4], false, 1); added.push(bb);
            const ar = piece(mdl.parts.armR); cube(ar, m, 64, 32, 40, 16, [-3, -2, -2, 4, 12, 4], false, 1); added.push(ar);
            const al = piece(mdl.parts.armL); cube(al, m, 64, 32, 40, 16, [-1, -2, -2, 4, 12, 4], true, 1); added.push(al);
          }
          b.userData.armor = added;
        }
      }
      // small stands are "children": LayerCustomHead scales by 0.7 and moves 16px down,
      // LayerHeldItem moves 0.625 down, tips 20 degrees and halves, before the part's own turn.
      if (mdl.stand) {
        mdl.hl.scale.setScalar(small ? 0.7 : 1); mdl.hl.position.y = small ? -0.7 : 0;
        mdl.al.scale.setScalar(small ? 0.5 : 1); mdl.al.position.y = small ? -0.625 : 0; mdl.al.rotation.x = small ? 20 * D2R : 0;
      }
    }
    function nameRefresh(e) {
      const nm = e.meta["2"], show = e.meta["3"] === 1 && nm;
      if (e.tagText === (show ? nm : null)) return;
      if (e.tag) { e.g.remove(e.tag); e.tag = null; }
      e.tagText = show ? nm : null;
      if (show) { e.tag = nameTag(nm); e.g.add(e.tag); }
    }
    function objectModel(e, data) {
      if (e.type === 2) { e.itemG = new THREE.Group(); e.g.add(e.itemG); e.hover = rand() * Math.PI * 2; }
      else if (e.type === 50) { e.blockG = new THREE.Group(); e.g.add(e.blockG); modelsReady.then(() => { const b = blockMesh("tnt"); b.position.set(-0.5, -0.5, -0.5); e.blockG.add(b); e.tntMats = []; b.traverse((o) => { if (o.material) { o.material = o.material.clone(); e.tntMats.push(o.material); } }); }); e.fuse = 80; }
      else if (e.type === 70) { const id = data & 4095; e.blockG = new THREE.Group(); e.g.add(e.blockG); modelsReady.then(() => { const b = blockMesh(BLOCK_ITEM[id] || "gold_block"); b.position.set(-0.5, 0, -0.5); e.blockG.add(b); }); }
      else if (e.type === 76 || e.type === 62) { e.sprite = new THREE.Group(); e.g.add(e.sprite); const it = { id: e.type === 76 ? 401 : 344 }; const n = new THREE.Group(); n.scale.setScalar(0.5); const r = renderItemNode(it); r.scale.multiplyScalar(2); n.add(r); e.sprite.add(n); }
      else if (e.type === 78) { e.living = true; setupLiving(e); }
    }
    function setItemStack(e) {
      const it = e.meta["10"]; if (!it || !e.itemG) return;
      const key = JSON.stringify(it); if (e.itemKey === key) return; e.itemKey = key; e.itemG.clear();
      const node = renderItemNode(it), gui3d = node.userData.gui3d, n = it.n || 1;
      const copies = n > 48 ? 5 : n > 32 ? 4 : n > 16 ? 3 : n > 1 ? 2 : 1;
      e.copies = copies;
      for (let k = 0; k < copies; k++) {
        const c = k ? renderItemNode(it) : node;
        const w = new THREE.Group();
        if (gui3d) { if (k > 0) w.position.set((rand() * 2 - 1) * 0.15, (rand() * 2 - 1) * 0.15, (rand() * 2 - 1) * 0.15); w.scale.setScalar(0.5); }
        else w.position.z = k * 0.046875 * 1; // stacked flat copies (ground scale 1)
        w.add(c); e.itemG.add(w);
      }
      e.itemGui3d = gui3d;
    }
    function applyMeta(e, m) {
      Object.assign(e.meta, m);
      if (e.type === 30 || e.type === 78) { e.small = !!(e.meta["10"] & 1); if (e.model) e.height = e.meta["10"] & 16 ? 0 : e.small ? 0.9875 : 1.975; }
      if ("6" in m && e.living) { const h = m["6"]; if (h <= 0 && e.health > 0) e.health = 0; else if (h > 0) e.health = h; }
      if (e.type === 2) setItemStack(e);
      if (e.type === 76) e.fw = e.meta["8"]?.fw;
      if (e.living) { refreshEquipment(e); nameRefresh(e); }
      if (e.kind === "orb") {}
    }
    function setPos2(e, x, y, z, yaw, pitch) { // setPositionAndRotation2
      if (e.living) { e.nx = x; e.ny = y; e.nz = z; e.nyaw = yaw; e.npitch = pitch; e.inc = 3; }
      else { e.x = x; e.y = y; e.z = z; if (yaw != null) { e.yaw = yaw; e.pitch = pitch; } }
    }

    function handle(ev) {
      const op = ev[1];
      switch (op) {
        case "player": {
          const [, , id, x, y, z, yaw, pitch, killer] = ev;
          const e = makeEnt(id, "player", "player", x, y, z, yaw * B2D, pitch * B2D); e.living = true; e.killer = !!killer; e.sx = x; e.sy = y; e.sz = z;
          e.head = e.phead = e.yaw; e.body = e.pbody = 0; setupLiving(e); break;
        }
        case "mob": {
          const [, , id, type, x, y, z, yaw, pitch, headYaw, meta] = ev;
          const e = makeEnt(id, "mob", type, x, y, z, yaw * B2D, pitch * B2D); e.living = true; e.sx = x; e.sy = y; e.sz = z;
          e.head = e.phead = e.body = e.pbody = headYaw * B2D;
          Object.assign(e.meta, meta); e.small = type === 30 && !!(meta["10"] & 1); e.child = (type === 93 || type === 101 || type === 95) && (meta["12"] ?? 0) < 0;
          if (type === 94) { e.rv = 1 / (rand() + 1) * 0.2; e.srot = 0; e.spitch = e.pspitch = 0; e.tent = e.ptent = 0; }
          if (type === 93) { e.wing = e.pwing = 0; e.dest = e.pdest = 0; e.wingD = 1; }
          if (type === 101) { e.jumpTicks = 0; e.jumpDur = 0; }
          setupLiving(e); nameRefresh(e); break;
        }
        case "obj": {
          const [, , id, type, x, y, z, yaw, pitch, data, v] = ev;
          const e = makeEnt(id, "obj", type, x, y, z, yaw * B2D, pitch * B2D); e.sx = x; e.sy = y; e.sz = z;
          if (data > 0 || type === 2) { e.mx = v[0]; e.my = v[1]; e.mz = v[2]; }
          objectModel(e, data);
          if (type === 78) { e.head = e.phead = e.body = e.pbody = e.yaw; }
          break;
        }
        case "orb": {
          const [, , id, x, y, z, count] = ev;
          const e = makeEnt(id, "orb", "orb", x, y, z, 0, 0); e.sx = x; e.sy = y; e.sz = z; e.xp = count; e.color = 0;
          const i = count >= 2477 ? 10 : count >= 1237 ? 9 : count >= 617 ? 8 : count >= 307 ? 7 : count >= 149 ? 6 : count >= 73 ? 5 : count >= 37 ? 4 : count >= 17 ? 3 : count >= 7 ? 2 : count >= 3 ? 1 : 0;
          const t = tex("entity_experience_orb").clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25); t.offset.set((i % 4) * 0.25, 1 - 0.25 - Math.floor(i / 4) * 0.25);
          e.orbMat = new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 128 / 255, depthWrite: false });
          const s = new THREE.Sprite(e.orbMat); s.scale.set(0.3, 0.3, 1); s.center.set(0.5, 0.25); s.position.y = 0.1; e.g.add(s);
          break;
        }
        case "bolt": {
          const [, , id, x, y, z] = ev;
          const e = makeEnt(id, "bolt", "bolt", x, y, z, 0, 0); e.state = 2; e.boltLiving = randInt(3) + 1; e.vertex = Math.floor(rand() * 1e9);
          e.mesh = new THREE.Mesh(boltGeo(e.vertex), BOLT_MAT); e.g.add(e.mesh); break;
        }
        case "tp": {
          const [, , id, x, y, z, yaw, pitch, og] = ev; const e = ents.get(id); if (!e) break;
          e.sx = x; e.sy = y; e.sz = z; e.onGround = !!og;
          const cx = e.living ? e.nx : e.x, cy = e.living ? e.ny : e.y, cz = e.living ? e.nz : e.z;
          if (Math.abs(cx - x) < 0.03125 && Math.abs(cy - y) < 0.015625 && Math.abs(cz - z) < 0.03125) setPos2(e, cx, cy, cz, yaw * B2D, pitch * B2D);
          else setPos2(e, x, y, z, yaw * B2D, pitch * B2D);
          break;
        }
        case "mv": {
          const [, , id, dx, dy, dz, yaw, pitch, og] = ev; const e = ents.get(id); if (!e) break;
          e.sx += dx; e.sy += dy; e.sz += dz;
          const ya = yaw == null ? (e.living ? e.nyaw : e.yaw) : yaw * B2D, pi = pitch == null ? (e.living ? e.npitch : e.pitch) : pitch * B2D;
          setPos2(e, e.sx, e.sy, e.sz, ya, pi); e.onGround = !!og; break;
        }
        case "head": { const e = ents.get(ev[2]); if (e) e.head = ev[3] * B2D; break; }
        case "vel": { const e = ents.get(ev[2]); if (e) { e.mx = ev[3]; e.my = ev[4]; e.mz = ev[5]; } break; }
        case "meta": { const e = ents.get(ev[2]); if (e) applyMeta(e, ev[3]); break; }
        case "eq": { const e = ents.get(ev[2]); if (e) { e.eq[ev[3]] = ev[4]; refreshEquipment(e); } break; }
        case "status": {
          const e = ents.get(ev[2]); if (!e) break; const s = ev[3];
          if (s === 2 && e.living) { e.la = 1.5; e.hurt = 10; }
          else if (s === 3 && e.living) { e.health = 0; }
          else if (s === 17 && e.type === 76) firework(e.x, e.y, e.z, e.mx, e.my, e.mz, e.fw);
          else if (s === 1 && e.type === 101) { e.jumpDur = 10; e.jumpTicks = 0; runningParticles(e); }
          break;
        }
        case "anim": { const e = ents.get(ev[2]); if (e && ev[3] === 0) { if (!e.swinging || e.swingInt >= 3 || e.swingInt < 0) { e.swingInt = -1; e.swinging = true; } } break; }
        case "kill": for (const id of ev[2]) { const e = ents.get(id); if (e) { e.dead = true; scene3.remove(e.g); ents.delete(id); if (e.rider) e.rider.vehicle = null; if (e.vehicle) e.vehicle.rider = null; } } break;
        case "attach": {
          const e = ents.get(ev[2]); if (!e) break;
          if (e.vehicle) { e.vehicle.rider = null; e.vehicle = null; }
          const v = ev[3] >= 0 ? ents.get(ev[3]) : null;
          if (v) { e.vehicle = v; v.rider = e; }
          break;
        }
        case "p": particlesPacket(ev); break;
        case "snd": sound(ev[2], ev[3], ev[4], ev[5], ev[6], ev[7] / 63); break;
        case "wev": {
          const [, , id, x, y, z, d] = ev;
          if (id === 2001) blockBreak(x, y, z, d);
          else if (id === 1015) sound("mob.bat.takeoff", x + 0.5, y + 0.5, z + 0.5, 0.05, (rand() - rand()) * 0.2 + 1);
          break;
        }
        case "block": {
          const [, , x, y, z, st] = ev; const key = x + "," + y + "," + z;
          if (blocks[key]) { root.remove(blocks[key]); delete blocks[key]; }
          const id = st >> 4, meta = st & 15;
          if (id === 50) { // torch: meta 1-4 wall torch facing east/west/south/north (blockstate y 0/180/90/270)
            const g = new THREE.Group(); g.position.set(x, y, z);
            modelsReady.then(() => { const b = blockMesh("torch_wall"); b.position.set(-0.5, 0, -0.5); const w = new THREE.Group(); w.position.set(0.5, 0, 0.5); w.rotation.y = -([0, 0, 180, 90, 270][meta] || 0) * D2R; w.add(b); g.add(w); });
            root.add(g); blocks[key] = g;
          }
          break;
        }
      }
    }
    const blocks = {};
    function runningParticles(e) { // Entity.createRunningParticles on the floor block (grass/dirt crumbs)
      const t = tileOf("block_dirt"); if (t < 0) return;
      W.spawn(new Crumb(e.x + (rand() - 0.5) * 0.6, e.y + 0.1, e.z + (rand() - 0.5) * 0.6, -e.mx * 4, 1.5, -e.mz * 4, t, 0.6, true));
    }

    // ---- per tick
    function tickLiving(e) {
      e.px = e.x; e.py = e.y; e.pz = e.z; e.pls = e.ls; e.pla = e.la; e.pyaw = e.yaw; e.ppitch = e.pitch; e.phead = e.head; e.pbody = e.body; e.pswing = e.swing;
      if (e.inc > 0) {
        e.x += (e.nx - e.x) / e.inc; e.y += (e.ny - e.y) / e.inc; e.z += (e.nz - e.z) / e.inc;
        e.yaw += wrap(e.nyaw - e.yaw) / e.inc; e.pitch += (e.npitch - e.pitch) / e.inc; e.inc--;
      } else if (e.kind !== "player") { e.mx *= 0.98; e.my *= 0.98; e.mz *= 0.98; }
      // body yaw (EntityLivingBase.onUpdate / func_110146_f); armor stands keep body = yaw
      if (e.type === 30 || e.type === 78) e.body = e.yaw;
      else {
        const dx = e.x - e.px, dz = e.z - e.pz, f = dx * dx + dz * dz; let f1 = e.body;
        if (f > 0.0025000002) f1 = Math.atan2(dz, dx) * 180 / Math.PI - 90;
        if (e.swing > 0) f1 = e.yaw;
        e.body += wrap(f1 - e.body) * 0.3;
        let f2 = wrap(e.yaw - e.body); if (f2 < -75) f2 = -75; if (f2 >= 75) f2 = 75;
        e.body = e.yaw - f2; if (f2 * f2 > 2500) e.body += f2 * 0.2;
      }
      // swing (updateArmSwingProgress, 6 ticks)
      if (e.swinging) { e.swingInt++; if (e.swingInt >= 6) { e.swingInt = 0; e.swinging = false; } } else e.swingInt = 0;
      e.swing = e.swingInt / 6;
      if (e.hurt > 0) e.hurt--;
      if (e.health <= 0) { e.death++; if (e.death === 20) { for (let k = 0; k < 20; k++) W.spawn(new Explode(e.x + (rand() * 0.6 * 2 - 0.6), e.y + rand() * e.height, e.z + (rand() * 0.6 * 2 - 0.6), gauss() * 0.02, gauss() * 0.02, gauss() * 0.02)); e.g.visible = false; } }
      if (e.type === 94) { e.pspitch = e.spitch; e.ptent = e.tent; e.srot += e.rv; if (e.srot > Math.PI * 2) e.srot = Math.PI * 2; e.tent = Math.abs(Math.sin(e.srot)) * Math.PI * 0.25; e.spitch += (-90 - e.spitch) * 0.02; }
      if (e.type === 93) { e.pwing = e.wing; e.pdest = e.dest; e.dest = clamp(e.dest + (e.onGround ? -1 : 4) * 0.3, 0, 1); if (!e.onGround && e.wingD < 1) e.wingD = 1; e.wingD *= 0.9; e.wing += e.wingD * 2; }
      if (e.type === 101) { if (e.jumpTicks !== e.jumpDur) e.jumpTicks++; else if (e.jumpDur !== 0) { e.jumpTicks = 0; e.jumpDur = 0; } }
    }
    function limbs(e) {
      const dx = e.x - e.px, dz = e.z - e.pz; let f = Math.sqrt(dx * dx + dz * dz) * 4; if (f > 1) f = 1;
      e.la += (f - e.la) * 0.4; e.ls += e.la;
    }
    function tickObject(e) {
      e.px = e.x; e.py = e.y; e.pz = e.z; e.pyaw = e.yaw; e.ppitch = e.pitch;
      if (e.type === 2 || e.kind === "orb" || e.type === 50 || e.type === 70) {
        const grav = e.kind === "orb" ? 0.03 : 0.04;
        e.my -= grav;
        if (e.kind === "orb") { // pulled toward the nearest player within 8 blocks
          let best = null, bd = 64;
          for (const o of ents.values()) if (o.kind === "player" && o.health > 0) { const d = (o.x - e.x) ** 2 + (o.y + 1.62 - e.y) ** 2 + (o.z - e.z) ** 2; if (d < bd) { bd = d; best = o; } }
          if (best) { const dx = (best.x - e.x) / 8, dy = (best.y + 1.62 / 2 - e.y) / 8, dz = (best.z - e.z) / 8, d = Math.sqrt(dx * dx + dy * dy + dz * dz); let k = 1 - d; if (k > 0) { k *= k; e.mx += dx / d * k * 0.1; e.my += dy / d * k * 0.1; e.mz += dz / d * k * 0.1; } }
        }
        let dy = e.my; e.onGround = false;
        if (e.y >= 0 && e.y + dy < 0) { dy = -e.y; e.onGround = true; }
        e.x += e.mx; e.y += dy; e.z += e.mz; if (e.onGround) e.my = 0; // Block.onLanded
        const f = e.onGround ? 0.6 * 0.98 : 0.98;
        e.mx *= f; e.my *= 0.98; e.mz *= f;
        if (e.onGround) e.my *= e.kind === "orb" ? -0.9 : e.type === 50 ? -0.5 : e.type === 2 ? -0.5 : 0;
        if (e.type === 50) { e.fuse--; W.spawn(new Smoke(e.x, e.y + 0.5, e.z, 0, 0, 0)); }
        if (e.kind === "orb") e.color++;
      } else if (e.type === 76) { // EntityFireworkRocket
        e.mx *= 1.15; e.mz *= 1.15; e.my += 0.04; e.x += e.mx; e.y += e.my; e.z += e.mz;
        W.spawn(new Spark(e.x, e.y - 0.3, e.z, gauss() * 0.05, -e.my * 0.5, gauss() * 0.05));
      } else if (e.type === 62) { // thrown egg (EntityThrowable): gravity 0.03, drag 0.99
        e.x += e.mx; e.y += e.my; e.z += e.mz; e.mx *= 0.99; e.my *= 0.99; e.mz *= 0.99; e.my -= 0.03;
      }
      e.age++;
    }
    function tickBolt(e) {
      e.state--;
      if (e.state < 0) {
        if (e.boltLiving === 0) { e.g.visible = false; }
        else if (e.state < -randInt(10)) { e.boltLiving--; e.state = 1; e.vertex = Math.floor(rand() * 1e9); e.mesh.geometry.dispose(); e.mesh.geometry = boltGeo(e.vertex); }
      }
      if (e.state >= 0) flash = 2;
    }
    let flash = 0;
    function tick() {
      for (const e of [...ents.values()]) {
        if (e.vehicle) continue;
        update(e);
        for (let r = e.rider; r; r = r.rider) { update(r); ridePos(r.vehicle, r); }
      }
      for (const b of Object.values(batches)) b.tick(W);
      if (flash > 0) flash--;
    }
    function update(e) {
      if (e.kind === "bolt") tickBolt(e);
      else if (e.living) { tickLiving(e); e.age++; limbs(e); }
      else tickObject(e);
    }
    function ridePos(v, r) {
      if (v.type === 93) { r.x = v.x + 0.1 * Math.sin(v.body * D2R); r.y = v.y + (v.child ? 0.35 : 0.7) * 0.5; r.z = v.z - 0.1 * Math.cos(v.body * D2R); r.body = v.body; }
      else { r.x = v.x; r.y = v.y + (v.height || 0.9) * 0.75; r.z = v.z; }
      if (r.vehicle && r.kind !== "player") { r.nx = r.x; r.ny = r.y; r.nz = r.z; r.inc = 0; }
    }

    // ---- per frame
    const camPos = new THREE.Vector3();
    function draw(pt) {
      S.camera.getWorldPosition(camPos);
      for (const e of ents.values()) {
        const x = lerp(e.px, e.x, pt), y = lerp(e.py, e.y, pt), z = lerp(e.pz, e.z, pt);
        e.g.position.set(x, y, z);
        if (e.living && e.model) {
          const body = lerpAng(e.pbody, e.body, pt);
          e.g.rotation.y = -body * D2R;
          let zr = 0;
          if (e.death > 0) { let f = (e.death + pt - 1) / 20 * 1.6; f = Math.sqrt(f); if (f > 1) f = 1; zr = f * 90; }
          e.corpse.rotation.set(0, 0, -zr * D2R);
          if (e.model.squid) { // RenderSquid: translate 0.5, turn by the squid's own pitch, translate -1.2
            const p = lerp(e.pspitch, e.spitch, pt);
            e.corpse.position.y = 0.5; e.corpse.rotation.x = -p * D2R; e.bobG.position.y = -1.2;
          }
          if (e.model.corpse) e.model.corpse(e, pt, e.bobG);
          e.model.set(e, pt);
          const red = e.hurt > 0 || e.death > 0;
          if (red !== e.red) { e.red = red; for (const m of e.mats) { m.emissive?.setRGB(red ? 0.3 : 0, 0, 0); m.color.setScalar(red ? 0.7 : 1); } }
          if (e.tag) e.tag.position.y = e.height + 0.5 - (e.small ? e.height / 2 : 0);
        } else if (e.itemG) { // RenderEntityItem: bob and spin
          const age = e.age + pt, bob = Math.sin(age / 10 + e.hover) * 0.1 + 0.1;
          e.itemG.position.y = bob + 0.25 * (e.itemGui3d ? 1 : 1);
          e.itemG.rotation.y = age / 20 + e.hover;
        } else if (e.type === 50 && e.blockG) { // RenderTNTPrimed
          const f0 = e.fuse - pt + 1;
          let k = 1 - f0 / 10; k = clamp(k, 0, 1); k *= k; k *= k; const s = 1 + k * 0.3;
          e.blockG.position.y = 0.5; e.blockG.scale.setScalar(s);
          const white = Math.floor(e.fuse / 5) % 2 === 0, a = (1 - f0 / 100) * 0.8;
          for (const m of e.tntMats || []) { m.emissive.setScalar(white ? a : 0); }
        } else if (e.sprite) { // RenderSnowball: faces the camera
          e.sprite.quaternion.copy(S.camera.quaternion);
        } else if (e.kind === "orb") {
          const f8 = (e.color + pt) / 2, r = (Math.sin(f8) + 1) * 0.5, b = (Math.sin(f8 + 4.1887903) + 1) * 0.1;
          e.orbMat.color.setRGB(r, 1, b);
        }
      }
      for (const b of Object.values(batches)) b.draw(pt);
      S.flash(flash > 0 ? 1 : 0);
    }

    // ---- run: packets are handled at the start of the tick they arrived in
    const ev = data.ev; let k = 0, n = 0;
    const T0 = Math.floor((ev[0][0] - 60) / TICK) * TICK;
    return (t) => {
      const ms = T0 + t * 1000;
      while (T0 + n * TICK <= ms) {
        const until = T0 + n * TICK;
        while (k < ev.length && ev[k][0] <= until) handle(ev[k++]);
        tick(); n++;
      }
      const pt = clamp((ms - (T0 + (n - 1) * TICK)) / TICK, 0, 1);
      draw(pt);
    };
  }

  // RenderLightningBolt at the game's size: eight 16-block segments wandering
  // up to 5 blocks each, two branches, four nested additive shells.
  const BOLT_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45 * 0.3, 0.45 * 0.3, 0.5 * 0.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  function boltGeo(vertex) {
    const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const r0 = seeded(vertex + 1), ri = (n) => Math.floor(r0() * n);
    const ax = [], az = []; let d0 = 0, d1 = 0;
    for (let i = 7; i >= 0; i--) { ax[i] = d0; az[i] = d1; d0 += ri(11) - 5; d1 += ri(11) - 5; }
    const pos = [];
    for (let k1 = 0; k1 < 4; k1++) {
      const r1 = seeded(vertex + 1), rr = (n) => Math.floor(r1() * n);
      for (let j = 0; j < 3; j++) {
        const k = j > 0 ? 7 - j : 7, l = j > 0 ? k - 2 : 0;
        let d2 = ax[k] - d0, d3 = az[k] - d1;
        for (let i1 = k; i1 >= l; i1--) {
          const d4 = d2, d5 = d3;
          if (j === 0) { d2 += rr(11) - 5; d3 += rr(11) - 5; } else { d2 += rr(31) - 15; d3 += rr(31) - 15; }
          let w0 = 0.1 + k1 * 0.2, w1 = 0.1 + k1 * 0.2;
          if (j === 0) { w0 *= i1 * 0.1 + 1; w1 *= (i1 - 1) * 0.1 + 1; }
          const yb = i1 * 16, yt = (i1 + 1) * 16, C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
          for (let s = 0; s < 4; s++) {
            const a = C[s], b = C[(s + 1) % 4];
            const P = [[d2 + a[0] * w0, yb, d3 + a[1] * w0], [d2 + b[0] * w0, yb, d3 + b[1] * w0], [d4 + b[0] * w1, yt, d5 + b[1] * w1], [d4 + a[0] * w1, yt, d5 + a[1] * w1]];
            for (const q of [0, 1, 2, 0, 2, 3]) pos.push(...P[q]);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return g;
  }

  // Everything a recording can show, so a picture taken right away is complete.
  function preload(data) {
    const heads = data ? [...new Set((JSON.stringify(data).match(/"head":"[0-9a-f]+"/g) || []).map((x) => x.slice(8, -1)))].map((h) => `cosmetics/heads/${h}.png`) : [];
    return Promise.all([modelsReady, loadFont(), ...ALL_TEX.concat(DYES.map((d) => "item_dye_" + d), heads).map((n) => img(n).catch(() => {}))]);
  }
  return { build, preload };
}
