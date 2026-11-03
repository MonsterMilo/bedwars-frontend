// Builds the block data for the replay renderer:
//   ../replay/blocks.png  - every block texture in one image (an atlas),
//                           each tile padded by repeating its edge pixels so
//                           neighbouring tiles never bleed into each other;
//                           animated textures (water, lava, fire...) keep
//                           all their frames side by side in one row.
//   ../replay/blocks.json - for each 1.8 block id:meta, its block state; the
//                           block states and the models they use (parents
//                           already merged in); where each texture sits in
//                           the atlas; grass/leaf colours.
// Textures and models are 1.13.2's (1.8's look, before the 1.14 texture
// update, with the cleaner block-state format); beds use 1.8's own models,
// since 1.13 drew beds differently.
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, '..', 'replay')
const A = path.join(here, 'node_modules', 'minecraft-assets', 'minecraft-assets', 'data')
const D = path.join(here, 'node_modules', 'minecraft-data', 'minecraft-data', 'data')
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

const legacy = readJson(path.join(D, 'pc', 'common', 'legacy.json')).blocks
const states13 = readJson(path.join(A, '1.13.2', 'blocks_states.json'))
const models13 = readJson(path.join(A, '1.13.2', 'blocks_models.json'))
const states18 = readJson(path.join(A, '1.8.8', 'blocks_states.json'))
const models18 = readJson(path.join(A, '1.8.8', 'blocks_models.json'))

