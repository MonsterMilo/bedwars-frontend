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
const imgCache = {}, TEX_H = {};
const KILLER_SKIN = "cosmetics/skins/killer.png", DUMMY_SKIN = "cosmetics/skins/dummy.png";
function img(name) {
  if (!imgCache[name]) imgCache[name] = new Promise((res, rej) => { const i = new Image(); i.onload = () => { TEX_H[name] = i.height; res(i); }; i.onerror = rej; i.src = name.includes("/") ? name : MC + name + ".png"; });
  return imgCache[name];
}
const ALL_TEX = ["entity_horse_white", "entity_horse_creamy", "entity_horse_chestnut", "entity_horse_brown", "entity_horse_black", "entity_horse_gray", "entity_horse_darkbrown", "entity_horse_markings_white", "entity_horse_markings_whitefield", "entity_horse_markings_whitedots", "entity_horse_markings_blackdots", "particles", "entity_sign", "explosion", "ascii", "entity_chicken", "entity_wolf", "entity_bat", "entity_squid", "entity_skeleton", "entity_steve", "entity_experience_orb", "armor_leather_layer_1", "armor_leather_layer_1_overlay", "armor_leather_layer_2", "armor_leather_layer_2_overlay", "entity_armorstand", "entity_cow", "entity_iron_golem", "entity_witch", "entity_guardian", "entity_guardian_beam", "block_fire_layer_0_strip",
  "rabbit_brown", "rabbit_white", "rabbit_black", "rabbit_white_splotched", "rabbit_gold", "rabbit_salt", "cosmetics/skins/killer.png", "cosmetics/skins/dummy.png",
  "item_iron_sword", "item_stick", "item_bone", "item_cookie", "item_gold_ingot", "item_beef_raw", "item_beef_cooked", "item_leather", "item_egg", "item_fireworks", "item_leather_chestplate",
  "block_gold_block", "block_pumpkin_side", "block_pumpkin_top", "block_pumpkin_face_off", "block_pumpkin_face_on", "block_torch_on", "block_anvil_base", "block_anvil_top_damaged_0", "block_redstone_block", "block_tnt_side", "block_tnt_top", "block_tnt_bottom", "block_dirt", "block_gravel", "entity_zombie", "entity_creeper", "entity_banner_base", "misc_enchanted_item_glint", "entity_wither_skeleton", "entity_zombie_pigman", "entity_zombie_villager", "entity_blaze", "entity_creeper_armor", "entity_snowman", "entity_enderman", "entity_enderman_eyes", "entity_villager_smith", "entity_villager_farmer", "entity_villager_librarian", "entity_villager_priest", "entity_villager_butcher", "entity_wither", "entity_wither_invulnerable", "entity_pig", "entity_endermite", "block_planks_oak", "block_lava_still", "entity_sheep", "entity_sheep_fur", "entity_dragon", "entity_dragon_eyes", "entity_minecart", "item_fireball",
  ...["iron", "gold", "diamond", "chainmail"].flatMap((m) => ["armor_" + m + "_layer_1", "armor_" + m + "_layer_2"])];
const matCache = {};
// Skin base layers are drawn solid, as the game makes them when it loads a skin
// (ImageBufferDownload.setAreaOpaque): a see-through pixel keeps its colour.
const OPAQUE = { alphaTest: 0, side: THREE.FrontSide };
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
  334: "item_leather", 344: "item_egg", 401: "item_fireworks", 385: "item_fireball", 299: "item_leather_chestplate", 300: "item_leather_leggings", 301: "item_leather_boots",
  276: "item_diamond_sword", 312: "item_diamond_leggings", 313: "item_diamond_boots", 314: "item_gold_helmet", 316: "item_gold_leggings", 399: "item_nether_star",
  400: "item_pumpkin_pie", 332: "item_snowball", "38:4": "block_flower_tulip_red", "38:6": "block_flower_tulip_white",
};
const DYES = ["black", "red", "green", "brown", "blue", "purple", "cyan", "silver", "gray", "pink", "lime", "yellow", "light_blue", "magenta", "orange", "white"];
const BLOCK_ITEM = { 41: "gold_block", 86: "pumpkin", 91: "lit_pumpkin", 46: "tnt", 145: "anvil" };
function itemTexName(it) { if (it.id === 351) return "item_dye_" + DYES[(it.d || 0) & 15]; return ITEM_TEX[it.id + ":" + (it.d || 0)] || ITEM_TEX[it.id]; }
// The block model an item or block uses: a baked "id:meta" model, or an older named one.
// Flowers and other flat blocks are drawn as flat items instead (ITEM_TEX).
function blockKey(id, d = 0) {
  if (ITEM_TEX[id + ":" + d]) return null;
  if (MODELS?.[id + ":" + d]) return id + ":" + d;
  if (MODELS?.[id + ":0"] && id !== 17 && id !== 18 && id !== 35 && id !== 159 && id !== 95 && id !== 171 && id !== 38) return id + ":0";
  return BLOCK_ITEM[id] || null;
}
// Item models baked from the game (models/item): "item#id:meta" holds a block item's elements
// (e) or a flat item's layers (flat), plus its third-person transform (tp).
const itemKey = (it) => "item#" + it.id + ":" + (it.d || 0);
const itemDef = (it) => MODELS?.[itemKey(it)];
const isBlockItem = (it) => (itemDef(it) ? !!itemDef(it).e : !!blockKey(it.id, it.d));

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
// An element's own turn (FaceBakery.rotatePart): about its origin, then, with
// "rescale", stretched across the turn so a 22.5/45 degree plane still spans the block.
function rotFn(r) {
  const o = new THREE.Vector3(...r.origin.map((v) => v / 16)), ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[r.axis];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax), r.angle * D2R);
  const f = r.rescale ? 1 / Math.cos((Math.abs(r.angle) === 22.5 ? 22.5 : 45) * D2R) : 1;
  const sc = new THREE.Vector3(...ax.map((a) => (a ? 1 : f)));
  return (p) => new THREE.Vector3(...p).sub(o).applyQuaternion(q).multiply(sc).add(o).toArray();
}
// Fire's texture is animated: 32 frames down a strip, one per tick, in this order.
const FIRE_ORDER = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
let fireTex = null;
function fireMat(o) {
  if (!fireTex) { fireTex = tex("block_fire_layer_0_strip").clone(); img("block_fire_layer_0_strip").then((i) => { fireTex.image = i; fireTex.needsUpdate = true; }); fireTex.repeat.set(1, (16 - 0.02) / 512); } // a hair inside the frame so the next frame's edge never shows
  return new THREE.MeshLambertMaterial({ map: fireTex, alphaTest: 0.1, ...o, side: THREE.DoubleSide });
}
// Enchantment glint. Items (RenderItem.renderEffect): two passes of the glint texture added on
// (blend SRC_COLOR, ONE; depth EQUAL) in colour 0x8040CC, texture matrix scale 8, translate by
// system time (3000 ms and 4873 ms loops) and turn -50 / +10 degrees, applied to the item's UVs
// in the blocks/items atlas. mc/atlas.json is that atlas as 1.8.9 stitches it from the vanilla
// textures (TextureMap + Stitcher). Worn armour (LayerArmorBase): scale 1/3, turn 30 - 60i,
// translate by ticks * (0.001 + 0.003i) * 20, colour (0.5, 0.25, 0.8) * 0.76, over the armour UVs.
const GLINT_U = { ms: { value: 0 }, ticks: { value: 0 } };
let ATLAS = null;
const atlasReady = fetch(MC + "atlas.json").then((r) => r.json()).then((j) => { ATLAS = j; }).catch(() => {});
const glintMats = {};
function glintMat(kind, pass, texName) {
  const spr = kind === "item" ? ATLAS?.s?.[texName] : null;
  const k = kind + pass + (spr ? spr.join(",") : ""); if (glintMats[k]) return glintMats[k];
  const map = tex("misc_enchanted_item_glint"); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearFilter;
  const W = ATLAS?.w || 512, H = ATLAS?.h || 512, [x, y, w, h] = spr || [0, 0, 16, 16];
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ms: GLINT_U.ms, ticks: GLINT_U.ticks, off: { value: new THREE.Vector2(x / W, y / H) }, sz: { value: new THREE.Vector2(w / W, h / H) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float ms; uniform float ticks; uniform vec2 off; uniform vec2 sz; varying vec2 vUv;
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      void main() {
        vec2 st = vec2(vUv.x, 1.0 - vUv.y), t; vec3 col; // GL texture space: t runs down the image
        ${kind === "item" ? `float f = ${pass ? "-mod(ms, 4873.0) / 4873.0 / 8.0" : "mod(ms, 3000.0) / 3000.0 / 8.0"};
        t = 8.0 * (rot(off + st * sz, radians(${pass ? "10.0" : "-50.0"})) + vec2(f, 0.0)); col = vec3(0.502, 0.251, 0.8);`
        : `t = (1.0 / 3.0) * rot(st + vec2(0.0, ticks * ${pass ? "0.004" : "0.001"} * 20.0), radians(${pass ? "-30.0" : "30.0"})); col = vec3(0.5, 0.25, 0.8) * 0.76;`}
        vec3 c = texture2D(map, vec2(t.x, 1.0 - t.y)).rgb * col; c = c * c; // SRC_COLOR, ONE adds src squared; near mid tones that step is about the same in linear light
        gl_FragColor = vec4(c, 1.0);
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthWrite: false, depthFunc: THREE.EqualDepth, transparent: true, side: THREE.DoubleSide,
  });
  return (glintMats[k] = m);
}
function addItemGlint(g) { // a glint pass over every mesh of the item, sharing its geometry and its atlas sprite
  const ms = []; g.traverse((o) => { if (o.isMesh && !o.userData.glint) ms.push(o); });
  for (const o of ms) for (const pass of [0, 1]) { const q = new THREE.Mesh(o.geometry, glintMat("item", pass, o.userData.tex)); q.userData.glint = true; q.renderOrder = 2 + pass; o.add(q); }
}
export function animateTextures(ticks) { GLINT_U.ms.value = performance.now(); GLINT_U.ticks.value = ticks; if (fireTex) fireTex.offset.y = 1 - (FIRE_ORDER[((ticks % 32) + 32) % 32] + 1) / 32 + 0.01 / 512; }
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
  const def = MODELS?.[name]; if (!def) return g;
  const els = Array.isArray(def) ? def : def.e;
  if (!Array.isArray(def) && (def.x || def.y)) { // blockstate turn about the block's centre
    const inner = blockMesh.raw(els, def.tint); const c = new THREE.Group(); c.position.set(0.5, 0.5, 0.5); c.rotation.order = "YXZ";
    c.rotation.set(-(def.x || 0) * D2R, -(def.y || 0) * D2R, 0); inner.position.set(-0.5, -0.5, -0.5); c.add(inner); g.add(c); return g;
  }
  return blockMesh.raw(els, def.tint, g);
}
blockMesh.raw = function (els, tint, g = new THREE.Group()) {
  const byTex = {};
  for (const e of els) {
    const a = e.from.map((v) => v / 16), b = e.to.map((v) => v / 16);
    let rotM = null;
    if (e.rot) {
      rotM = rotFn(e.rot);
    }
    for (const [dir, f] of Object.entries(e.faces)) {
      let P = FACE[dir](a, b); if (rotM) P = P.map(rotM);
      const [u0, v0, u1, v1] = f.uv.map((v) => v / 16);
      const C = [[u0, 1 - v0], [u1, 1 - v0], [u1, 1 - v1], [u0, 1 - v1]], k = (f.r || 0) / 90;
      const T = [0, 1, 2, 3].map((i) => C[(i - k + 4) % 4]);
      const key = f.t + (f.tint && tint != null ? "#" + tint : "");
      const L = byTex[key] || (byTex[key] = { pos: [], uv: [], t: f.t, tint: f.tint && tint != null ? tint : null });
      for (const i of [0, 3, 2, 0, 2, 1]) { L.pos.push(...P[i]); L.uv.push(...T[i]); }
    }
  }
  for (const L of Object.values(byTex)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(L.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(L.uv, 2));
    geo.computeVertexNormals();
    const o = { side: THREE.FrontSide }; if (L.tint != null) o.color = new THREE.Color(L.tint).convertSRGBToLinear();
    if (TRANSLUCENT.has(L.t)) { o.transparent = true; o.alphaTest = 0; o.depthWrite = false; }
    const mesh = new THREE.Mesh(geo, L.t === "fire_layer_0" ? fireMat(o) : emat("block_" + L.t, o)); mesh.userData.tex = "block_" + L.t; g.add(mesh);
  }
  return g;
};
const TRANSLUCENT = new Set(["ice", "slime", "glass_white", "glass_orange", "glass_magenta", "glass_light_blue", "glass_yellow", "glass_lime", "glass_pink", "glass_gray", "glass_silver", "glass_cyan", "glass_purple", "glass_blue", "glass_brown", "glass_green", "glass_red", "glass_black"]);

/* ------------------------------------------------------------ island toppers
   A topper is plain blocks (cosmetics/toppers/<id>.json: [ms, x, y, z, model, cull]),
   drawn the way the game draws blocks in the world: unlit, each face darkened by
   its direction (up 1, north/south 0.8, east/west 0.6, down 0.5) and by smooth
   lighting's corner shadows (a solid block next to a corner counts 0.2, air 1,
   four averaged). `cull` holds the faces the game hides because a neighbour covers
   them (bits: down, up, north, south, west, east, before the block's turn).
   Blocks show up at the moment they were placed in the preview. */
const CULL_ORDER = ["down", "up", "north", "south", "west", "east"];
const DIRV = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };
const SHADE = { up: 1, down: 0.5, north: 0.8, south: 0.8, west: 0.6, east: 0.6 };
const blockMatCache = {};
function blockMat(t, translucent) {
  const k = t + (translucent ? "#t" : "");
  if (!blockMatCache[k]) blockMatCache[k] = new THREE.MeshBasicMaterial({ map: tex("block_" + t), vertexColors: true, side: THREE.FrontSide,
    ...(translucent ? { transparent: true, depthWrite: false, alphaTest: 0 } : { alphaTest: 0.1 }) });
  return blockMatCache[k];
}
// Smooth lighting counts a block as solid when it is a whole cube that is not glass.
function aoSolid(key) {
  const d = MODELS?.[key]; if (!d) return false;
  const els = Array.isArray(d) ? d : d.e;
  if (els.length !== 1) return false;
  const e = els[0];
  if (e.from.some((v) => v !== 0) || e.to.some((v) => v !== 16)) return false;
  return !Object.values(e.faces).some((f) => /glass/.test(f.t));
}
let topKit = null; // the model kit, set once createRecFx runs (signs and skulls need it)
export function buildTopper(S, data) {
  const root = new THREE.Group(); S.item.add(root);
  const [W, , D] = data.size, ox = -(W - 1) / 2 - 0.5, oz = -(D - 1) / 2 - 0.5;
  const solid = new Set();
  for (const b of data.b) if (aoSolid(b[4])) solid.add(b[1] + "," + b[2] + "," + b[3]);
  // The ground is left out: it would darken the foot of every wall into a dark strip that reads as
  // a gap (the grass gets no matching corner shadow); the ground shadow already sits the build down.
  const occ = (x, y, z) => solid.has(x + "," + y + "," + z);
  const blocks = [];
  for (const [t, x, y, z, key, cull = 0] of data.b) {
    if (key.startsWith("tile#")) { const g = tileMesh(key.slice(5)); if (g) { g.position.x += x + ox; g.position.y += y; g.position.z += z + oz; root.add(g); } continue; }
    const def = MODELS?.[key]; if (!def) continue;
    const els = Array.isArray(def) ? def : def.e;
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-(def.x || 0) * D2R, -(def.y || 0) * D2R, 0, "YXZ"));
    const M = new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5));
    const byMat = {};
    for (const e of els) {
      const a = e.from.map((v) => v / 16), b2 = e.to.map((v) => v / 16);
      let rotM = null;
      if (e.rot) {
        rotM = rotFn(e.rot);
      }
      for (const [dir, f] of Object.entries(e.faces)) {
        if (f.c && cull & (1 << CULL_ORDER.indexOf(f.c))) continue;
        let P = FACE[dir](a, b2); if (rotM) P = P.map(rotM);
        P = P.map((p) => new THREE.Vector3(...p).applyMatrix4(M));
        // The face's direction after the turn, snapped to the nearest side.
        const n = new THREE.Vector3(...DIRV[dir]); if (e.rot) n.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...{ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[e.rot.axis]), e.rot.angle * D2R)); n.applyMatrix4(R);
        const axis = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : (Math.abs(n.y) > Math.abs(n.z) ? 1 : 2);
        const sgn = Math.sign(n.getComponent(axis)) || 1;
        const side = [["west", "east"], ["down", "up"], ["north", "south"]][axis][sgn > 0 ? 1 : 0];
        // UVs: the model's own, or worked out from where the face sits (uvlock), so the texture stays put when the block turns.
        let T;
        if (def.uvlock && (def.x || def.y)) {
          T = P.map((p) => { const { x: px, y: py, z: pz } = p; const uv = { down: [px, 1 - pz], up: [px, pz], north: [1 - px, 1 - py], south: [px, 1 - py], west: [pz, 1 - py], east: [1 - pz, 1 - py] }[side]; return [uv[0], 1 - uv[1]]; });
        } else {
          const [u0, v0, u1, v1] = f.uv.map((v) => v / 16);
          const C = [[u0, 1 - v0], [u1, 1 - v0], [u1, 1 - v1], [u0, 1 - v1]], k = (f.r || 0) / 90;
          T = [0, 1, 2, 3].map((i) => C[(i - k + 4) % 4]);
        }
        // Corner shadows: the layer of blocks the face looks into (the neighbour when the face is flush, else the block's own layer).
        const flush = P.every((p) => Math.abs(p.getComponent(axis) - (sgn > 0 ? 1 : 0)) < 1e-4);
        const L = [x, y, z]; if (flush) L[axis] += sgn;
        const [ta, tb] = [0, 1, 2].filter((k2) => k2 !== axis);
        const at = (da, db) => { const q = L.slice(); q[ta] += da; q[tb] += db; return occ(q[0], q[1], q[2]) ? 0.2 : 1; };
        const corner = (sa, sb) => { const s1 = at(sa, 0), s2 = at(0, sb), c = s1 < 1 && s2 < 1 ? 0.2 : at(sa, sb); return (s1 + s2 + c + at(0, 0)) / 4; };
        const c00 = corner(-1, -1), c10 = corner(1, -1), c01 = corner(-1, 1), c11 = corner(1, 1);
        const sh = SHADE[side] * (e.shade === false ? 1 / SHADE[side] : 1);
        const tint = f.tint && def.tint != null ? new THREE.Color(def.tint) : new THREE.Color(1, 1, 1);
        const cols = P.map((p) => {
          const u = clamp(p.getComponent(ta), 0, 1), v = clamp(p.getComponent(tb), 0, 1);
          const ao = c00 * (1 - u) * (1 - v) + c10 * u * (1 - v) + c01 * (1 - u) * v + c11 * u * v, k2 = sh * ao;
          return [tint.r * k2, tint.g * k2, tint.b * k2].map((c) => Math.pow(c, 2.2)); // the game multiplies in screen colours
        });
        const translucent = TRANSLUCENT.has(f.t), mk = f.t + (translucent ? "#t" : "");
        const G = byMat[mk] || (byMat[mk] = { pos: [], uv: [], col: [], t: f.t, translucent });
        for (const i of [0, 3, 2, 0, 2, 1]) { G.pos.push(P[i].x, P[i].y, P[i].z); G.uv.push(...T[i]); G.col.push(...cols[i]); }
      }
    }
    const g = new THREE.Group(); g.position.set(x + ox, y, z + oz);
    for (const G of Object.values(byMat)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(G.pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(G.uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(G.col, 3));
      const m = new THREE.Mesh(geo, blockMat(G.t, G.translucent)); if (G.translucent) m.renderOrder = 1; g.add(m);
    }
    root.add(g); blocks.push([t / 1000, g]);
  }
  // Soft shadows on the grass: every block standing on the ground (or just above it)
  // darkens the grass around it, fading out over about a block. Glass casts a lighter one.
  const gpos = [], gcol = [], cast = new Map();
  for (const bl of data.b) {
    const [, x, y, z, key] = bl; if (y > 1 || key.startsWith("tile#")) continue;
    const d = MODELS?.[key]; if (!d) continue;
    const els = Array.isArray(d) ? d : d.e;
    const area = Math.max(0, ...els.map((e) => (e.to[0] - e.from[0]) * (e.to[2] - e.from[2]) / 256));
    if (area < 0.2) continue; // torches, flowers, grass
    const glass = els.some((e) => Object.values(e.faces).some((f) => /glass|ice/.test(f.t)));
    const low = els.some((e) => e.from[1] === 0);
    const w = (glass ? 0.35 : 1) * (y === 0 ? (low ? 1 : 0.8) : 0.45) * Math.min(1, 0.4 + area);
    const k = x + "," + z; cast.set(k, Math.max(cast.get(k) || 0, w));
  }
  if (cast.size) {
    const R = 1.0, N = 4, cs = [...cast].map(([k, w]) => [...k.split(",").map(Number), w]);
    const x0 = Math.min(...cs.map((c) => c[0])) - 2, x1 = Math.max(...cs.map((c) => c[0])) + 3, z0 = Math.min(...cs.map((c) => c[1])) - 2, z1 = Math.max(...cs.map((c) => c[1])) + 3;
    const W = (x1 - x0) * N + 1, H = (z1 - z0) * N + 1, A = new Float32Array(W * H);
    for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
      const px = x0 + i / N, pz = z0 + j / N; let sh = 0;
      for (const [cx, cz, w] of cs) {
        const dx = Math.max(cx - px, 0, px - cx - 1), dz = Math.max(cz - pz, 0, pz - cz - 1), d = Math.hypot(dx, dz);
        if (d < R) { const f = 1 - d / R; sh = Math.max(sh, w * f); } // fades over a block like the game's corner shading
      }
      A[i * H + j] = sh;
    }
    for (let i = 0; i < W - 1; i++) for (let j = 0; j < H - 1; j++) {
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      if (q.every(([a, b]) => A[a * H + b] < 0.005)) continue;
      for (const n of [0, 3, 2, 0, 2, 1]) { const [a, b] = q[n]; gpos.push(x0 + a / N + ox, 0.004, z0 + b / N + oz); gcol.push(0, 0, 0, A[a * H + b] * 0.4); } // smooth lighting darkens the grass at a wall's foot to about 0.6
    }
  }
  if (gpos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(gpos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(gcol, 4));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    root.add(m);
  }
  // The whole build is shown at once (no building animation).
  const run = () => {};
  run.focus = () => new THREE.Vector3(0, data.size[1] / 2, 0);
  return run;
}
// Blocks the game draws as tile entities. The server sends no data for them in
// the preview, so the client shows its defaults: a skeleton skull turned 0, a blank sign.
function tileMesh(k) {
  if (!topKit) return null;
  const [kind, arg] = k.split(","), n = +(arg || "=0").split("=")[1];
  const g = new THREE.Group();
  if (kind === "skull") {
    // TileEntitySkullRenderer: on the floor translate(.5, 0, .5); on a wall pushed toward the wall and up .25
    const f = n, wall = { 2: [0.5, 0.25, 0.74, 0], 3: [0.5, 0.25, 0.26, 180], 4: [0.74, 0.25, 0.5, 270], 5: [0.26, 0.25, 0.5, 90] }[f];
    g.position.set(...(wall ? wall.slice(0, 3) : [0.5, 0, 0.5]));
    const s2 = new THREE.Group(); s2.scale.set(-1, -1, 1); g.add(s2);
    const r = new THREE.Group(); r.rotation.y = wall ? wall[3] * D2R : 0; s2.add(r);
    const fix = new THREE.Group(); fix.scale.set(1, -1, -1); r.add(fix); fix.add(headMesh(topKit, { id: 397, d: 0 }));
    return g;
  }
  if (kind === "sign") {
    // TileEntitySignRenderer (wall sign): board only, turned by facing, scale 2/3
    const wall = arg.startsWith("wall"), f = wall ? ({ 2: 180, 3: 0, 4: 90, 5: -90 }[n] ?? 0) : n * 360 / 16;
    g.position.set(0.5, 0.5, 0.5); g.rotation.y = -f * D2R;
    const t = new THREE.Group(); if (wall) t.position.set(0, -0.3125, -0.4375); g.add(t);
    const sc = new THREE.Group(); sc.scale.setScalar(2 / 3); t.add(sc);
    const m = emat("entity_sign", OPAQUE);
    topKit.cube(sc, m, 64, 32, 0, 0, [-12, -14, -1, 24, 12, 2]);
    if (!wall) topKit.cube(sc, m, 64, 32, 0, 14, [-1, -2, -1, 2, 14, 2]);
    return g;
  }
  return null;
}
export function preloadTopper(data) {
  return modelsReady.then(() => { const t = new Set(); for (const b of data.b) { const d = MODELS[b[4]]; if (d) for (const e of (Array.isArray(d) ? d : d.e || [])) for (const f of Object.values(e.faces)) t.add("block_" + f.t); } return Promise.all([...t].map((n) => img(n).catch(() => {}))); });
}

/* ------------------------------------------------------------ heads
   TileEntitySkullRenderer: an 8x8x8 head (and the 0.25 inflated hat layer for
   player heads), bottom at the origin, face toward -z in model space. */