// Model names: 1.13 uses "block/x", 1.8 plain "x" (kept apart as "old/x").
const modelKey = (name, old) => old ? 'old/' + name.replace(/^block\//, '') : name.replace(/^block\//, '')
const rawModel = (key) => key.startsWith('old/') ? models18[key.slice(4)] : models13[key]

// 1.8 block id:meta -> "name[props]" (1.13 names).
const legacyOut = {}
for (const [k, v] of Object.entries(legacy)) {
  const [id, meta] = k.split(':').map(Number)
  if (id > 255 || meta > 15) continue
  legacyOut[(id << 4) | meta] = v.replace(/^minecraft:/, '')
}

// Block states, with beds swapped for 1.8's.
const states = {}
for (const name of new Set(Object.values(legacyOut).map(s => s.split('[')[0]))) states[name] = states13[name]
const bed18 = states18.bed
states.red_bed = { variants: {} }
for (const [k, v] of Object.entries(bed18.variants)) states.red_bed.variants[k] = { ...v, model: 'old/' + v.model }

// Merge each model with its parents.
const models = {}
function resolve (key) {
  if (models[key]) return models[key]
  const raw = rawModel(key)
  if (!raw) { models[key] = { textures: {}, elements: [] }; return models[key] }
  const old = key.startsWith('old/')
  let base = { textures: {}, elements: null, ambientocclusion: true }
  if (raw.parent && !/builtin/.test(raw.parent)) base = resolve(modelKey(raw.parent, old))
  const m = {
    textures: { ...base.textures, ...(raw.textures || {}) },
    elements: raw.elements || base.elements,
    ambientocclusion: raw.ambientocclusion !== undefined ? raw.ambientocclusion : base.ambientocclusion
  }
  models[key] = m
  return m
}
const used = new Set()
for (const st of Object.values(states)) {
  if (!st) continue
  const add = (a) => { for (const x of [].concat(a)) used.add(x.model.startsWith('old/') ? x.model : modelKey(x.model, false)) }
  if (st.variants) for (const v of Object.values(st.variants)) add(v)
  if (st.multipart) for (const p of st.multipart) add(p.apply)
}
const outModels = {}
const textureNames = new Set()
for (const key of used) {
  const m = resolve(key)
  const tex = (ref, depth = 0) => {
    if (!ref || depth > 8) return null
    if (ref[0] === '#') return tex(m.textures[ref.slice(1)], depth + 1)
    return ref
  }
  const elements = (m.elements || []).map(el => {
    const faces = {}
    for (const [dir, f] of Object.entries(el.faces || {})) {
      const t = tex(f.texture)
      if (!t) continue
      textureNames.add(t)
      faces[dir] = { ...f, texture: t }
    }
    return { ...el, faces }
  })
  outModels[key] = { ao: m.ambientocclusion !== false, elements }
}
// Textures the renderer draws itself (fluids, chests).
for (const t of ['block/water_still', 'block/water_flow', 'block/lava_still', 'block/lava_flow']) textureNames.add(t)
const extraImages = { 'entity/chest/normal': [64, 64], 'entity/chest/ender': [64, 64], 'entity/chest/trapped': [64, 64] }

// --- Atlas ---
const PAD = 2
const texFile = (name) => {
  if (name.startsWith('blocks/')) return path.join(A, '1.8.8', 'blocks', name.slice(7) + '.png')
  if (name.startsWith('entity/')) return path.join(A, '1.13.2', name + '.png')
  return path.join(A, '1.13.2', 'blocks', name.replace(/^block\//, '') + '.png')
}
const images = []
for (const name of textureNames) {
  const file = texFile(name)
  if (!fs.existsSync(file)) { console.warn('missing texture', name); continue }
  const png = PNG.sync.read(fs.readFileSync(file))
  const w = png.width
  let frames = [0]; let frametime = 1
  if (png.height > w) {
    const n = Math.floor(png.height / w)
    frames = [...Array(n).keys()]
    const metaFile = file + '.mcmeta'
    if (fs.existsSync(metaFile)) {
      const anim = readJson(metaFile).animation || {}
      frametime = anim.frametime || 1
      if (Array.isArray(anim.frames)) frames = anim.frames.map(f => typeof f === 'number' ? f : f.index)
    }
  }
  images.push({ name, png, size: w, frames, frametime })
}
for (const [name, [w, h]] of Object.entries(extraImages)) {
  const png = PNG.sync.read(fs.readFileSync(texFile(name)))
  images.push({ name, png, size: w, height: h, frames: [0], frametime: 1, whole: true })
}
// Shelf packing: one row per animated texture, static tiles fill rows.
const W = 2048
let x = 0; let y = 0; let rowH = 0
const place = {}
images.sort((a, b) => (b.frames.length - a.frames.length) || ((b.height || b.size) - (a.height || a.size)))
for (const img of images) {
  const tw = img.size + PAD * 2; const th = (img.height || img.size) + PAD * 2
  const need = tw * img.frames.length
  if (x + need > W) { x = 0; y += rowH; rowH = 0 }
  place[img.name] = { x: x + PAD, y: y + PAD, w: img.size, h: img.height || img.size, stride: tw, n: img.frames.length, ft: img.frametime }
  img.at = { x, y }
  x += need; rowH = Math.max(rowH, th)
}
const H = 1 << Math.ceil(Math.log2(y + rowH))
const atlas = new PNG({ width: W, height: H })
for (const img of images) {
  const p = place[img.name]
  const fh = img.height || img.size
  img.frames.forEach((frame, fi) => {
    const ox = p.x + fi * p.stride; const oy = p.y
    for (let dy = -PAD; dy < fh + PAD; dy++) {
      for (let dx = -PAD; dx < img.size + PAD; dx++) {
        const sx = Math.min(img.size - 1, Math.max(0, dx)); const sy = Math.min(fh - 1, Math.max(0, dy)) + frame * img.size
        const si = (sy * img.png.width + sx) * 4; const di = ((oy + dy) * W + ox + dx) * 4
        for (let c = 0; c < 4; c++) atlas.data[di + c] = img.png.data[si + c]
      }
    }
  })
}
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'blocks.png'), PNG.sync.write(atlas))

// Plains colours for grass and leaves (temperature 0.8, rainfall 0.4).
const colormap = (file) => {
  const png = PNG.sync.read(fs.readFileSync(path.join(A, '1.13.2', 'colormap', file)))
  const t = 0.8; const r = 0.4 * t
  const px = Math.floor((1 - t) * 255); const py = Math.floor((1 - r) * 255)
  const i = (py * png.width + px) * 4
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
// --- Items: their own atlas; block items are drawn as small blocks. ---
const legacyItems = readJson(path.join(D, 'pc', 'common', 'legacy.json')).items
const itemLegacy = {}
const itemTex = {}
const itemImgs = []
for (const [k, v] of Object.entries(legacyItems)) {
  const name = v.replace(/^minecraft:/, '')
  itemLegacy[k] = name
  if (itemTex[name] !== undefined) continue
  const file = path.join(A, '1.13.2', 'items', name + '.png')
  itemTex[name] = null
  if (fs.existsSync(file)) itemImgs.push({ name, png: PNG.sync.read(fs.readFileSync(file)) })
}
for (const extra of ['leather_helmet_overlay', 'leather_chestplate_overlay', 'leather_leggings_overlay', 'leather_boots_overlay', 'potion_overlay', 'bow_pulling_0', 'bow_pulling_1', 'bow_pulling_2']) {
  const file = path.join(A, '1.13.2', 'items', extra + '.png')
  if (fs.existsSync(file)) itemImgs.push({ name: extra, png: PNG.sync.read(fs.readFileSync(file)) })
}
const IP = 1; const IT = 16 + IP * 2; const IW = 1024
const perRow = Math.floor(IW / IT)
const IH = 1 << Math.ceil(Math.log2(Math.ceil(itemImgs.length / perRow) * IT))
const itemAtlas = new PNG({ width: IW, height: IH })
itemImgs.forEach((img, i) => {
  const ox = (i % perRow) * IT + IP; const oy = Math.floor(i / perRow) * IT + IP
  const sz = img.png.width
  for (let dy = -IP; dy < 16 + IP; dy++) {
    for (let dx = -IP; dx < 16 + IP; dx++) {
      const sx = Math.floor(Math.min(15, Math.max(0, dx)) * sz / 16); const sy = Math.floor(Math.min(15, Math.max(0, dy)) * sz / 16)
      const si = (sy * img.png.width + sx) * 4; const di = ((oy + dy) * IW + ox + dx) * 4
      for (let c = 0; c < 4; c++) itemAtlas.data[di + c] = img.png.data[si + c]
    }
  }
  itemTex[img.name] = { x: ox, y: oy }
})
for (const k of Object.keys(itemTex)) if (!itemTex[k]) delete itemTex[k]
fs.writeFileSync(path.join(out, 'items.png'), PNG.sync.write(itemAtlas))

// Whole images the page uses as they are.
const copies = {
  'armor/leather_layer_1.png': '1.13.2/models/armor/leather_layer_1.png',
  'armor/leather_layer_1_overlay.png': '1.13.2/models/armor/leather_layer_1_overlay.png',
  'armor/leather_layer_2.png': '1.13.2/models/armor/leather_layer_2.png',
  'armor/leather_layer_2_overlay.png': '1.13.2/models/armor/leather_layer_2_overlay.png',
  'armor/chainmail_layer_1.png': '1.13.2/models/armor/chainmail_layer_1.png',
  'armor/chainmail_layer_2.png': '1.13.2/models/armor/chainmail_layer_2.png',
  'armor/iron_layer_1.png': '1.13.2/models/armor/iron_layer_1.png',
  'armor/iron_layer_2.png': '1.13.2/models/armor/iron_layer_2.png',
  'armor/gold_layer_1.png': '1.13.2/models/armor/gold_layer_1.png',
  'armor/gold_layer_2.png': '1.13.2/models/armor/gold_layer_2.png',
  'armor/diamond_layer_1.png': '1.13.2/models/armor/diamond_layer_1.png',
  'armor/diamond_layer_2.png': '1.13.2/models/armor/diamond_layer_2.png',
  'entity/villager.png': '1.13.2/entity/villager/villager.png',
  'entity/iron_golem.png': '1.13.2/entity/iron_golem.png',
  'entity/silverfish.png': '1.13.2/entity/silverfish.png',
  'entity/arrow.png': '1.13.2/entity/projectiles/arrow.png',
  ...Object.fromEntries([...Array(10).keys()].map(i => ['blocks/destroy_stage_' + i + '.png', '1.8.8/blocks/destroy_stage_' + i + '.png'])),
  'entity/glint.png': '1.8.8/misc/enchanted_item_glint.png',
  'particles.png': '1.8.8/particle/particles.png',
  'explosion.png': '1.13.2/entity/explosion.png'
}
for (const [to, from] of Object.entries(copies)) {
  const src = path.join(A, from)
  if (!fs.existsSync(src)) { console.warn('missing', from); continue }
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true })
  fs.copyFileSync(src, path.join(out, to))
}

// Average colour of each block texture, for block-break pieces.
const avg = {}
for (const img of images) {
  if (img.whole) continue
  let r = 0; let g = 0; let b = 0; let n = 0
  for (let i = 0; i < img.size * img.size; i++) { const a = img.png.data[i * 4 + 3]; if (a < 128) continue; r += img.png.data[i * 4]; g += img.png.data[i * 4 + 1]; b += img.png.data[i * 4 + 2]; n++ }
  if (n) avg[img.name] = [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

const data = {
  atlas: { w: W, h: H },
  items: { legacy: itemLegacy, textures: itemTex, atlas: { w: IW, h: IH } },
  avgColors: avg,
  legacy: legacyOut,
  states,
  models: outModels,
  textures: place,
  tints: { grass: colormap('grass.png'), foliage: colormap('foliage.png'), water: [63, 118, 228] }
}
fs.writeFileSync(path.join(out, 'blocks.json'), JSON.stringify(data))
console.log('atlas', W + 'x' + H, images.length, 'textures;', Object.keys(outModels).length, 'models;', Object.keys(states).length, 'block states')