function headMesh(kit, it) {
  const g = new THREE.Group();
  if (it.id === 397 && (it.d || 0) === 0) { // skeleton skull, 64x32
    const m = emat("entity_skeleton"); kit.cube(g, m, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8]);
  } else if (it.id === 397 && it.d === 2) { // zombie head: ModelHumanoidHead, 64x64, with the hat layer
    const m = emat("entity_zombie"); kit.cube(g, m, 64, 64, 0, 0, [-4, -8, -4, 8, 8, 8]); kit.cube(g, m, 64, 64, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.25);
  } else if (it.id === 397 && it.d === 4) { // creeper head, 64x32
    const m = emat("entity_creeper"); kit.cube(g, m, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8]);
  } else {
    const name = it.head ? `cosmetics/heads/${it.head}.png` : "entity_steve";
    const m = emat(name), base = emat(name, OPAQUE), th = TEX_H[name] || 64; // older skins are 64x32
    kit.cube(g, base, 64, th, 0, 0, [-4, -8, -4, 8, 8, 8]);
    kit.cube(g, m, 64, th, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.25);
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
class Portal extends FX { // EntityPortalFX (portal, 24): pulled back in from where it starts
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, mx, my, mz, true); this.mx = mx; this.my = my; this.mz = mz; this.ox = x; this.oy = y; this.oz = z;
    const f = rand() * 0.6 + 0.4; this.base = this.scale = rand() * 0.2 + 0.5; this.r = 0.9 * f; this.g = 0.3 * f; this.b = f;
    this.maxAge = Math.floor(rand() * 10) + 40; this.noClip = true; this.tex = Math.floor(rand() * 8);
  }
  update() {
    this.prev(); const f = this.age / this.maxAge, f1 = 1 - (-f + f * f * 2);
    this.x = this.ox + this.mx * f1; this.y = this.oy + this.my * f1 + (1 - f); this.z = this.oz + this.mz * f1;
    if (this.age++ >= this.maxAge) this.dead = true;
  }
  size(pt) { let f = (this.age + pt) / this.maxAge; f = 1 - f; f *= f; f = 1 - f; return 0.1 * this.base * f; }
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
class Aura extends FX { // EntityAuraFX as happyVillager (21): a slow green spark
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, mx, my, mz, true); const f = rand() * 0.1 + 0.2; this.r = this.g = this.b = f; this.tex = 0;
    this.scale *= rand() * 0.6 + 0.5; this.mx *= 0.02; this.my *= 0.02; this.mz *= 0.02; this.maxAge = Math.floor(20 / (rand() * 0.8 + 0.2)); this.noClip = true;
  }
  update() { this.prev(); this.move(this.mx, this.my, this.mz); this.mx *= 0.99; this.my *= 0.99; this.mz *= 0.99; if (this.maxAge-- <= 0) this.dead = true; }
}
class SnowShovel extends FX { // EntitySnowShovelFX (snowshovel, 32)
  constructor(x, y, z, mx, my, mz) {
    super(x, y, z, 0, 0, 0, true); this.mx = this.mx * 0.1 + mx; this.my = this.my * 0.1 + my; this.mz = this.mz * 0.1 + mz;
    this.r = this.g = this.b = 1 - rand() * 0.3; this.scale *= 0.75; this.base = this.scale; this.maxAge = Math.floor(8 / (rand() * 0.8 + 0.2));
  }
  update() { this.prev(); if (this.age++ >= this.maxAge) this.dead = true; this.tex = 7 - Math.floor(this.age * 8 / this.maxAge); this.my -= 0.03; this.move(this.mx, this.my, this.mz); this.mx *= 0.99; this.my *= 0.99; this.mz *= 0.99; if (this.onGround) { this.mx *= 0.7; this.mz *= 0.7; } }
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
class Drip extends FX { // EntityDropParticleFX, water (dripWater, 18) or lava (dripLava, 19)
  constructor(x, y, z, lava = false) { super(x, y, z, 0, 0, 0, true); this.lava = lava; this.mx = this.my = this.mz = 0; this.r = lava ? 1 : 0; this.g = 0; this.b = lava ? 0 : 1; this.tex = 113; this.grav = 0.06; this.bob = lava ? 40 : 40; this.maxAge = Math.floor(64 / (rand() * 0.8 + 0.2)); this.hw = 0.005; }
  update(w) {
    this.prev();
    if (this.lava) { this.r = 1; this.g = 16 / (40 - this.bob + 16); this.b = 4 / (40 - this.bob + 8); } else { this.r = 0.2; this.g = 0.3; this.b = 1; }
    this.my -= this.grav;
    if (this.bob-- > 0) { this.mx *= 0.02; this.my *= 0.02; this.mz *= 0.02; this.tex = 113; } else this.tex = 112;
    this.move(this.mx, this.my, this.mz); this.mx *= 0.98; this.my *= 0.98; this.mz *= 0.98;
    if (this.maxAge-- <= 0) this.dead = true;
    if (this.onGround) { if (this.lava) { this.tex = 114; } else { this.dead = true; w.spawn(new Splash(this.x, this.y, this.z, 0, 0, 0)); } this.mx *= 0.7; this.mz *= 0.7; }
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
  const kit = makeModelKit(kit0.setBoxUV); topKit = kit;
  const { cube, piece, setRP, rot } = kit;

  // Tile sheet for block/item crumbs (16px tiles, built once from single pictures).
  const TILES = ["block_redstone_block", "block_pumpkin_side", "block_dirt", "block_gravel", "item_egg", "block_gold_block", "block_anvil_base", "item_snowball", "block_ice", "block_glass_white", "block_wool_colored_red", "block_ice_packed", "block_planks_oak", "block_lava_still"];
  const tileCanvas = document.createElement("canvas"); tileCanvas.width = 256; tileCanvas.height = 256;
  const tileTex = new THREE.CanvasTexture(tileCanvas); tileTex.magFilter = tileTex.minFilter = THREE.NearestFilter; tileTex.colorSpace = THREE.SRGBColorSpace; tileTex.generateMipmaps = false;
  Promise.all(TILES.map((n) => img(n))).then((ims) => { const g = tileCanvas.getContext("2d"); ims.forEach((im, i) => g.drawImage(im, 0, 0, 16, 16, (i % 16) * 16, Math.floor(i / 16) * 16, 16, 16)); tileTex.needsUpdate = true; });
  const tileOf = (name) => TILES.indexOf(name);
  const BLOCK_TILE = { 26: "block_planks_oak", 10: "block_lava_still", 11: "block_lava_still", 152: "block_redstone_block", 86: "block_pumpkin_side", 41: "block_gold_block", 2: "block_dirt", 3: "block_dirt", 13: "block_gravel", 145: "block_anvil_base", 79: "block_ice", 174: "block_ice_packed", "95:0": "block_glass_white", "35:14": "block_wool_colored_red" };
  const ITEM_TILE = { 344: "item_egg", 332: "item_snowball", 79: "block_ice", 174: "block_ice_packed", 95: "block_glass_white" };
  const BREAK_SOUND = { 26: ["dig.wood", 1, 1], 10: ["dig.stone", 1, 1], 11: ["dig.stone", 1, 1], 152: ["dig.stone", 1, 1], 86: ["dig.wood", 1, 1], 41: ["dig.stone", 1, 1], 95: ["dig.glass", 1, 1], 79: ["dig.glass", 1, 1], 174: ["dig.stone", 1, 1], 35: ["dig.cloth", 1, 1] };

  // ---- held / worn items -------------------------------------------------
  // Banners (TileEntityBannerRenderer as an item: standing, at the block's centre, 2/3 size).
  // The texture is LayeredColorMaskTexture: banner_base, then each layer's mask (its blue channel
  // as alpha) laid over it in the base texture's colour times the dye's map colour.
  const DYE_MAP = [0x191919, 0x993333, 0x667f33, 0x664c33, 0x334cb2, 0x7f3fb2, 0x4c7f99, 0x999999, 0x4c4c4c, 0xf27fa5, 0x7fcc19, 0xe5e533, 0x6699d8, 0xb24cd8, 0xd87f33, 0xffffff]; // by dye damage
  const PATTERN = { b: "base", bl: "square_bottom_left", br: "square_bottom_right", tl: "square_top_left", tr: "square_top_right", bs: "stripe_bottom", ts: "stripe_top", ls: "stripe_left", rs: "stripe_right", cs: "stripe_center", ms: "stripe_middle", drs: "stripe_downright", dls: "stripe_downleft", ss: "small_stripes", cr: "cross", sc: "straight_cross", bt: "triangle_bottom", tt: "triangle_top", bts: "triangles_bottom", tts: "triangles_top", ld: "diagonal_left", rd: "diagonal_up_right", lud: "diagonal_up_left", rud: "diagonal_right", mc: "circle", mr: "rhombus", vh: "half_vertical", hh: "half_horizontal", vhr: "half_vertical_right", hhb: "half_horizontal_bottom", bo: "border", cbo: "curly_border", cre: "creeper", gra: "gradient", gru: "gradient_up", bri: "bricks", sku: "skull", flo: "flower", moj: "mojang" };
  const bannerTexCache = {};
  function bannerTex(base, pats) {
    const key = JSON.stringify([base, pats]); if (bannerTexCache[key]) return bannerTexCache[key];
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    const layers = [["b", base], ...pats.slice(0, 6)];
    Promise.all([img("entity_banner_base"), ...layers.map(([p]) => img("banner_" + (PATTERN[p] || "base")))]).then(([bi, ...masks]) => {
      const g = c.getContext("2d"); g.drawImage(bi, 0, 0, 64, 64);
      const B = g.getImageData(0, 0, 64, 64).data.slice();
      const tmp = document.createElement("canvas"); tmp.width = 64; tmp.height = 64; const tg = tmp.getContext("2d");
      masks.forEach((mi, k) => {
        tg.clearRect(0, 0, 64, 64); tg.drawImage(mi, 0, 0, 64, 64); const M = tg.getImageData(0, 0, 64, 64), d = M.data, col = DYE_MAP[layers[k][1] & 15];
        const cr = col >> 16 & 255, cg = col >> 8 & 255, cb = col & 255;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) { d[i + 3] = 0; continue; }
          const a = d[i + 2]; d[i] = B[i] * cr / 255 | 0; d[i + 1] = B[i + 1] * cg / 255 | 0; d[i + 2] = B[i + 2] * cb / 255 | 0; d[i + 3] = a;
        }
        tg.putImageData(M, 0, 0); g.drawImage(tmp, 0, 0);
      });
      t.needsUpdate = true;
    }).catch(() => {});
    return (bannerTexCache[key] = t);
  }
  function bannerMesh(it) {
    const [base, pats] = it.banner || [it.d || 0, []];
    const m = new THREE.MeshLambertMaterial({ map: bannerTex(base, pats), alphaTest: 0.1, side: THREE.DoubleSide });
    // ModelBanner (64x64): slate swung by its rotation point at y -32, stand, top bar; rendered at 1/16.
    const g = new THREE.Group();
    const slate = kit.piece(g, [0, -32, 0]); slate.rotation.x = (-0.0125 + 0.01) * Math.PI; // cos(0): the item has no world time
    kit.cube(slate, m, 64, 64, 0, 0, [-10, 0, -2, 20, 40, 1]);
    kit.cube(g, m, 64, 64, 44, 0, [-1, -30, -1, 2, 42, 2]);
    kit.cube(g, m, 64, 64, 0, 42, [-10, -32, -1, 20, 2, 2]);
    return g;
  }
  function itemMesh(it, onReady) { // returns a Group holding the model in 0..1 item space, centred later
    const g = new THREE.Group();
    if (it.id === 425) { g.add(bannerMesh(it)); g.userData.gui3d = true; g.userData.builtin = true; return g; }
    const def = itemDef(it);
    if (def?.e) { g.add(blockMesh(itemKey(it))); if (it.glint) addItemGlint(g); g.userData.gui3d = true; return g; }
    if (def?.flat) { // layer0, layer1... drawn over each other, each tinted as the item colours it
      let left = def.flat.length;
      def.flat.forEach((nm, n) => flatItemGeo(nm).then((geo) => {
        const tn = def.tints?.[n];
        const m = new THREE.MeshLambertMaterial({ map: tex(nm), alphaTest: 0.1, color: tn != null ? new THREE.Color(tn) : 0xffffff, polygonOffset: n > 0, polygonOffsetFactor: -n, polygonOffsetUnits: -n });
        const mesh = new THREE.Mesh(geo, m); mesh.userData.tex = nm; g.add(mesh); if (--left === 0) { if (it.glint) addItemGlint(g); onReady?.(); }
      }));
      return g;
    }
    const block = blockKey(it.id, it.d);
    if (block) { modelsReady.then(() => g.add(blockMesh(block))); g.userData.gui3d = true; return g; }
    if (it.id === 397) { const h = headMesh(kit, it); h.userData.skull = true; g.add(h); g.userData.gui3d = true; g.userData.skull = true; return g; }
    const name = itemTexName(it); if (!name) return g;
    flatItemGeo(name).then((geo) => {
      let m = emat(name);
      if (it.id >= 298 && it.id <= 301) { // leather armour piece: tinted base (layer0) with the untinted overlay (layer1) on top
        const c = new THREE.Color(it.color != null ? it.color : 0xa06540);
        m = new THREE.MeshLambertMaterial({ map: tex(name), alphaTest: 0.1, color: c });
        flatItemGeo(name + "_overlay").then((g2) => g.add(new THREE.Mesh(g2, emat(name + "_overlay")))).catch(() => {});
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
    } else if (m.userData.builtin) { // banner: rotate 180, translate(-.5,-.5,-.5), then translate(.5, .75 * 2/3, .5), scale(2/3, -2/3, -2/3)
      const r = new THREE.Group(); r.rotation.y = Math.PI; outer.add(r);
      const s = new THREE.Group(); s.position.set(-0.5, -0.5, -0.5); r.add(s);
      const b = new THREE.Group(); b.position.set(0.5, 0.75 * 2 / 3, 0.5); b.scale.set(2 / 3, -2 / 3, -2 / 3); s.add(b);
      const fix = new THREE.Group(); fix.scale.set(1, -1, -1); b.add(fix); fix.add(m);
      outer.userData.builtin = true;
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
  const HANDHELD = new Set([267, 276, 280, 352]);
  // LayerHeldItem on a biped's right arm (the arm group already holds the arm's pivot and turn).
  function heldItem(it, child) {
    // GL space of the arm (y down, z forward as in model space). Build in GL axes then flip with (1,-1,-1).
    const gl = new THREE.Group(); gl.scale.set(1, -1, -1);
    let p = gl;
    if (child) { const c = new THREE.Group(); c.position.set(0, 0.625, 0); c.rotation.x = 20 * D2R; c.scale.setScalar(0.5); p.add(c); p = c; }
    const t = new THREE.Group(); t.position.set(-0.0625, 0.4375, 0.0625); p.add(t); p = t;
    const node = renderItemNode(it), gui3d = node.userData.gui3d;
    // only blocks drawn as tile entities (render type 2: chests) get this extra turn and shrink
    if (it.id === 54 || it.id === 130 || it.id === 146) { const b = new THREE.Group(); b.position.set(0, 0.1875, -0.3125); b.rotation.order = "XYZ"; b.rotation.set(20 * D2R, 45 * D2R, 0); b.scale.set(-0.375, -0.375, 0.375); p.add(b); p = b; }
    const pre = new THREE.Group(); pre.scale.setScalar(gui3d ? (isBlockItem(it) || node.userData.builtin || it.id === 397 ? 2 : 1) : 2); p.add(pre); // ItemRenderer 2x for blocks and built-in models (skulls: BuiltInModel.isGui3d is true), preTransform 2x for flat items
    const tp = itemDef(it)?.tp;
    const tr = it.id === 425 ? [[0, 90, -90], [0, 0, -4], 0.5] : tp ? tp : it.id === 397 ? THIRD.skull : blockKey(it.id, it.d) ? THIRD.block : HANDHELD.has(it.id) ? THIRD.handheld : THIRD.generated;
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
      const node0 = renderItemNode(it);
      const two = new THREE.Group(); two.scale.setScalar(isBlockItem(it) || node0.userData.builtin ? 2 : 1); t.add(two);
      const node = node0; if (!node.userData.gui3d) node.scale.multiplyScalar(2); two.add(node);
    }
    return gl;
  }

  // ---- living models -----------------------------------------------------
  // Each returns {m (model group in the corpse group), set(e, pt) poses it}.
  function bipedSkin(e, skinTex, slim) {
    const mat = emat(skinTex), baseM = emat(skinTex, OPAQUE);
    const m = new THREE.Group();
    const head = piece(m); cube(head, baseM, 64, 64, 0, 0, [-4, -8, -4, 8, 8, 8]); cube(head, mat, 64, 64, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.5);
    const body = piece(m); cube(body, baseM, 64, 64, 16, 16, [-4, 0, -2, 8, 12, 4]); cube(body, mat, 64, 64, 16, 32, [-4, 0, -2, 8, 12, 4], false, 0.25);
    const aw = slim ? 3 : 4;
    const armR = piece(m, [-5, slim ? 2.5 : 2, 0]); cube(armR, baseM, 64, 64, 40, 16, [-3 + (slim ? 1 : 0), -2, -2, aw, 12, 4]); cube(armR, mat, 64, 64, 40, 32, [-3 + (slim ? 1 : 0), -2, -2, aw, 12, 4], false, 0.25);
    const armL = piece(m, [5, slim ? 2.5 : 2, 0]); cube(armL, baseM, 64, 64, 32, 48, [-1, -2, -2, aw, 12, 4]); cube(armL, mat, 64, 64, 48, 48, [-1, -2, -2, aw, 12, 4], false, 0.25);
    const legR = piece(m, [-1.9, 12, 0]); cube(legR, baseM, 64, 64, 0, 16, [-2, 0, -2, 4, 12, 4]); cube(legR, mat, 64, 64, 0, 32, [-2, 0, -2, 4, 12, 4], false, 0.25);
    const legL = piece(m, [1.9, 12, 0]); cube(legL, baseM, 64, 64, 16, 48, [-2, 0, -2, 4, 12, 4]); cube(legL, mat, 64, 64, 0, 48, [-2, 0, -2, 4, 12, 4], false, 0.25);
    const held = new THREE.Group(); armR.add(held);
    return {
      m, scale: 0.9375, parts: { head, body, armR, armL, legR, legL }, held,
      set(e, pt) { // ModelBiped.setRotationAngles + ModelPlayer
        const ls = lerp(e.pls, e.ls, pt) , la = lerp(e.pla, e.la, pt), age = e.age + pt;
        const bodyYaw = lerpAng(e.pbody, e.body, pt), headYaw = lerpAng(e.phead, e.head, pt), pitch = lerp(e.ppitch, e.pitch, pt);
        const hx = pitch * D2R, hy = wrap(headYaw - bodyYaw) * D2R;
        let rax = Math.cos(ls * 0.6662 + Math.PI) * 2 * la * 0.5, lax = Math.cos(ls * 0.6662) * 2 * la * 0.5;
        let raz = 0, laz = 0, ray = 0, lay = 0, by = 0;
        let rlx = Math.cos(ls * 0.6662) * 1.4 * la, llx = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la, rly = 0, lly = 0;
        if (e.vehicle) { rax -= Math.PI / 5; lax -= Math.PI / 5; rlx = llx = -Math.PI * 2 / 5; rly = Math.PI / 10; lly = -Math.PI / 10; } // isRiding: sat down
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
        // isSneak (entity flag 0x02): body leans 0.5, arms +0.4, legs pulled in under it, head down a pixel
        const sn = !e.vehicle && ((e.meta?.["0"] ?? 0) & 2);
        if (sn) { rax += 0.4; lax += 0.4; }
        setRP(head, [0, sn ? 1 : 0, 0]); setRP(legR, [-1.9, sn ? 9 : 12, sn ? 4 : 0.1]); setRP(legL, [1.9, sn ? 9 : 12, sn ? 4 : 0.1]);
        rot(head, hx, hy, 0); rot(body, sn ? 0.5 : 0, by, 0);
        setRP(armR, rp); setRP(armL, lp); rot(armR, rax, ray, raz); rot(armL, lax, lay, laz); rot(legR, rlx, rly, 0); rot(legL, llx, lly, 0);
      },
    };
  }
  function armorStand(e) { // ModelArmorStand: usually invisible (only its worn and held items show), sometimes shown
    const m = new THREE.Group(), hl = new THREE.Group(), al = new THREE.Group(); m.add(hl, al);
    const head = piece(hl, [0, 1, 0]), body = piece(m), armR = piece(al, [-5, 2, 0]), armL = piece(m, [5, 2, 0]);
    const legR = piece(m, [-1.9, 12, 0]), legL = piece(m, [1.9, 12, 0]);
    const held = new THREE.Group(); armR.add(held);
    // the stand itself (64x64): neck, shoulders, arms, legs, the two side sticks, waist and base plate
    const mat = emat("entity_armorstand"), vis = [];
    const add = (p, u, v, b) => { vis.push(cube(p, mat, 64, 64, u, v, b)); };
    add(head, 0, 0, [-1, -7, -1, 2, 7, 2]); add(body, 0, 26, [-6, 0, -1.5, 12, 3, 3]);
    const arms = [cube(armR, mat, 64, 64, 24, 0, [-2, -2, -1, 2, 12, 2]), cube(armL, mat, 64, 64, 32, 16, [0, -2, -1, 2, 12, 2])];
    add(legR, 8, 0, [-1, 0, -1, 2, 11, 2]); add(legL, 40, 16, [-1, 0, -1, 2, 11, 2]);
    const sideR = piece(m), sideL = piece(m), waist = piece(m), base = piece(m, [0, 12, 0]);
    add(sideR, 16, 0, [-3, 3, -1, 2, 7, 2]); add(sideL, 48, 16, [1, 3, -1, 2, 7, 2]); add(waist, 0, 48, [-4, 10, -1, 8, 2, 2]);
    const plate = cube(base, mat, 64, 64, 0, 32, [-6, 11, -6, 12, 1, 12]);
    // Worn armour on a small stand: ModelBiped as a child draws body, arms and legs at half size,
    // translate(0, 24px) in that scale, so they shrink toward the feet.
    const kidG = new THREE.Group(); kidG.scale.setScalar(0.5); kidG.position.y = -0.75; m.add(kidG);
    const kid = { body: piece(kidG), armR: piece(kidG, [-5, 2, 0]), armL: piece(kidG, [5, 2, 0]), legR: piece(kidG, [-1.9, 12, 0]), legL: piece(kidG, [1.9, 12, 0]) };
    // ...and a shown small stand is drawn the same way (its head at 1.5/2 size, translate 16px).
    const kidHG = new THREE.Group(); kidHG.scale.setScalar(0.75); kidHG.position.y = -0.75; m.add(kidHG);
    const kHead = piece(kidHG, [0, 1, 0]), kSideR = piece(kidG), kSideL = piece(kidG), kWaist = piece(kidG), kBase = piece(kidG, [0, 12, 0]), kvis = [];
    const kadd = (p, u, v, b) => { kvis.push(cube(p, mat, 64, 64, u, v, b)); };
    kadd(kHead, 0, 0, [-1, -7, -1, 2, 7, 2]); kadd(kid.body, 0, 26, [-6, 0, -1.5, 12, 3, 3]);
    const karms = [cube(kid.armR, mat, 64, 64, 24, 0, [-2, -2, -1, 2, 12, 2]), cube(kid.armL, mat, 64, 64, 32, 16, [0, -2, -1, 2, 12, 2])];
    kadd(kid.legR, 8, 0, [-1, 0, -1, 2, 11, 2]); kadd(kid.legL, 40, 16, [-1, 0, -1, 2, 11, 2]);
    kadd(kSideR, 16, 0, [-3, 3, -1, 2, 7, 2]); kadd(kSideL, 48, 16, [1, 3, -1, 2, 7, 2]); kadd(kWaist, 0, 48, [-4, 10, -1, 8, 2, 2]);
    const kplate = cube(kBase, mat, 64, 64, 0, 32, [-6, 11, -6, 12, 1, 12]);
    return {
      m, hl, al, scale: 1, parts: { head, body, armR, armL, legR, legL }, kid, held, stand: true, legY: -1,
      set(e) {
        const P = (k, d) => (e.meta[k] || d).map((v) => v * D2R);
        const [hx, hy, hz] = P("11", [0, 0, 0]), [bx, byy, bz] = P("12", [0, 0, 0]), [lx, ly, lz] = P("13", [-10, 0, -10]), [rx, ry, rz] = P("14", [-15, 0, 10]);
        const [llx, lly, llz] = P("15", [-1, 0, -1]), [rlx, rly, rlz] = P("16", [1, 0, 1]);
        rot(head, hx, hy, hz); rot(body, bx, byy, bz); rot(armL, lx, ly, lz); rot(armR, rx, ry, rz); rot(legL, llx, lly, llz); rot(legR, rlx, rly, rlz);
        rot(kHead, hx, hy, hz); for (const p of [kSideR, kSideL, kWaist]) rot(p, bx, byy, bz);
        rot(kid.body, bx, byy, bz); rot(kid.armL, lx, ly, lz); rot(kid.armR, rx, ry, rz); rot(kid.legL, llx, lly, llz); rot(kid.legR, rlx, rly, rlz);
        for (const p of [sideR, sideL, waist]) rot(p, bx, byy, bz);
        const shown = !(e.meta["0"] & 32), flags = e.meta["10"] || 0, sm = !!(flags & 1);
        for (const c of vis) c.visible = shown && !sm;
        for (const c of arms) c.visible = shown && !sm && !!(flags & 4);
        plate.visible = shown && !sm && !(flags & 8);
        for (const c of kvis) c.visible = shown && sm;
        for (const c of karms) c.visible = shown && sm && !!(flags & 4);
        kplate.visible = shown && sm && !(flags & 8);
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
  const headAngles = (e, pt) => [lerp(e.ppitch, e.pitch, pt) * D2R, wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R];
  function cow(e) { // ModelCow (ModelQuadruped 12, 64x32)
    const mat = emat("entity_cow"), m = new THREE.Group(), g = new THREE.Group(), hg = new THREE.Group(); m.add(g, hg);
    // ModelQuadruped as a child: the head full size, 8px lower and 4px back; the rest at half size, 24px down in that scale
    if (e.child) { hg.position.set(0, -8 / 16, -4 / 16); g.scale.setScalar(0.5); g.position.y = -24 / 16 * 0.5; }
    const head = piece(hg, [0, 4, -8]); cube(head, mat, 64, 32, 0, 0, [-4, -4, -6, 8, 8, 6]); cube(head, mat, 64, 32, 22, 0, [-5, -5, -4, 1, 3, 1]); cube(head, mat, 64, 32, 22, 0, [4, -5, -4, 1, 3, 1]);
    const body = piece(g, [0, 5, 2]); cube(body, mat, 64, 32, 18, 4, [-6, -10, -7, 12, 18, 10]); cube(body, mat, 64, 32, 52, 0, [-2, 2, -8, 4, 6, 1]);
    const legs = [[-4, 12, 7], [4, 12, 7], [-4, 12, -6], [4, 12, -6]].map((rp) => { const p = piece(g, rp); cube(p, mat, 64, 32, 0, 16, [-2, 0, -2, 4, 12, 4]); return p; });
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        rot(head, hx, hy, 0); rot(body, Math.PI / 2);
        rot(legs[0], Math.cos(ls * 0.6662) * 1.4 * la); rot(legs[1], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
        rot(legs[2], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(legs[3], Math.cos(ls * 0.6662) * 1.4 * la);
      },
    };
  }
  function pig(e) { // ModelPig (ModelQuadruped 6, 64x32; a child's head 4px lower and 4px back)
    const mat = emat("entity_pig"), m = new THREE.Group(), g = new THREE.Group(), hg = new THREE.Group(); m.add(g, hg);
    if (e.child) { hg.position.set(0, -4 / 16, -4 / 16); g.scale.setScalar(0.5); g.position.y = -24 / 16 * 0.5; }
    const head = piece(hg, [0, 12, -6]); cube(head, mat, 64, 32, 0, 0, [-4, -4, -8, 8, 8, 8]); cube(head, mat, 64, 32, 16, 16, [-2, 0, -9, 4, 3, 1]);
    const body = piece(g, [0, 11, 2]); cube(body, mat, 64, 32, 28, 8, [-5, -10, -7, 10, 16, 8]);
    const legs = [[-3, 18, 7], [3, 18, 7], [-3, 18, -5], [3, 18, -5]].map((rp) => { const p = piece(g, rp); cube(p, mat, 64, 32, 0, 16, [-2, 0, -2, 4, 6, 4]); return p; });
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        rot(head, hx, hy, 0); rot(body, Math.PI / 2);
        rot(legs[0], Math.cos(ls * 0.6662) * 1.4 * la); rot(legs[1], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
        rot(legs[2], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(legs[3], Math.cos(ls * 0.6662) * 1.4 * la);
      },
    };
  }
  function endermite(e) { // ModelEnderMite (64x32): four segments that sway
    const mat = emat("entity_endermite"), m = new THREE.Group();
    const SZ = [[4, 3, 2], [6, 4, 5], [3, 3, 1], [1, 2, 1]], UV = [[0, 0], [0, 5], [0, 14], [0, 18]], parts = [];
    let f = -3.5;
    for (let i = 0; i < 4; i++) {
      const p = piece(m, [0, 24 - SZ[i][1], f]); cube(p, mat, 64, 32, UV[i][0], UV[i][1], [SZ[i][0] * -0.5, 0, SZ[i][2] * -0.5, ...SZ[i]]); parts.push(p);
      if (i < 3) f += (SZ[i][2] + SZ[i + 1][2]) * 0.5;
    }
    return {
      m, scale: 1,
      set(e, pt) {
        const age = e.age + pt;
        parts.forEach((p, i) => { const a = age * 0.9 + i * 0.15 * Math.PI; rot(p, 0, Math.cos(a) * Math.PI * 0.01 * (1 + Math.abs(i - 2)), 0); p.position.x = Math.sin(a) * Math.PI * 0.1 * Math.abs(i - 2) / 16; });
      },
    };
  }
  const tri = (f, f1) => (Math.abs((((f % f1) + f1) % f1) - f1 * 0.5) - f1 * 0.25) / (f1 * 0.25);
  function ironGolem(e) { // ModelIronGolem (128x128); RenderIronGolem rocks it while it walks
    const mat = emat("entity_iron_golem"), m = new THREE.Group();
    const head = piece(m, [0, -7, -2]); cube(head, mat, 128, 128, 0, 0, [-4, -12, -5.5, 8, 10, 8]); cube(head, mat, 128, 128, 24, 0, [-1, -5, -7.5, 2, 4, 2]);
    const body = piece(m, [0, -7, 0]); cube(body, mat, 128, 128, 0, 40, [-9, -2, -6, 18, 12, 11]); cube(body, mat, 128, 128, 0, 70, [-4.5, 10, -3, 9, 5, 6], false, 0.5);
    const armR = piece(m, [0, -7, 0]); cube(armR, mat, 128, 128, 60, 21, [-13, -2.5, -3, 4, 30, 6]);
    const armL = piece(m, [0, -7, 0]); cube(armL, mat, 128, 128, 60, 58, [9, -2.5, -3, 4, 30, 6]);
    const legL = piece(m, [-4, 11, 0]); cube(legL, mat, 128, 128, 37, 0, [-3.5, -3, -3, 6, 16, 5]);
    const legR = piece(m, [5, 11, 0]); cube(legR, mat, 128, 128, 60, 0, [-3.5, -3, -3, 6, 16, 5]);
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        rot(head, hx, hy, 0);
        rot(legL, -1.5 * tri(ls, 13) * la); rot(legR, 1.5 * tri(ls, 13) * la);
        if (e.attack > 0) { const a = -2 + 1.5 * tri(e.attack - pt, 10); rot(armR, a); rot(armL, a); }
        else { rot(armR, (-0.2 + 1.5 * tri(ls, 13)) * la); rot(armL, (-0.2 - 1.5 * tri(ls, 13)) * la); }
      },
      corpse(e, pt, g) {
        const la = lerp(e.pla, e.la, pt);
        if (la >= 0.01) { const f = e.ls - e.la * (1 - pt) + 6; g.rotation.z = -6.5 * tri(f, 13) * D2R; } else g.rotation.z = 0;
      },
    };
  }
  function witch(e) { // ModelWitch (ModelVillager 64x128 plus the hat and wart); RenderWitch scales 0.9375
    const mat = emat("entity_witch"), m = new THREE.Group();
    const head = piece(m, [0, 0, 0]); cube(head, mat, 64, 128, 0, 0, [-4, -10, -4, 8, 10, 8]);
    const nose = piece(head, [0, -2, 0]); cube(nose, mat, 64, 128, 24, 0, [-1, -1, -6, 2, 4, 2]);
    const wart = piece(nose, [0, -2, 0]); cube(wart, mat, 64, 128, 0, 0, [0, 3, -6.75, 1, 1, 1], false, -0.25);
    const hat = piece(head, [-5, -10.03125, -5]); cube(hat, mat, 64, 128, 0, 64, [0, 0, 0, 10, 2, 10]);
    const hat2 = piece(hat, [1.75, -4, 2]); cube(hat2, mat, 64, 128, 0, 76, [0, 0, 0, 7, 4, 7]); rot(hat2, -0.05235988, 0, 0.02617994);
    const hat3 = piece(hat2, [1.75, -4, 2]); cube(hat3, mat, 64, 128, 0, 87, [0, 0, 0, 4, 4, 4]); rot(hat3, -0.10471976, 0, 0.05235988);
    const hat4 = piece(hat3, [1.75, -2, 2]); cube(hat4, mat, 64, 128, 0, 95, [0, 0, 0, 1, 2, 1], false, 0.25); rot(hat4, -0.20943952, 0, 0.10471976);
    const body = piece(m); cube(body, mat, 64, 128, 16, 20, [-4, 0, -3, 8, 12, 6]); cube(body, mat, 64, 128, 0, 38, [-4, 0, -3, 8, 18, 6], false, 0.5);
    const arms = piece(m, [0, 3, -1]); cube(arms, mat, 64, 128, 44, 22, [-8, -2, -2, 4, 8, 4]); cube(arms, mat, 64, 128, 44, 22, [4, -2, -2, 4, 8, 4], true); cube(arms, mat, 64, 128, 40, 38, [-4, 2, -2, 8, 4, 4]); rot(arms, -0.75);
    const legR = piece(m, [-2, 12, 0]); cube(legR, mat, 64, 128, 0, 22, [-2, 0, -2, 4, 12, 4]);
    const legL = piece(m, [2, 12, 0]); cube(legL, mat, 64, 128, 0, 22, [-2, 0, -2, 4, 12, 4], true);
    return {
      m, scale: 0.9375,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        rot(head, hx, hy, 0);
        rot(legR, Math.cos(ls * 0.6662) * 1.4 * la * 0.5); rot(legL, Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la * 0.5);
        const f = 0.01 * (e.id % 10);
        rot(nose, Math.sin(e.age * f) * 4.5 * D2R, 0, Math.cos(e.age * f) * 2.5 * D2R);
      },
    };
  }
  // ModelGuardian: twelve spikes that twitch in and out of water, a swaying tail, an eye that
  // follows its target (or the camera).
  const GS = [[1.75, 0.25, 0, 0, 0.5, 0.5, 0.5, 0.5, 1.25, 0.75, 0, 0], [0, 0, 0, 0, 0.25, 1.75, 1.25, 0.75, 0, 0, 0, 0], [0, 0, 0.25, 1.75, 0, 0, 0, 0, 0, 0, 0.75, 1.25],
    [0, 0, 8, -8, -8, 8, 8, -8, 0, 0, 8, -8], [-8, -8, -8, -8, 0, 0, 0, 0, 8, 8, 8, 8], [8, -8, 0, 0, -8, -8, 8, 8, 8, -8, 0, 0]];
  function guardian(e) {
    const mat = emat("entity_guardian"), m = new THREE.Group();
    const body = piece(m);
    cube(body, mat, 64, 64, 0, 0, [-6, 10, -8, 12, 12, 16]); cube(body, mat, 64, 64, 0, 28, [-8, 10, -6, 2, 12, 12]); cube(body, mat, 64, 64, 0, 28, [6, 10, -6, 2, 12, 12], true);
    cube(body, mat, 64, 64, 16, 40, [-6, 8, -6, 12, 2, 12]); cube(body, mat, 64, 64, 16, 40, [-6, 22, -6, 12, 2, 12]);
    const spines = []; for (let i = 0; i < 12; i++) { const sp = piece(body); cube(sp, mat, 64, 64, 0, 0, [-1, -4.5, -1, 2, 9, 2]); spines.push(sp); }
    const eye = piece(body, [0, 0, -8.25]); cube(eye, mat, 64, 64, 8, 0, [-1, 15, 0, 2, 2, 1]);
    const t0 = piece(body); cube(t0, mat, 64, 64, 40, 0, [-2, 14, 7, 4, 4, 8]);
    const t1 = piece(t0, [-1.5, 0.5, 14]); cube(t1, mat, 64, 64, 0, 54, [0, 14, 0, 3, 3, 7]);
    const t2 = piece(t1, [0.5, 0.5, 6]); cube(t2, mat, 64, 64, 41, 32, [0, 14, 0, 2, 2, 6]); cube(t2, mat, 64, 64, 25, 19, [1, 10.5, 3, 1, 9, 9]);
    return {
      m, scale: 1,
      set(e, pt) {
        const age = e.age + pt, hy = wrap(lerpAng(e.phead, e.head, pt) - lerpAng(e.pbody, e.body, pt)) * D2R, hx = lerp(e.ppitch, e.pitch, pt) * D2R;
        rot(body, hx, hy, 0);
        const f1 = (1 - lerp(e.pspike, e.spike, pt)) * 0.55;
        for (let i = 0; i < 12; i++) {
          const k = 1 + Math.cos(age * 1.5 + i) * 0.01 - f1;
          rot(spines[i], Math.PI * GS[0][i], Math.PI * GS[1][i], Math.PI * GS[2][i]); setRP(spines[i], [GS[3][i] * k, 16 + GS[4][i] * k, GS[5][i] * k]);
        }
        // the eye looks toward its target
        let ex = 0, ey = 0;
        const me = new THREE.Vector3(e.x, e.y + 0.425, e.z), to = e.lookAt || me.clone().add(new THREE.Vector3(0, 0, -1));
        ey = to.y - me.y > 0 ? 0 : 1;
        const yaw = lerpAng(e.phead, e.head, pt) * D2R, look = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
        const d = me.clone().sub(to).normalize(); const side = new THREE.Vector3(d.z, d.y, -d.x); // rotated a quarter turn about y
        const dd = look.dot(side); ex = Math.sqrt(Math.abs(dd)) * 2 * Math.sign(dd);
        setRP(eye, [ex, ey, -8.25]);
        const tail = lerp(e.ptail, e.tail, pt);
        rot(t0, 0, Math.sin(tail) * Math.PI * 0.05); rot(t1, 0, Math.sin(tail) * Math.PI * 0.1); rot(t2, 0, Math.sin(tail) * Math.PI * 0.15);
      },
    };
  }
  // ---- shopkeeper mobs: the 1.8 client's own models (ModelZombie, ModelSkeleton, ModelZombieVillager,
  // ModelCreeper, ModelBlaze, ModelSnowMan, ModelEnderman, ModelVillager, ModelWither) and renderers.
  const idleArms = (age) => [Math.sin(age * 0.067) * 0.05, Math.cos(age * 0.09) * 0.05 + 0.05]; // ModelBiped's arm drift (x, z)
  function zombieLike(e, texName, th, thin, villager, scale = 1) {
    const mat = emat(texName), m = new THREE.Group();
    const head = piece(m);
    if (villager) { cube(head, mat, 64, th, 0, 32, [-4, -10, -4, 8, 10, 8]); cube(head, mat, 64, th, 24, 32, [-1, -3, -6, 2, 4, 2]); }
    else cube(head, mat, 64, th, 0, 0, [-4, -8, -4, 8, 8, 8]);
    cube(head, mat, 64, th, 32, 0, [-4, -8, -4, 8, 8, 8], false, 0.5);
    const body = piece(m); cube(body, mat, 64, th, 16, 16, [-4, 0, -2, 8, 12, 4]);
    const armR = piece(m, [-5, 2, 0]), armL = piece(m, [5, 2, 0]);
    const legR = piece(m, [thin ? -2 : -1.9, 12, 0]), legL = piece(m, [thin ? 2 : 1.9, 12, 0]);
    if (thin) { // ModelSkeleton: 2-pixel arms and legs
      cube(armR, mat, 64, th, 40, 16, [-1, -2, -1, 2, 12, 2]); cube(armL, mat, 64, th, 40, 16, [-1, -2, -1, 2, 12, 2], true);
      cube(legR, mat, 64, th, 0, 16, [-1, 0, -1, 2, 12, 2]); cube(legL, mat, 64, th, 0, 16, [-1, 0, -1, 2, 12, 2], true);
    } else {
      cube(armR, mat, 64, th, 40, 16, [-3, -2, -2, 4, 12, 4]); cube(armL, mat, 64, th, 40, 16, [-1, -2, -2, 4, 12, 4], true);
      cube(legR, mat, 64, th, 0, 16, [-2, 0, -2, 4, 12, 4]); cube(legL, mat, 64, th, 0, 16, [-2, 0, -2, 4, 12, 4], true);
    }
    const held = new THREE.Group(); armR.add(held);
    return {
      m, scale, parts: { head, body, armR, armL, legR, legL }, held,
      set(e, pt) { // ModelZombie.setRotationAngles: both arms held straight out, drifting
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt), [dx, dz] = idleArms(e.age + pt);
        const sw = e.swingAt(pt), f6 = Math.sin(sw * Math.PI), f7 = Math.sin((1 - (1 - sw) * (1 - sw)) * Math.PI);
        rot(head, hx, hy, 0);
        rot(armR, -Math.PI / 2 - (f6 * 1.2 - f7 * 0.4) + dx, -(0.1 - f6 * 0.6), dz);
        rot(armL, -Math.PI / 2 - (f6 * 1.2 - f7 * 0.4) - dx, 0.1 - f6 * 0.6, -dz);
        rot(legR, Math.cos(ls * 0.6662) * 1.4 * la); rot(legL, Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
      },
    };
  }
  const skeleton = (e) => e.meta["13"] === 1 ? zombieLike(e, "entity_wither_skeleton", 32, true, false, 1.2) : zombieLike(e, "entity_skeleton", 32, true, false);
  const zombie = (e) => e.meta["13"] === 1 ? zombieLike(e, "entity_zombie_villager", 64, false, true) : zombieLike(e, "entity_zombie", 64, false, false);
  const pigman = (e) => zombieLike(e, "entity_zombie_pigman", 64, false, false);
  function creeperBoxes(parent, mat, inf) {
    const head = piece(parent, [0, 6, 0]); cube(head, mat, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8], false, inf);
    const body = piece(parent, [0, 6, 0]); cube(body, mat, 64, 32, 16, 16, [-4, 0, -2, 8, 12, 4], false, inf);
    const legs = [[-2, 18, 4], [2, 18, 4], [-2, 18, -4], [2, 18, -4]].map((rp) => { const p = piece(parent, rp); cube(p, mat, 64, 32, 0, 16, [-2, 0, -2, 4, 6, 4], false, inf); return p; });
    return { head, body, legs };
  }
  function creeper(e) { // ModelCreeper; LayerCreeperCharge draws ModelCreeper(2.0) over a powered one, its texture sliding
    const m = new THREE.Group(), base = new THREE.Group(); m.add(base);
    const B = creeperBoxes(base, emat("entity_creeper"), 0);
    let C = null, ct = null;
    if (e.meta["17"] === 1) {
      ct = tex("entity_creeper_armor").clone(); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.needsUpdate = true;
      const cm = new THREE.MeshBasicMaterial({ map: ct, color: new THREE.Color(0.5, 0.5, 0.5).convertSRGBToLinear(), transparent: true, depthWrite: !(e.meta["0"] & 32),
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide });
      const cg = new THREE.Group(); m.add(cg); C = creeperBoxes(cg, cm, 2);
    }
    const pose = (P, hx, hy, ls, la) => { rot(P.head, hx, hy, 0); rot(P.legs[0], Math.cos(ls * 0.6662) * 1.4 * la); rot(P.legs[1], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(P.legs[2], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(P.legs[3], Math.cos(ls * 0.6662) * 1.4 * la); };
    return {
      m, scale: 1, base,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        pose(B, hx, hy, ls, la);
        if (C) { pose(C, hx, hy, ls, la); const f = e.age + pt; if (ct.image) { ct.offset.set(f * 0.01, -f * 0.01); } }
      },
    };
  }
  function blaze(e) { // ModelBlaze: a head and three rings of rods circling and bobbing
    const mat = emat("entity_blaze"), m = new THREE.Group();
    const head = piece(m); cube(head, mat, 64, 32, 0, 0, [-4, -4, -4, 8, 8, 8]);
    const rods = []; for (let i = 0; i < 12; i++) { const p = piece(m); cube(p, mat, 64, 32, 0, 16, [0, 0, 0, 2, 8, 2]); rods.push(p); }
    return {
      m, scale: 1, bright: true,
      set(e, pt) {
        const a = e.age + pt, [hx, hy] = headAngles(e, pt);
        let f = a * Math.PI * -0.1; for (let i = 0; i < 4; i++, f++) setRP(rods[i], [Math.cos(f) * 9, -2 + Math.cos((i * 2 + a) * 0.25), Math.sin(f) * 9]);
        f = Math.PI / 4 + a * Math.PI * 0.03; for (let i = 4; i < 8; i++, f++) setRP(rods[i], [Math.cos(f) * 7, 2 + Math.cos((i * 2 + a) * 0.25), Math.sin(f) * 7]);
        f = 0.47123894 + a * Math.PI * -0.05; for (let i = 8; i < 12; i++, f++) setRP(rods[i], [Math.cos(f) * 5, 11 + Math.cos((i * 1.5 + a) * 0.5), Math.sin(f) * 5]);
        rot(head, hx, hy, 0);
      },
    };
  }
  function snowman(e) { // ModelSnowMan (64x64, every box 0.5 smaller) and LayerSnowmanHead's pumpkin
    const mat = emat("entity_snowman"), m = new THREE.Group();
    const head = piece(m, [0, 4, 0]); cube(head, mat, 64, 64, 0, 0, [-4, -8, -4, 8, 8, 8], false, -0.5);
    const body = piece(m, [0, 13, 0]); cube(body, mat, 64, 64, 0, 16, [-5, -10, -5, 10, 10, 10], false, -0.5);
    const bottom = piece(m, [0, 24, 0]); cube(bottom, mat, 64, 64, 0, 36, [-6, -12, -6, 12, 12, 12], false, -0.5);
    const handR = piece(m, [0, 6, 0]), handL = piece(m, [0, 6, 0]);
    cube(handR, mat, 64, 64, 32, 0, [-1, 0, -1, 12, 2, 2], false, -0.5); cube(handL, mat, 64, 64, 32, 0, [-1, 0, -1, 12, 2, 2], false, -0.5);
    // head.postRender, translate(0, -0.34375, 0), turn 180, scale(0.625, -0.625, -0.625), the pumpkin as worn (HEAD)
    const gl = new THREE.Group(); gl.scale.set(1, -1, -1); head.add(gl);
    const t = new THREE.Group(); t.position.set(0, -0.34375, 0); t.rotation.y = Math.PI; t.scale.set(0.625, -0.625, -0.625); gl.add(t);
    const two = new THREE.Group(); two.scale.setScalar(2); t.add(two); two.add(renderItemNode({ id: 86 }));
    return {
      m, scale: 1,
      set(e, pt) {
        const [hx, hy] = headAngles(e, pt), by = hy * 0.25, f = Math.sin(by), f1 = Math.cos(by);
        rot(head, hx, hy, 0); rot(body, 0, by, 0);
        setRP(handR, [f1 * 5, 6, -f * 5]); rot(handR, 0, by, 1);
        setRP(handL, [-f1 * 5, 6, f * 5]); rot(handL, 0, Math.PI + by, -1);
      },
    };
  }
  function enderman(e) { // ModelEnderman (ModelBiped at -14) and LayerEndermanEyes
    const mat = emat("entity_enderman"), m = new THREE.Group();
    const eyes = new THREE.MeshBasicMaterial({ map: tex("entity_enderman_eyes"), transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide });
    const head = piece(m, [0, -13, 0]); cube(head, mat, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8]); cube(head, mat, 64, 32, 0, 16, [-4, -8, -4, 8, 8, 8], false, -0.5);
    cube(head, eyes, 64, 32, 0, 0, [-4, -8, -4, 8, 8, 8]);
    const body = piece(m, [0, -14, 0]); cube(body, mat, 64, 32, 32, 16, [-4, 0, -2, 8, 12, 4]);
    const armR = piece(m, [-5, -12, 0]); cube(armR, mat, 64, 32, 56, 0, [-1, -2, -1, 2, 30, 2]);
    const armL = piece(m, [5, -12, 0]); cube(armL, mat, 64, 32, 56, 0, [-1, -2, -1, 2, 30, 2], true);
    const legR = piece(m, [-2, -5, 0]); cube(legR, mat, 64, 32, 56, 0, [-1, 0, -1, 2, 30, 2]);
    const legL = piece(m, [2, -5, 0]); cube(legL, mat, 64, 32, 56, 0, [-1, 0, -1, 2, 30, 2], true);
    const cl = (v) => clamp(v, -0.4, 0.4);
    // LayerHeldBlock: data 16 is the carried block id, 17 its metadata
    let heldKey = null, heldG = null;
    const held = (e) => {
      const id = e.meta["16"] || 0, d = e.meta["17"] || 0, k = id ? id + ":" + d : null;
      if (k === heldKey) return; heldKey = k;
      if (heldG) { m.remove(heldG); heldG = null; }
      if (!id) return;
      const g0 = heldG = new THREE.Group(); heldG.scale.set(1, -1, -1); m.add(heldG); // GL space of the model
      const a = new THREE.Group(); a.position.set(0, 0.6875, -0.75); a.rotation.x = 20 * D2R; heldG.add(a);
      const b = new THREE.Group(); b.rotation.y = 45 * D2R; a.add(b);
      const c = new THREE.Group(); c.position.set(0.25, 0.1875, 0.25); c.scale.set(-0.5, -0.5, 0.5); b.add(c);
      modelsReady.then(() => { const name = blockKey(id, d); if (name && heldG === g0) { const r = new THREE.Group(); r.rotation.y = Math.PI / 2; r.add(blockMesh(name)); c.add(r); } }); // renderModelBrightness turns 90 degrees first
    };
    return {
      m, scale: 1,
      set(e, pt) { // biped angles, arms and legs halved and kept within 0.4
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt), [dx, dz] = idleArms(e.age + pt);
        rot(head, hx, hy, 0); held(e);
        if (heldKey) { rot(armR, -0.5, 0, 0.05); rot(armL, -0.5, 0, -0.05); } else // carrying: both arms forward
        rot(armR, cl((Math.cos(ls * 0.6662 + Math.PI) * 2 * la * 0.5 + dx) * 0.5), 0, dz), rot(armL, cl((Math.cos(ls * 0.6662) * 2 * la * 0.5 - dx) * 0.5), 0, -dz);
        rot(legR, cl(Math.cos(ls * 0.6662) * 1.4 * la * 0.5)); rot(legL, cl(Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la * 0.5));
      },
    };
  }
  const PROFESSION = ["farmer", "librarian", "priest", "smith", "butcher"];
  function villager(e) { // ModelVillager (64x64); RenderVillager scales 0.9375
    const mat = emat("entity_villager_" + (PROFESSION[e.meta["16"]] || "farmer")), m = new THREE.Group();
    const head = piece(m); cube(head, mat, 64, 64, 0, 0, [-4, -10, -4, 8, 10, 8]);
    const nose = piece(head, [0, -2, 0]); cube(nose, mat, 64, 64, 24, 0, [-1, -1, -6, 2, 4, 2]);
    const body = piece(m); cube(body, mat, 64, 64, 16, 20, [-4, 0, -3, 8, 12, 6]); cube(body, mat, 64, 64, 0, 38, [-4, 0, -3, 8, 18, 6], false, 0.5);
    const arms = piece(m, [0, 3, -1]); cube(arms, mat, 64, 64, 44, 22, [-8, -2, -2, 4, 8, 4]); cube(arms, mat, 64, 64, 44, 22, [4, -2, -2, 4, 8, 4], true); cube(arms, mat, 64, 64, 40, 38, [-4, 2, -2, 8, 4, 4]); rot(arms, -0.75);
    const legR = piece(m, [-2, 12, 0]); cube(legR, mat, 64, 64, 0, 22, [-2, 0, -2, 4, 12, 4]);
    const legL = piece(m, [2, 12, 0]); cube(legL, mat, 64, 64, 0, 22, [-2, 0, -2, 4, 12, 4], true);
    return {
      m, scale: 0.9375,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt);
        rot(head, hx, hy, 0); rot(legR, Math.cos(ls * 0.6662) * 1.4 * la * 0.5); rot(legL, Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la * 0.5);
      },
    };
  }
  function wither(e) { // ModelWither (64x64); RenderWither scales 2 (less while it is still being summoned)
    const invul = e.meta["20"] || 0;
    const mat = emat(invul > 0 && (invul > 80 || Math.floor(invul / 5) % 2 !== 1) ? "entity_wither_invulnerable" : "entity_wither"), m = new THREE.Group();
    const s0 = piece(m); cube(s0, mat, 64, 64, 0, 16, [-10, 3.9, -0.5, 20, 3, 3]);
    const s1 = piece(m, [-2, 6.9, -0.5]); cube(s1, mat, 64, 64, 0, 22, [0, 0, 0, 3, 10, 3]);
    for (const y of [1.5, 4, 6.5]) cube(s1, mat, 64, 64, 24, 22, [-4, y, 0.5, 11, 2, 2]);
    const s2 = piece(m); cube(s2, mat, 64, 64, 12, 22, [0, 0, 0, 3, 6, 3]);
    const h0 = piece(m); cube(h0, mat, 64, 64, 0, 0, [-4, -4, -4, 8, 8, 8]);
    const h1 = piece(m, [-8, 4, 0]); cube(h1, mat, 64, 64, 32, 0, [-4, -4, -4, 6, 6, 6]);
    const h2 = piece(m, [10, 4, 0]); cube(h2, mat, 64, 64, 32, 0, [-4, -4, -4, 6, 6, 6]);
    e.wy = [0, 0]; e.pwy = [0, 0]; // the side heads' own yaw (EntityWither: turns toward the body 10 degrees a tick without a target)
    return {
      m, scale: invul > 0 ? 2 - invul / 220 * 0.5 : 2,
      set(e, pt) {
        const a = e.age + pt, f6 = Math.cos(a * 0.1), [hx, hy] = headAngles(e, pt), body = lerpAng(e.pbody, e.body, pt);
        const x1 = (0.065 + 0.05 * f6) * Math.PI; rot(s1, x1);
        setRP(s2, [-2, 6.9 + Math.cos(x1) * 10, -0.5 + Math.sin(x1) * 10]); rot(s2, (0.265 + 0.1 * f6) * Math.PI);
        rot(h0, hx, hy, 0);
        rot(h1, 0, wrap(lerpAng(e.pwy[0], e.wy[0], pt) - body) * D2R, 0); rot(h2, 0, wrap(lerpAng(e.pwy[1], e.wy[1], pt) - body) * D2R, 0);
      },
    };
  }
  // ---- models for the victory dances (ModelSheep1/2, ModelZombie at 6x, ModelHorse, ModelDragon, ModelMinecart)
  const FLEECE = [[1, 1, 1], [0.85, 0.5, 0.2], [0.7, 0.3, 0.85], [0.4, 0.6, 0.85], [0.9, 0.9, 0.2], [0.5, 0.8, 0.1], [0.95, 0.5, 0.65], [0.3, 0.3, 0.3], [0.6, 0.6, 0.6], [0.3, 0.5, 0.6], [0.5, 0.25, 0.7], [0.2, 0.3, 0.7], [0.4, 0.3, 0.2], [0.4, 0.5, 0.2], [0.6, 0.2, 0.2], [0.1, 0.1, 0.1]];
  function sheep(e) { // ModelSheep2 (body) with ModelSheep1 (wool, tinted by the fleece colour) on top; jeb_ cycles the colours
    const mat = emat("entity_sheep"), wool = new THREE.MeshLambertMaterial({ map: tex("entity_sheep_fur"), alphaTest: 0.1, side: THREE.DoubleSide });
    const m = new THREE.Group(), g = new THREE.Group(), hg = new THREE.Group(); m.add(g, hg);
    if (e.child) { hg.position.set(0, -8 / 16, -4 / 16); g.scale.setScalar(0.5); g.position.y = -24 / 16 * 0.5; }
    const head = piece(hg, [0, 6, -8]); cube(head, mat, 64, 32, 0, 0, [-3, -4, -6, 6, 6, 8]);
    const body = piece(g, [0, 5, 2]); cube(body, mat, 64, 32, 28, 8, [-4, -10, -7, 8, 16, 6]);
    const legs = [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]].map((rp) => { const p = piece(g, rp); cube(p, mat, 64, 32, 0, 16, [-2, 0, -2, 4, 12, 4]); return p; });
    const wHead = piece(head); cube(wHead, wool, 64, 32, 0, 0, [-3, -4, -4, 6, 6, 6], false, 0.6);
    const wBody = piece(body); cube(wBody, wool, 64, 32, 28, 8, [-4, -10, -7, 8, 16, 6], false, 1.75);
    const wLegs = legs.map((p) => { const q = piece(p); cube(q, wool, 64, 32, 0, 16, [-2, 0, -2, 4, 6, 4], false, 0.5); return q; });
    const woolParts = [wHead, wBody, ...wLegs];
    return {
      m, scale: 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt), f = e.meta["16"] || 0;
        for (const p of woolParts) p.visible = !(f & 16);
        if (e.meta["2"] === "jeb_") { // RenderSheep/LayerSheepWool: 25 ticks a colour, blended into the next
          const t = (e.age + pt) / 25 + e.id, i = Math.floor(t) % 16, j = (i + 1) % 16, k = t - Math.floor(t), a = FLEECE[i], b = FLEECE[j];
          wool.color.setRGB(a[0] * (1 - k) + b[0] * k, a[1] * (1 - k) + b[1] * k, a[2] * (1 - k) + b[2] * k);
        } else { const c = FLEECE[f & 15]; wool.color.setRGB(c[0], c[1], c[2]); }
        rot(head, hx, hy, 0); rot(body, Math.PI / 2);
        rot(legs[0], Math.cos(ls * 0.6662) * 1.4 * la); rot(legs[1], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la);
        rot(legs[2], Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la); rot(legs[3], Math.cos(ls * 0.6662) * 1.4 * la);
      },
    };
  }
  const giant = (e) => zombieLike(e, "entity_zombie", 64, false, false, 6); // RenderGiantZombie: ModelZombie scaled 6
  function layeredMat(names) { // LayeredTexture: horse colour with its markings drawn over
    const k = names.join("+");
    if (!matCache[k]) {
      const t = new THREE.Texture(); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
      Promise.all(names.map((n) => img(n))).then((ims) => { const c = document.createElement("canvas"); c.width = ims[0].width; c.height = ims[0].height; const x = c.getContext("2d"); for (const i of ims) x.drawImage(i, 0, 0); t.image = c; t.needsUpdate = true; }).catch(() => {});
      matCache[k] = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.1, side: THREE.DoubleSide });
    }
    return matCache[k];
  }
  const HORSE_COL = ["white", "creamy", "chestnut", "brown", "black", "gray", "darkbrown"], HORSE_MARK = [null, "white", "whitefield", "whitedots", "blackdots"];
  function horse(e) { // ModelHorse (128x128): a horse (type 0) with its colour and markings, saddle when saddled
    const v = e.meta["20"] || 0, col = HORSE_COL[(v & 255) % 7], mk = HORSE_MARK[((v >> 8) & 255) % 5];
    const mat = layeredMat(["entity_horse_" + col, ...(mk ? ["entity_horse_markings_" + mk] : [])]), m = new THREE.Group(), T = 128;
    const box = (p, u, vv, b, inf = 0) => cube(p, mat, T, T, u, vv, b, false, inf);
    const body = piece(m, [0, 11, 9]); box(body, 0, 34, [-5, -8, -19, 10, 10, 24]);
    const tail = [[44, 0, [-1, -1, 0, 2, 2, 3], -1.134464], [38, 7, [-1.5, -2, 3, 3, 4, 7], -1.134464], [24, 3, [-1.5, -4.5, 9, 3, 4, 7], -1.40215]].map(([u, vv, b, rx]) => { const p = piece(m, [0, 3, 14]); box(p, u, vv, b); p.userData.rx = rx; return p; });
    const head = piece(m, [0, 4, -10]);
    box(head, 0, 0, [-2.5, -10, -1.5, 5, 5, 7]); box(head, 24, 18, [-2, -10, -7, 4, 3, 6]); box(head, 24, 27, [-2, -7, -6.5, 4, 2, 5]);
    box(head, 0, 0, [0.45, -12, 4, 2, 3, 1]); box(head, 0, 0, [-2.45, -12, 4, 2, 3, 1]); box(head, 0, 12, [-2.05, -9.8, -2, 4, 14, 8]); box(head, 58, 0, [-1, -11.5, 5, 2, 16, 4]);
    const legs = [[[4, 9, 11], 78, [-2.5, -2, -2.5, 4, 9, 5], [-2, 0, -1.5, 3, 5, 3], [-2.5, 5.1, -2, 4, 3, 4]], [[-4, 9, 11], 96, [-1.5, -2, -2.5, 4, 9, 5], [-1, 0, -1.5, 3, 5, 3], [-1.5, 5.1, -2, 4, 3, 4]],
      [[4, 9, -8], 44, [-1.9, -1, -2.1, 3, 8, 4], [-1.9, 0, -1.6, 3, 5, 3], [-2.4, 5.1, -2.1, 4, 3, 4]], [[-4, 9, -8], 60, [-1.1, -1, -2.1, 3, 8, 4], [-1.1, 0, -1.6, 3, 5, 3], [-1.6, 5.1, -2.1, 4, 3, 4]]].map(([rp, u, a, b, c], i) => {
      const leg = piece(m, rp); box(leg, u, 29, a);
      const shin = piece(leg, [0, 7, 0]); box(shin, u, i < 2 ? 43 : 41, b); box(shin, u, 51, c); return leg;
    });
    const saddle = new THREE.Group(); m.add(saddle);
    for (const [u, vv, rp, b] of [[80, 0, [0, 2, 2], [-5, 0, -3, 10, 1, 8]], [106, 9, [0, 2, 2], [-1.5, -1, -3, 3, 1, 2]], [80, 9, [0, 2, 2], [-4, -1, 3, 8, 1, 2]], [74, 0, [5, 3, 2], [-0.5, 6, -1, 1, 2, 2]], [70, 0, [5, 3, 2], [-0.5, 0, -0.5, 1, 6, 1]], [74, 4, [-5, 3, 2], [-0.5, 6, -1, 1, 2, 2]], [80, 0, [-5, 3, 2], [-0.5, 0, -0.5, 1, 6, 1]]]) { const p = piece(saddle, rp); box(p, u, vv, b); }
    const hm = new THREE.Group(); head.add(hm); box(hm, 74, 13, [1.5, -8, -4, 1, 2, 2]); box(hm, 74, 13, [-2.5, -8, -4, 1, 2, 2]); box(hm, 80, 12, [-2.5, -10.1, -7, 5, 5, 12], 0.2);
    return {
      m, scale: e.child ? 0.5 : 1,
      set(e, pt) {
        const ls = lerp(e.pls, e.ls, pt), la = lerp(e.pla, e.la, pt), [hx, hy] = headAngles(e, pt), saddled = !!((e.meta["16"] || 0) & 4);
        saddle.visible = hm.visible = saddled;
        rot(head, 0.5235988 + hx, hy * 0.5, 0);
        for (const p of tail) rot(p, p.userData.rx + Math.cos(ls * 0.6662) * 0.2 * la);
        const a = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la * 0.8; // ModelHorse: front and back legs swing in pairs
        rot(legs[0], -a); rot(legs[1], a); rot(legs[2], a); rot(legs[3], -a);
      },
    };
  }
  function dragon(e) { // ModelDragon (256x256): neck of 5 segments, body, 12 tail segments, beating wings
    const mat = emat("entity_dragon"), eyes = new THREE.MeshBasicMaterial({ map: tex("entity_dragon_eyes"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Group(), T = 256;
    const both = (p, u, v, b, mir = false) => { cube(p, mat, T, T, u, v, b, mir); cube(p, eyes, T, T, u, v, b, mir); };
    const seg = (parent) => { const p = piece(parent); both(p, 192, 104, [-5, -5, -5, 10, 10, 10]); both(p, 48, 0, [-1, -9, -3, 2, 4, 6]); return p; };
    const neck = [], tailS = [];
    for (let i = 0; i < 5; i++) neck.push(seg(m));
    const head = piece(m);
    both(head, 176, 44, [-6, -1, -24, 12, 5, 16]); both(head, 112, 30, [-8, -8, -10, 16, 16, 16]);
    both(head, 0, 0, [-5, -12, -4, 2, 4, 6], true); both(head, 112, 0, [-5, -3, -22, 2, 2, 4], true); both(head, 0, 0, [3, -12, -4, 2, 4, 6]); both(head, 112, 0, [3, -3, -22, 2, 2, 4]);
    const jaw = piece(head, [0, 4, -8]); both(jaw, 176, 65, [-6, 0, -16, 12, 4, 16]);
    const body = piece(m, [0, 4, 8]); both(body, 0, 0, [-12, 0, -16, 24, 24, 64]); for (const z of [-10, 10, 30]) both(body, 220, 53, [-1, -6, z, 2, 6, 12]);
    for (let i = 0; i < 12; i++) tailS.push(seg(m));
    const wings = [], legs = [];
    for (const s of [1, -1]) {
      const side = new THREE.Group(); side.scale.x = s; body.add(side); side.position.set(0, -4 / 16 * -1 * 0, 0);
      const wing = piece(side, [-12, 5 - 4, 2 - 8]); both(wing, 112, 88, [-56, -4, -4, 56, 8, 8]); both(wing, -56, 88, [-56, 0, 2, 56, 0, 56]);
      const tip = piece(wing, [-56, 0, 0]); both(tip, 112, 136, [-56, -2, -2, 56, 4, 4]); both(tip, -56, 144, [-56, 0, 2, 56, 0, 56]);
      const fl = piece(side, [-12, 20 - 4, 2 - 8]); both(fl, 112, 104, [-4, -4, -4, 8, 24, 8]);
      const flt = piece(fl, [0, 20, -1]); both(flt, 226, 138, [-3, -1, -3, 6, 24, 6]);
      const ff = piece(flt, [0, 23, 0]); both(ff, 144, 104, [-4, 0, -12, 8, 4, 16]);
      const rl = piece(side, [-16, 16 - 4, 42 - 8]); both(rl, 0, 0, [-8, -4, -8, 16, 32, 16]);
      const rlt = piece(rl, [0, 32, -4]); both(rlt, 196, 0, [-6, -2, 0, 12, 32, 12]);
      const rf = piece(rlt, [0, 31, 4]); both(rf, 112, 0, [-9, 0, -20, 18, 6, 24]);
      wings.push([wing, tip]); legs.push([fl, flt, ff, rl, rlt, rf]);
    }
    m.position.set(0, 4.25, 1.5); // the body's middle over the entity, its back about 5.5 blocks up where the rider sits
    return {
      m, scale: 1, dragon: true, yawOff: 180, // RenderDragon turns by -yaw, not 180 - yaw
      set(e, pt) {
        const t = (e.age + pt) * 0.08, f = t * Math.PI * 2, f1 = Math.sin(f - 1) + 1; // EntityDragon.animTime advances about 0.08 a tick in flight
        // neck: out in front, rising toward the head; tail: back and drooping, swaying a little
        let x = 0, y = 4, z = -8;
        for (let i = 0; i < 5; i++) { setRP(neck[i], [x, y, z]); rot(neck[i], -0.1 + Math.cos(i * 0.45 + f) * 0.05, 0, 0); y -= 1.5 * Math.cos(f) * 0.2; z -= 10; }
        setRP(head, [x, y, z]); rot(head, 0, 0, 0); rot(jaw, Math.sin(f) * 0.2 + 0.2);
        x = 0; y = 10; z = 60;
        for (let i = 0; i < 12; i++) { setRP(tailS[i], [x + Math.sin(i * 0.45 + f * 0.5) * 2, y, z]); rot(tailS[i], 0, Math.sin(i * 0.45 + f * 0.5) * 0.15, 0); y += 0.6; z += 10; }
        for (const [w, tip] of wings) { rot(w, 0.125 - Math.cos(f) * 0.2, 0.25, (Math.sin(f) + 0.125) * 0.8); rot(tip, 0, 0, -(Math.sin(f + 2) + 0.5) * 0.75); }
        for (const [fl, flt, ff, rl, rlt, rf] of legs) {
          rot(fl, 1.3 + f1 * 0.1); rot(flt, -0.5 - f1 * 0.1); rot(ff, 0.75 + f1 * 0.1);
          rot(rl, 1 + f1 * 0.1); rot(rlt, 0.5 + f1 * 0.1); rot(rf, 0.75 + f1 * 0.1);
        }
      },
    };
  }
  const CHILD_TYPES = new Set([93, 101, 95, 92, 90, 91, 100]); // EntityAgeable: data 12 below 0 is a baby
  const MOB_MODEL = { 30: armorStand, 78: armorStand, 93: chicken, 101: rabbit, 95: wolf, 65: bat, 94: squid, 92: cow, 99: ironGolem, 66: witch, 68: guardian,
    90: pig, 67: endermite, 51: skeleton, 54: zombie, 57: pigman, 50: creeper, 61: blaze, 97: snowman, 58: enderman, 120: villager, 64: wither,
    91: sheep, 53: giant, 100: horse, 63: dragon };
  const HEIGHT = { 90: 0.9, 67: 0.3, 30: 1.975, 78: 1.975, 93: 0.7, 101: 0.7, 95: 0.85, 65: 0.9, 94: 0.95, 92: 1.3, 99: 2.9, 66: 1.95, 68: 0.85, player: 1.8,
    51: 1.95, 54: 1.95, 57: 1.95, 50: 1.7, 61: 1.8, 97: 1.9, 58: 2.9, 120: 1.95, 64: 3.5, 91: 1.3, 53: 11.7, 100: 1.6, 63: 8 };
  const WIDTH = { 61: 0.6, 58: 0.6 };

  /* ---------------------------------------------------------- the world */
  function build(S, data, opts = {}) {
    const root = new THREE.Group(); S.item.add(root);
    const plife = data.plife || 1; // Milo asked for longer-lived red dust in some (Rainbow: it lingers longer in his game)
    const batches = { particles: new Batch(root, tex("particles"), 128, 128), explosion: new Batch(root, tex("explosion"), 128, 128), tiles: new Batch(root, tileTex, 256, 256) };
    const ents = new Map();
    const W = {
      spawn(p) { batches[p.sheet || "particles"].add(p); },
    };
    const listener = new THREE.Vector3(-5, 1.68, 0), earPos = new THREE.Vector3(); // the preview camera (an armor stand's eyes)
    function sound(name, x, y, z, vol, pitch) {
      // staged victory dances are heard where the winner is (riding or standing), as he hears them in game
      const me = data.noFloor && ents.get(1), L = me ? earPos.set(me.x, me.y + 1.62, me.z) : listener;
      const d = L.distanceTo(new THREE.Vector3(x, y, z)), roll = 16 * Math.max(1, vol);
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
        case 3: p = new Spark(x, y, z, a, b, c); p.a = 0.99; break; // fireworksSpark
        case 9: p = new Crit(x, y, z, a, b, c); break;
        case 10: p = new Crit(x, y, z, a, b, c); p.r *= 0.3; p.g *= 0.8; p.tex = 66; break; // magicCrit
        case 17: { p = new Spell(x, y, z, a, b, c); const f = rand() * 0.5 + 0.35; p.r = f; p.g = 0; p.b = f; break; } // witchMagic
        case 19: p = new Drip(x, y, z, true); break;
        case 21: p = new Aura(x, y, z, a, b, c); p.tex = 82; p.r = p.g = p.b = 1; break; // happyVillager
        case 31: { const t = tileOf("item_snowball"); if (t >= 0) p = new Crumb(x, y, z, 0, 0, 0, t, 1, false); break; } // snowballpoof
        case 32: p = new SnowShovel(x, y, z, a, b, c); break;
        case 11: p = new Smoke(x, y, z, a, b, c, 1); break;
        case 12: p = new Smoke(x, y, z, a, b, c, 2.5); break;
        case 15: p = new Spell(x, y, z, a, b, c); break;
        case 18: p = new Drip(x, y, z); break;
        case 23: p = new Note(x, y, z, a); break;
        case 24: p = new Portal(x, y, z, a, b, c); break;
        case 26: p = new Flame(x, y, z, a, b, c); break;
        case 27: p = new Lava(x, y, z); break;
        case 29: p = new Cloud(x, y, z, a, b, c); break;
        case 30: p = new Reddust(x, y, z, a, b, c); p.maxAge = Math.round(p.maxAge * plife); break;
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
      const id = state & 4095, t = tileOf(BLOCK_TILE[id + ":" + (state >> 12)] || BLOCK_TILE[id]);
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
        hurt: 0, death: 0, health: 1, vehicle: null, rider: null, dead: false, attack: 0, tail: 0, ptail: 0, spike: 0, pspike: 0, target: 0, beamT: 0,
        g: new THREE.Group(),
      };
      e.swingAt = (pt) => { let d = e.swing - e.pswing; if (d < 0) d += 1; return e.pswing + d * pt; };
      scene3.add(e.g); ents.set(id, e); return e;
    }
    function setupLiving(e) {
      const corpse = new THREE.Group(); e.g.add(corpse); e.corpse = corpse;
      const bob = new THREE.Group(); corpse.add(bob); e.bobG = bob;
      const skin = e.skin || (e.killer ? KILLER_SKIN : DUMMY_SKIN);
      e.model = e.kind === "player" ? bipedSkin(e, skin, !!SLIM[skin]) : MOB_MODEL[e.type]?.(e);
      if (!e.model) return;
      const mg = new THREE.Group(); const s = e.model.scale; mg.scale.setScalar(s); mg.position.y = 1.5078125 * s; mg.add(e.model.m); bob.add(mg); e.mg = mg;
      e.height = HEIGHT[e.kind === "player" ? "player" : e.type] || 1;
      if ((e.type === 30 || e.type === 78) && (e.meta["10"] & 16)) e.height = 0; // marker stands have no size
      else if ((e.type === 30 || e.type === 78) && e.small) e.height /= 2;
      e.mats = new Set(); e.model.m.traverse((o) => { if (o.material) e.mats.add(o.material); });
      e.baseMeshes = []; (e.model.base || e.model.m).traverse((o) => { if (o.isMesh) e.baseMeshes.push(o); });
      refreshEquipment(e); showBody(e);
    }
    // ItemArmor ids 298..317: leather, chainmail, iron, diamond, gold; helmet, chestplate, leggings, boots.
    const ARMOR_MAT = ["leather", "chainmail", "iron", "diamond", "gold"];
    const armorOf = (it, piece) => it.id >= 298 && it.id <= 317 && (it.id - 298) % 4 === piece;
    function armorMats(it, layer) { // LayerBipedArmor: layer 2 for leggings, else layer 1; leather is tinted with its overlay on top
      const mat = ARMOR_MAT[Math.floor((it.id - 298) / 4)], name = "armor_" + mat + "_layer_" + layer;
      const glint = it.glint ? [glintMat("armor", 0), glintMat("armor", 1)] : [];
      if (mat !== "leather") return [emat(name), ...glint];
      const col = new THREE.Color(it.color != null ? it.color : 0xa06540);
      return [new THREE.MeshLambertMaterial({ map: tex(name), alphaTest: 0.1, color: col, side: THREE.DoubleSide }), emat(name + "_overlay"), ...glint];
    }
    function refreshEquipment(e) {
      const mdl = e.model; if (!mdl) return;
      const small = (e.type === 30 || e.type === 78) && (e.meta["10"] & 1);
      if (mdl.held) { mdl.held.clear(); if (e.eq[0]) mdl.held.add(heldItem(e.eq[0], false)); }
      if (mdl.parts?.head) { const h = mdl.parts.head; if (h.userData.worn) h.remove(h.userData.worn); h.userData.worn = null; if (e.eq[4]) { const w = wornHead(e.eq[4], false); h.add(w); h.userData.worn = w; } }
      const AP = small && mdl.kid ? mdl.kid : mdl.parts; // armour goes on the child-sized parts of a small stand
      if (AP?.body) { // chestplate (LayerBipedArmor, ModelBiped inflated by 1, leather tinted)
        const b = AP.body; if (b.userData.armor) { for (const a of b.userData.armor) a.parent.remove(a); } b.userData.armor = null;
        const it = e.eq[3];
        if (it && armorOf(it, 1)) {
          const added = [];
          for (const m of armorMats(it, 1)) {
            const bb = piece(b); cube(bb, m, 64, 32, 16, 16, [-4, 0, -2, 8, 12, 4], false, 1); added.push(bb);
            const ar = piece(AP.armR); cube(ar, m, 64, 32, 40, 16, [-3, -2, -2, 4, 12, 4], false, 1); added.push(ar);
            const al = piece(AP.armL); cube(al, m, 64, 32, 40, 16, [-1, -2, -2, 4, 12, 4], true, 1); added.push(al);
          }
          b.userData.armor = added;
        }
      }
      if (AP?.legR) { // leggings (layer 2, inflated 0.5, with the body piece) and boots (layer 1, inflated 1)
        const L = AP; if (L.legR.userData.armor) for (const a of L.legR.userData.armor) a.parent.remove(a); L.legR.userData.armor = null;
        const added = [], dy = mdl.legY || 0; // ModelArmorStandArmor's legs hang 1px higher than the stand's own

        const legs = (mats, inf) => { for (const m of mats) for (const [leg, mir] of [[L.legR, false], [L.legL, true]]) { const q = piece(leg, [0, dy, 0]); cube(q, m, 64, 32, 0, 16, [-2, 0, -2, 4, 12, 4], mir, inf); added.push(q); } };
        if (e.eq[2] && armorOf(e.eq[2], 2)) { const mats = armorMats(e.eq[2], 2); legs(mats, 0.5); for (const m of mats) { const q = piece(L.body); cube(q, m, 64, 32, 16, 16, [-4, 0, -2, 8, 12, 4], false, 0.5); added.push(q); } }
        if (e.eq[1] && armorOf(e.eq[1], 3)) legs(armorMats(e.eq[1], 1), 1);
        L.legR.userData.armor = added;
      }
      // small stands are "children": LayerCustomHead scales by 0.7 and moves 16px down,
      // LayerHeldItem moves 0.625 down, tips 20 degrees and halves, before the part's own turn.
      if (mdl.stand) {
        mdl.hl.scale.setScalar(small ? 0.7 : 1); mdl.hl.position.y = small ? -0.7 : 0;
        mdl.al.scale.setScalar(small ? 0.5 : 1); mdl.al.position.y = small ? -0.625 : 0; mdl.al.rotation.x = small ? 20 * D2R : 0;
      }
    }
    // RendererLivingEntity: an invisible mob's own model is not drawn (its layers still are).
    function showBody(e) {
      if (!e.model || e.type === 30 || e.type === 78) return;
      const shown = !(e.meta["0"] & 32); for (const o of e.baseMeshes) o.visible = shown;
      // rotateCorpse: named Dinnerbone or Grumm (a player only while showing the cape) is drawn upside down
      const nm = e.kind === "player" ? e.pname : e.meta["2"];
      e.flip = (nm === "Dinnerbone" || nm === "Grumm") && (e.kind !== "player" || !!((e.meta["10"] ?? 0) & 1));
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
      else if (e.type === 70) { const id = data & 4095; e.blockG = new THREE.Group(); e.g.add(e.blockG); modelsReady.then(() => { const b = blockMesh(blockKey(id, (data >> 12) & 15) || "gold_block"); b.position.set(-0.5, 0, -0.5); e.blockG.add(b); }); }
      else if (e.type === 76 || e.type === 62 || e.type === 61) { e.sprite = new THREE.Group(); e.g.add(e.sprite); const it = { id: e.type === 76 ? 401 : e.type === 61 ? 332 : 344 }; const n = new THREE.Group(); n.scale.setScalar(0.5); const r = renderItemNode(it); r.scale.multiplyScalar(2); n.add(r); e.sprite.add(n); }
      else if (e.type === 63 || e.type === 64) { // RenderFireball: the fire charge sprite, 2 blocks for a big fireball, half for a small one
        e.sprite = new THREE.Group(); e.g.add(e.sprite); const n = new THREE.Group(); n.scale.setScalar(e.type === 63 ? 2 : 0.5); const r = renderItemNode({ id: 385 }); r.scale.multiplyScalar(2); n.add(r); e.sprite.add(n);
      } else if (e.type === 66) { // RenderWitherSkull: ModelSkeletonHead (uv 0,35 of the wither texture), scale(-1,-1,1)
        e.skullG = new THREE.Group(); e.g.add(e.skullG); const inner = new THREE.Group(); inner.rotation.y = Math.PI; e.skullG.add(inner);
        cube(inner, emat("entity_wither"), 64, 64, 0, 35, [-4, -8, -4, 8, 8, 8]);
      } else if (e.type === 10) { // RenderMinecart: ModelMinecart 0.375 up, turned 180 - yaw
        e.cartG = new THREE.Group(); e.g.add(e.cartG); const inner = new THREE.Group(); inner.position.y = 0.375; e.cartG.add(inner); const flip = new THREE.Group(); flip.rotation.y = Math.PI; inner.add(flip);
        const mat = emat("entity_minecart");
        const p0 = piece(flip, [0, 4, 0]); cube(p0, mat, 64, 32, 0, 10, [-10, -8, -1, 20, 16, 2]); rot(p0, Math.PI / 2);
        const p5 = piece(flip, [0, 4, 0]); cube(p5, mat, 64, 32, 44, 10, [-9, -7, -1, 18, 14, 1]); rot(p5, -Math.PI / 2);
        for (const [rp, ry] of [[[-9, 4, 0], Math.PI * 3 / 2], [[9, 4, 0], Math.PI / 2], [[0, 4, -7], Math.PI], [[0, 4, 7], 0]]) { const p = piece(flip, rp); cube(p, mat, 64, 32, 0, 0, [-8, -9, -1, 16, 8, 2]); rot(p, 0, ry, 0); }
      }
      else if (e.type === 78) { e.living = true; setupLiving(e); }
      else if (e.type === 71) { // RenderItemFrame: about the hanging block's centre, turned 180 - yaw (south 0, west 90, north 180, east 270)
        e.frameG = new THREE.Group(); e.frameG.rotation.y = (180 - ((data & 3) * 90)) * D2R; e.g.add(e.frameG);
      }
    }
    // The item in a frame. A map: the frame's map model, then the map itself, 1/128 of a block a pixel,
    // turned 180 degrees about z, 0.4375 out from the frame's centre and 1/128 + 0.01 px more (MapItemRenderer);
    // its pixels are drawn with blend (1, 1 - alpha) and no lighting.
    function frameItem(e) {
      const it = e.meta["8"], key = JSON.stringify(it || null); if (e.frameKey === key) return; e.frameKey = key; e.frameG.clear();
      const isMap = it?.id === 358;
      modelsReady.then(() => { const b = blockMesh(isMap ? "item_frame_map" : "item_frame"); b.position.set(-0.5, -0.5, -0.5); e.frameG.add(b); });
      if (isMap) {
        const src = data.maps?.[it.d]; if (!src) return;
        const m = new THREE.MeshBasicMaterial({ map: tex(src), side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true });
        const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); q.rotation.y = Math.PI; q.position.z = 0.4375 - 1.01 / 128; e.frameG.add(q);
      }
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
      if (e.kind === "mob" && "12" in m && CHILD_TYPES.has(e.type)) { // a mob turned into a baby (or grew up): rebuild its model
        const c = (e.meta["12"] ?? 0) < 0;
        if (c !== e.child) { e.child = c; if (e.corpse) { e.g.remove(e.corpse); setupLiving(e); } }
      }
      if (e.type === 30 || e.type === 78) { e.small = !!(e.meta["10"] & 1); if (e.model) e.height = e.meta["10"] & 16 ? 0 : e.small ? 0.9875 : 1.975; }
      if ("6" in m && e.living) { const h = m["6"]; if (h <= 0 && e.health > 0) e.health = 0; else if (h > 0) e.health = h; }
      if (e.type === 2) setItemStack(e);
      if (e.type === 68 && "17" in m) { e.target = m["17"] || 0; e.beamT = 0; } // a new (or re-sent) target restarts the beam
      if (e.type === 76) e.fw = e.meta["8"]?.fw;
      if (e.type === 71 && e.frameG) frameItem(e);
      if (e.living) { refreshEquipment(e); nameRefresh(e); showBody(e); }
      if (e.kind === "orb") {}
    }
    function setPos2(e, x, y, z, yaw, pitch) { // setPositionAndRotation2
      if (e.living) { e.nx = x; e.ny = y; e.nz = z; e.nyaw = yaw; e.npitch = pitch; e.inc = 3; }
      else if (e.kind === "obj" && e.type === 10) { e.nx = x; e.ny = y; e.nz = z; if (yaw != null) { e.nyaw = yaw; e.npitch = pitch; } e.inc = 5; } // EntityMinecart: glides there over 3 + 2 ticks
      else { e.x = x; e.y = y; e.z = z; if (yaw != null) { e.yaw = yaw; e.pitch = pitch; } }
    }

    function handle(ev) {
      const op = ev[1];
      switch (op) {
        case "player": {
          const [, , id, x, y, z, yaw, pitch, killer] = ev;
          const e = makeEnt(id, "player", "player", x, y, z, yaw * B2D, pitch * B2D); e.living = true; e.killer = !!killer; e.sx = x; e.sy = y; e.sz = z;
          const sk = data.skins?.[id]; if (sk) { e.skin = sk[0]; SLIM[sk[0]] = !!sk[1]; e.pname = sk[2]; }
          e.head = e.phead = e.yaw; e.body = e.pbody = 0; setupLiving(e); break;
        }
        case "mob": {
          const [, , id, type, x, y, z, yaw, pitch, headYaw, meta] = ev;
          const e = makeEnt(id, "mob", type, x, y, z, yaw * B2D, pitch * B2D); e.living = true; e.sx = x; e.sy = y; e.sz = z;
          e.head = e.phead = e.body = e.pbody = headYaw * B2D;
          Object.assign(e.meta, meta); e.small = type === 30 && !!(meta["10"] & 1); e.child = CHILD_TYPES.has(type) && (meta["12"] ?? 0) < 0;
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
          else if (s === 4 && e.type === 99) e.attack = 10;
          else if (s === 1 && e.type === 101) { e.jumpDur = 10; e.jumpTicks = 0; runningParticles(e); }
          break;
        }
        case "bed": { const e = ents.get(ev[2]); if (e) e.sleeping = true; break; } // use_bed: the corpse lies on its back
        case "anim": { const e = ents.get(ev[2]); if (e && ev[3] === 0) { if (!e.swinging || e.swingInt >= 3 || e.swingInt < 0) { e.swingInt = -1; e.swinging = true; } } break; }
        case "kill": for (const id of ev[2]) { const e = ents.get(id); if (e) { e.dead = true; scene3.remove(e.g); if (e.shadow) root.remove(e.shadow); ents.delete(id); if (e.rider) e.rider.vehicle = null; if (e.vehicle) e.vehicle.rider = null; } } break;
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
          else if (id === 1022) sound("random.anvil_land", x + 0.5, y + 0.5, z + 0.5, 0.3, rand() * 0.1 + 0.9); // RenderGlobal.playAuxSFX: an anvil landing
          else if (id === 1015) sound("mob.bat.takeoff", x + 0.5, y + 0.5, z + 0.5, 0.05, (rand() - rand()) * 0.2 + 1);
          break;
        }
        case "time": if (data.sky) S.skyTime?.(ev[3]); break; // world time (only for dances that change it)
        case "tb": { // a world block by its baked model name (terrain around a victory dance); null clears it
          const [, , x, y, z, name] = ev, key = x + "," + y + "," + z;
          if (blocks[key]) { root.remove(blocks[key]); delete blocks[key]; }
          if (name) { anyBlocks = true; const g = new THREE.Group(); g.position.set(x, y, z); root.add(g); blocks[key] = g; modelsReady.then(() => g.add(blockMesh(name))); }
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
          } else if (id === 26) { // a bed (bed destroy previews): bed_head / bed_foot turned by its facing
            const g = new THREE.Group(); g.position.set(x, y, z);
            modelsReady.then(() => { const k = blockKey(id, meta); if (k) g.add(blockMesh(k)); });
            root.add(g); blocks[key] = g;
          } else if ((id === 80 || id === 78) && (y === -1 || y === 0) && Math.abs(x) <= 8 && Math.abs(z) <= 8) {
            // Snow laid over the preview floor (Snowplosion). Anything else the effect sets
            // back is the lobby's own ground, which the stage stands in for.
            const g = new THREE.Group(); g.position.set(x, y, z);
            modelsReady.then(() => { const b = blockMesh(blockKey(id, meta)); if (y === -1) { b.scale.setScalar(1.002); b.position.set(-0.001, -0.001, -0.001); } g.add(b); });
            root.add(g); blocks[key] = g;
          }
          break;
        }
      }
    }
    const blocks = {}; let anyBlocks = false; // anyBlocks: a staged world (victory dances), shadows fall on its blocks
    function runningParticles(e) { // Entity.createRunningParticles on the floor block (grass/dirt crumbs)
      const t = tileOf("block_dirt"); if (t < 0) return;
      W.spawn(new Crumb(e.x + (rand() - 0.5) * 0.6, e.y + 0.1, e.z + (rand() - 0.5) * 0.6, -e.mx * 4, 1.5, -e.mz * 4, t, 0.6, false)); // EntityDiggingFX: speeds are randomised and normalised like every particle
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
      else if (e.kind === "mob") { // EntityLiving: EntityBodyHelper keeps the body near the head, then turns it fully after the head holds still
        const bound = (a, b, mx) => a - clamp(wrap(a - b), -mx, mx);
        const dx = e.x - e.px, dz = e.z - e.pz;
        if (dx * dx + dz * dz > 2.5e-7) { e.body = e.yaw; e.head = bound(e.body, e.head, 75); e.prh = e.head; e.rtc = 0; }
        else {
          let f = 75; e.prh ??= 0; e.rtc ??= 0;
          if (Math.abs(e.head - e.prh) > 15) { e.rtc = 0; e.prh = e.head; } else if (++e.rtc > 10) f = Math.max(1 - (e.rtc - 10) / 10, 0) * 75;
          e.body = bound(e.head, e.body, f);
        }
      } else {
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
      if (e.type === 99 && e.attack > 0) e.attack--;
      // client-side particles mobs give off every tick (onLivingUpdate)
      if (e.type === 61) { // EntityBlaze: large smoke, now and then the crackle of fire
        if (rand() * 24 < 1) sound("fire.fire", e.x + 0.5, e.y + 0.5, e.z + 0.5, 1 + rand(), rand() * 0.7 + 0.3);
        for (let i = 0; i < 2; i++) W.spawn(new Smoke(e.x + (rand() - 0.5) * 0.6, e.y + rand() * 1.8, e.z + (rand() - 0.5) * 0.6, 0, 0, 0, 2.5));
      }
      if (e.type === 58) for (let i = 0; i < 2; i++) W.spawn(new Portal(e.x + (rand() - 0.5) * 0.6, e.y + rand() * 2.9 - 0.25, e.z + (rand() - 0.5) * 0.6, (rand() - 0.5) * 2, -rand(), (rand() - 0.5) * 2)); // EntityEnderman
      if (e.type === 64 && e.wy) { // EntityWither: side heads turn to the body, smoke from all three heads, summoning sparkles
        for (let j = 0; j < 2; j++) { e.pwy[j] = e.wy[j]; e.wy[j] += clamp(wrap(e.body - e.wy[j]), -10, 10); }
        for (let l = 0; l < 3; l++) {
          const f = (e.body + 180 * (l - 1)) * D2R, hx = l ? e.x + Math.cos(f) * 1.3 : e.x, hy = l ? e.y + 2.2 : e.y + 3, hz = l ? e.z + Math.sin(f) * 1.3 : e.z;
          W.spawn(new Smoke(hx + gauss() * 0.3, hy + gauss() * 0.3, hz + gauss() * 0.3, 0, 0, 0, 1));
        }
        if ((e.meta["20"] || 0) > 0) for (let i = 0; i < 3; i++) W.spawn(new Spell(e.x + gauss(), e.y + rand() * 3.3, e.z + gauss(), 0.7, 0.7, 0.9));
      }
      if (e.type === 68) { // out of water: the tail beats fast and the spikes twitch at random; the beam charges while it has a target
        e.ptail = e.tail || 0; e.tail = e.ptail + 2; e.pspike = e.spike ?? 0; e.spike = rand();
        if (e.target) { if (e.beamT < 80) e.beamT++; } else e.beamT = 0;
      }
      if (e.type === 101) { if (e.jumpTicks !== e.jumpDur) e.jumpTicks++; else if (e.jumpDur !== 0) { e.jumpTicks = 0; e.jumpDur = 0; } }
    }
    function limbs(e) {
      const dx = e.x - e.px, dz = e.z - e.pz; let f = Math.sqrt(dx * dx + dz * dz) * 4; if (f > 1) f = 1;
      e.la += (f - e.la) * 0.4; e.ls += e.la;
    }
    function tickObject(e) {
      e.px = e.x; e.py = e.y; e.pz = e.z; e.pyaw = e.yaw; e.ppitch = e.pitch;
      if (e.inc > 0 && e.kind === "obj" && e.type === 10) {
        e.x += (e.nx - e.x) / e.inc; e.y += (e.ny - e.y) / e.inc; e.z += (e.nz - e.z) / e.inc;
        if (e.nyaw != null) { e.yaw += wrap(e.nyaw - e.yaw) / e.inc; e.pitch += (e.npitch - e.pitch) / e.inc; } e.inc--;
      }
      if (e.kind === "obj" && (e.type === 63 || e.type === 64 || e.type === 66)) { // EntityFireball: moves by its motion, which slows by 0.95 a tick (the server's velocity packets keep it going)
        e.x += e.mx; e.y += e.my; e.z += e.mz; const f = e.type === 66 && e.meta?.["10"] ? 0.73 : 0.95; e.mx *= f; e.my *= f; e.mz *= f;
      }
      if (e.type === 2 || e.kind === "orb" || e.type === 50 || e.type === 70) {
        const grav = e.kind === "orb" ? 0.03 : 0.04;
        e.my -= grav;
        if (e.kind === "orb") { // pulled toward the nearest player within 8 blocks
          let best = null, bd = 64;
          for (const o of ents.values()) if (o.kind === "player" && o.health > 0) { const d = (o.x - e.x) ** 2 + (o.y + 1.62 - e.y) ** 2 + (o.z - e.z) ** 2; if (d < bd) { bd = d; best = o; } }
          if (best) { const dx = (best.x - e.x) / 8, dy = (best.y + 1.62 / 2 - e.y) / 8, dz = (best.z - e.z) / 8, d = Math.sqrt(dx * dx + dy * dy + dz * dz); let k = 1 - d; if (k > 0) { k *= k; e.mx += dx / d * k * 0.1; e.my += dy / d * k * 0.1; e.mz += dz / d * k * 0.1; } }
        }
        let dy = e.my; e.onGround = false;
        if (!data.noFloor && e.y >= 0 && e.y + dy < 0) { dy = -e.y; e.onGround = true; } // staged scenes (noFloor) end each fall with its landing instead
        e.x += e.mx; e.y += dy; e.z += e.mz; if (e.onGround) e.my = 0; // Block.onLanded
        const f = e.onGround ? 0.6 * 0.98 : 0.98;
        e.mx *= f; e.my *= 0.98; e.mz *= f;
        if (e.onGround) e.my *= e.kind === "orb" ? -0.9 : e.type === 50 ? -0.5 : e.type === 2 ? -0.5 : 0;
        if (e.type === 50) { e.fuse--; W.spawn(new Smoke(e.x, e.y + 0.5, e.z, 0, 0, 0)); }
        if (e.kind === "orb") e.color++;
      } else if (e.type === 76) { // EntityFireworkRocket
        e.mx *= 1.15; e.mz *= 1.15; e.my += 0.04; e.x += e.mx; e.y += e.my; e.z += e.mz;
        W.spawn(new Spark(e.x, e.y - 0.3, e.z, gauss() * 0.05, -e.my * 0.5, gauss() * 0.05));
      } else if (e.type === 62 || e.type === 61) { // thrown egg / snowball (EntityThrowable): gravity 0.03, drag 0.99
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
      else { // updateRiderPosition: the vehicle's mounted offset (height * 0.75; minecarts 0) plus the rider's own (players -0.35)
        r.x = v.x; r.y = v.y + (v.kind === "obj" && v.type === 10 ? 0 : (v.height || 0.9) * 0.75) + (r.kind === "player" ? -0.35 : 0); r.z = v.z;
      }
      if (r.kind === "player" && v.living) { // RendererLivingEntity: a rider of a living vehicle turns its body with the vehicle, within 85 degrees of its head
        let d = clamp(wrap(r.head - v.body), -85, 85); r.body = r.head - d + (d * d > 2500 ? d * 0.2 : 0);
      }
      if (r.vehicle && r.kind !== "player") { r.nx = r.x; r.ny = r.y; r.nz = r.z; r.inc = 0; }
    }

    // ---- guardian beams (RenderGuardian): two crossed strips from the eye to the
    // target's middle, scrolling, coloured by how far the attack has charged.
    const beamTex = tex("entity_guardian_beam"); beamTex.wrapS = beamTex.wrapT = THREE.RepeatWrapping;
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, side: THREE.DoubleSide, alphaTest: 0.1 });
    function drawBeam(e, pt) {
      const t = e.target && ents.get(e.target);
      if (!t || e.dead) { if (e.beam) e.beam.visible = false; return; }
      if (!e.beam) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(36), 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(24), 2));
        geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
        e.beam = new THREE.Mesh(geo, beamMat.clone()); e.beam.rotation.order = "YXZ"; scene3.add(e.beam);
      }
      const b = e.beam; b.visible = true;
      const f = Math.min(1, (e.beamT + pt) / 80), f1 = n + pt, f2 = (f1 * 0.5) % 1, eh = 0.425;
      const me = new THREE.Vector3(lerp(e.px, e.x, pt), lerp(e.py, e.y, pt) + eh, lerp(e.pz, e.z, pt));
      const to = new THREE.Vector3(lerp(t.px, t.x, pt), lerp(t.py, t.y, pt) + (t.height || 1) * 0.5, lerp(t.pz, t.z, pt));
      const v = to.sub(me), d0 = v.length() + 1; v.normalize();
      b.position.copy(me); b.rotation.set(Math.acos(v.y), Math.PI / 2 - Math.atan2(v.z, v.x), 0);
      const d1 = f1 * 0.05 * -1.5, f7 = f * f;
      b.material.color.setRGB((64 + Math.floor(f7 * 240)) / 255, (32 + Math.floor(f7 * 192)) / 255, (128 - Math.floor(f7 * 64)) / 255).convertSRGBToLinear();
      const c = (a, r) => [Math.cos(d1 + a) * r, Math.sin(d1 + a) * r];
      const [x12, z12] = c(Math.PI, 0.2), [x14, z14] = c(0, 0.2), [x16, z16] = c(Math.PI / 2, 0.2), [x18, z18] = c(Math.PI * 1.5, 0.2);
      const [x4, z4] = c(2.356194490192345, 0.282), [x6, z6] = c(Math.PI / 4, 0.282), [x8, z8] = c(3.9269908169872414, 0.282), [x10, z10] = c(5.497787143782138, 0.282);
      const v24 = -1 + f2, v25 = d0 * 2.5 + v24, cap = e.age % 2 === 0 ? 0.5 : 0;
      const P = [x12, d0, z12, x12, 0, z12, x14, 0, z14, x14, d0, z14, x16, d0, z16, x16, 0, z16, x18, 0, z18, x18, d0, z18, x4, d0, z4, x6, d0, z6, x10, d0, z10, x8, d0, z8];
      const U = [0.4999, v25, 0.4999, v24, 0, v24, 0, v25, 0.4999, v25, 0.4999, v24, 0, v24, 0, v25, 0.5, cap + 0.5, 1, cap + 0.5, 1, cap, 0.5, cap];
      for (let i = 1; i < U.length; i += 2) U[i] = 1 - U[i]; // the game's v runs down the picture
      b.geometry.attributes.position.array.set(P); b.geometry.attributes.position.needsUpdate = true;
      b.geometry.attributes.uv.array.set(U); b.geometry.attributes.uv.needsUpdate = true; b.geometry.computeBoundingSphere();
    }

    // ---- per frame
    const camPos = new THREE.Vector3();
    // Render.renderShadow: the soft round shadow under a mob or player on the block below it,
    // alpha (1 - height above it / 2) * 0.5, radius the renderer's shadowSize (half for babies).
    const SHADOW = { player: 0.5, 90: 0.7, 92: 0.7, 91: 0.7, 94: 0.7, 93: 0.3, 101: 0.3, 65: 0.25, 95: 0.5, 100: 0.75, 64: 1, 53: 3, 63: 0.5 };
    let shadowMat = null;
    function groundBelow(x, y, z) {
      const bx = Math.floor(x), bz = Math.floor(z);
      if (anyBlocks) { for (let yy = Math.floor(y + 0.01); yy > y - 3; yy--) if (blocks[bx + "," + (yy - 1) + "," + bz]) return yy; return null; }
      return data.noFloor || y < -0.01 || Math.hypot(x, z) > 8.5 ? null : 0;
    }
    function drawShadow(e, x, y, z) {
      const r = (e.kind === "player" ? SHADOW.player : SHADOW[e.type] ?? 0.5) * (e.child ? 0.5 : 1);
      const inv = ((e.meta["0"] ?? 0) & 32) && e.kind !== "player";
      const gy = !inv && !e.dead && !(e.type === 30 || e.type === 78) ? groundBelow(x, y, z) : null;
      const a = gy == null ? 0 : (1 - (y - gy) / 2) * 0.5;
      if (a <= 0.01) { if (e.shadow) e.shadow.visible = false; return; }
      if (!e.shadow) {
        shadowMat ||= new THREE.MeshBasicMaterial({ map: tex("misc_shadow"), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        e.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat.clone()); root.add(e.shadow);
      }
      e.shadow.visible = true; e.shadow.position.set(x, gy + 0.002, z); e.shadow.scale.set(r * 2, 1, r * 2); e.shadow.material.opacity = Math.min(1, a);
    }
    function draw(pt) {
      S.camera.getWorldPosition(camPos);
      for (const e of ents.values()) if (e.type === 68) {
        const t = e.target && ents.get(e.target); // its eye follows the target, or else the viewer
        e.lookAt = t ? new THREE.Vector3(t.x, t.y + (t.height || 1) * 0.85, t.z) : camPos.clone();
        drawBeam(e, pt);
      }
      for (const e of ents.values()) {
        const x = lerp(e.px, e.x, pt), y = lerp(e.py, e.y, pt), z = lerp(e.pz, e.z, pt);
        e.g.position.set(x, y - (e.kind === "player" && !e.vehicle && ((e.meta?.["0"] ?? 0) & 2) ? 0.125 : 0), z); // RenderPlayer: a sneaking player is drawn 0.125 lower
        if (e.living && e.model) {
          drawShadow(e, x, y, z);
          const body = lerpAng(e.pbody, e.body, pt);
          e.g.rotation.y = -(body + (e.model.yawOff || 0)) * D2R;
          let zr = 0;
          if (e.death > 0) { let f = (e.death + pt - 1) / 20 * 1.6; f = Math.sqrt(f); if (f > 1) f = 1; zr = f * 90; }
          e.corpse.rotation.set(0, 0, -zr * D2R);
          if (e.flip) { e.corpse.position.y = e.height + 0.1; e.corpse.rotation.z += Math.PI; } else e.corpse.position.y = 0;
          if (e.sleeping) { // RenderPlayer.rotateCorpse while sleeping (no bed there, so facing 0): lies on its back, head toward -x
            e.g.rotation.y = 0; e.corpse.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2, "ZYX"));
          }
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
        } else if (e.cartG || e.skullG) {
          const yaw = lerpAng(e.pyaw ?? e.yaw, e.yaw, pt);
          if (e.cartG) e.cartG.rotation.y = (180 - yaw) * D2R; else { e.skullG.rotation.y = -yaw * D2R; }
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
    // Where the effect is happening, for a camera that drifts after it: the middle of
    // every effect entity and live particle, held toward the fight so it only leans.
    function focus() {
      let x = 0, y = 1, z = -1, sx = 0, sy = 0, sz = 0, sw = 0;
      const addP = (px, py, pz, k) => { sx += px * k; sy += py * k; sz += pz * k; sw += k; };
      for (const e of ents.values()) {
        if (e.kind === "player" || (e.type === 30 && Math.abs(e.sx + 5) < 0.01 && Math.abs(e.sz) < 0.01)) continue; // fighters and the preview camera stand
        if (e.g && !e.g.visible) continue;
        addP(e.x, e.y + (e.height || 0.5) / 2, e.z, 3);
      }
      for (const b of Object.values(batches)) for (let i = 0; i < b.list.length; i += Math.max(1, b.list.length >> 7)) { const q = b.list[i]; addP(q.x, q.y, q.z, 1); }
      if (sw > 0) { const k = Math.min(1, sw / 12); x += (sx / sw - x) * k; y += (sy / sw - y) * k; z += (sz / sw - z) * k; }
      return { x, y, z, w: sw };
    }
    const run = (t) => {
      const ms = T0 + t * 1000;
      while (T0 + n * TICK <= ms) {
        const until = T0 + n * TICK;
        while (k < ev.length && ev[k][0] <= until) handle(ev[k++]);
        tick(); n++;
      }
      animateTextures(n);
      const pt = clamp((ms - (T0 + (n - 1) * TICK)) / TICK, 0, 1);
      draw(pt);
    };
    run.focus = focus;
    run.me = () => { const e = ents.get(1); return e ? { x: e.x, y: e.y, z: e.z } : null; }; // the winner (victory dances that fly off with him)
    return run;
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
  // A skin is slim (3-pixel arms) when the strip a 4-pixel arm would use is empty.
  const SLIM = {};
  const skinShape = (n) => img(n).then((i) => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d"); x.drawImage(i, 0, 0); SLIM[n] = x.getImageData(54, 20, 1, 1).data[3] === 0; }).catch(() => {});
  function preload(data) {
    const heads = data ? [...new Set((JSON.stringify(data).match(/"head":"[0-9a-f]+"/g) || []).map((x) => x.slice(8, -1)))].map((h) => `cosmetics/heads/${h}.png`) : [];
    const blockTex = () => { const t = new Set(); for (const d of Object.values(MODELS || {})) for (const e of (Array.isArray(d) ? d : d.e || [])) for (const f of Object.values(e.faces)) t.add("block_" + f.t); return [...t]; };
    const itemTex = () => Object.values(MODELS || {}).flatMap((d) => d.flat || []);
    const maps = Object.values(data?.maps || {});
    const banners = data?.ev ? [...new Set(data.ev.flatMap((e) => (e[1] === "eq" && e[4]?.banner ? e[4].banner[1].map((p) => p[0]) : [])))] : [];
    return Promise.all([atlasReady, modelsReady.then(() => Promise.all(blockTex().concat(itemTex()).map((n) => img(n).catch(() => {})))), loadFont(), skinShape(KILLER_SKIN), skinShape(DUMMY_SKIN), ...Object.values(data?.skins || {}).map((k) => img(k[0]).catch(() => {})),
      ...Object.values(ITEM_TEX).flatMap((n) => [img(n).catch(() => {}), n.startsWith("item_leather_") ? img(n + "_overlay").catch(() => {}) : null]), ...ALL_TEX.concat(DYES.map((d) => "item_dye_" + d), heads, banners.length ? ["banner_base", ...banners.map((b) => "banner_" + (PATTERN[b] || "base"))] : [], maps).map((n) => img(n).catch(() => {}))]);
  }
  return { build, preload };
}
