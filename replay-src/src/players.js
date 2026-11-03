// Player models for the replay: Minecraft 1.8's player (and its animation
// maths from ModelBiped), wearing the skin each player had in the game,
// their armour (team-coloured leather included) and the item in their
// hand, with a name tag in their team colour.
const THREE = require('three')
const { glintMaterial } = require('./glint')

const STEVE = 'replay/steve.png'
const PX = 1 / 16
const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')
const texCache = new Map()

function loadTex (url, onLoad) {
  let entry = texCache.get(url)
  if (entry) { if (entry.tex) onLoad(entry.tex); else entry.waiting.push(onLoad); return }
  entry = { tex: null, waiting: [onLoad] }
  texCache.set(url, entry)
  loader.load(url, (tex) => {
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter
    entry.tex = tex
    for (const f of entry.waiting) f(tex)
    entry.waiting = []
  }, undefined, () => {
    texCache.delete(url)
    if (url !== STEVE) loadTex(STEVE, (t) => { for (const f of entry.waiting) f(t); entry.waiting = [] })
  })
}

/** The skin URL from a tab-list "textures" property, or null. */
function skinUrl (prop) {
  if (!prop) return null
  try {
    const j = JSON.parse(atob(prop))
    const u = j && j.textures && j.textures.SKIN && j.textures.SKIN.url
    return u ? u.replace(/^http:/, 'https:') : null
  } catch { return null }
}

/** A box of w*h*d texture pixels, UV-mapped Minecraft-style from (u, v). */
function texBox (w, h, d, u, v, texW, texH, inflate = 0, mirror = false) {
  const g = new THREE.BoxGeometry((w + inflate * 2) * PX, (h + inflate * 2) * PX, (d + inflate * 2) * PX)
  const uv = g.attributes.uv
  const rect = (face, x, y, fw, fh) => {
    let u0 = x / texW; let u1 = (x + fw) / texW
    if (mirror) [u0, u1] = [u1, u0]
    const v0 = 1 - y / texH; const v1 = 1 - (y + fh) / texH
    const k = face * 4
    uv.setXY(k, u0, v0); uv.setXY(k + 1, u1, v0); uv.setXY(k + 2, u0, v1); uv.setXY(k + 3, u1, v1)
  }
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z. Models face +z.
  rect(mirror ? 1 : 0, u + d + w, v + d, d, h)
  rect(mirror ? 0 : 1, u, v + d, d, h)
  rect(2, u + d, v, w, d)
  rect(3, u + d + w, v, w, d)
  rect(4, u + d, v + d, w, h)
  rect(5, u + 2 * d + w, v + d, w, h)
  uv.needsUpdate = true
  return g
}

/** Text in Minecraft colours (§ codes) on a dark plate, as a sprite. */
function textSprite (text, { color = '#ffffff', scale = 0.3, plate = true } = {}) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const font = '600 40px "Segoe UI", Arial, sans-serif'
  const parts = []
  let cur = color
  for (const p of String(text).split(/(§[0-9a-fk-or])/i)) {
    const m = p.match(/^§([0-9a-f])$/i)
    if (m) { cur = MC[m[1].toLowerCase()]; continue }
    if (/^§/.test(p)) continue
    if (p) parts.push([p, cur])
  }
  ctx.font = font
  const w = Math.ceil(parts.reduce((s, [p]) => s + ctx.measureText(p).width, 0)) + 24
  c.width = Math.max(8, w); c.height = 56
  ctx.font = font
  if (plate) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.textBaseline = 'middle'
  let x = 12
  for (const [p, col] of parts) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p, x + 3, 31)
    ctx.fillStyle = col; ctx.fillText(p, x, 28)
    x += ctx.measureText(p).width
  }
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.renderOrder = 10
  s.scale.set(c.width / 56 * scale, scale, 1)
  return s
}
const MC = { 0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa', 8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' }

// Armour material by item id (1.8): helmet, chest, legs, boots per material.
const ARMOR = {}
const ARMOR_SETS = { leather: 298, chainmail: 302, iron: 306, diamond: 310, gold: 314 }
for (const [mat, first] of Object.entries(ARMOR_SETS)) for (let k = 0; k < 4; k++) ARMOR[first + k] = mat

const SWORDS = new Set([267, 268, 272, 276, 283])
const TOOLS = new Set([256, 257, 258, 269, 270, 271, 273, 274, 275, 277, 278, 279, 284, 285, 286, 290, 291, 292, 293, 294, 346, 359, 369, 280])

class PlayerModel {
  constructor (track, items) {
    this.track = track
    this.items = items
    this.group = new THREE.Group()
    this.pose = new THREE.Group() // everything that tips over on death
    this.group.add(this.pose)
    this.skinMats = []
    this.parts = {}
    this.armor = [null, null, null, null, null]
    this.armorKey = ['', '', '', '', '']
    this.build(64)
    this.tag = textSprite(track.name || '?', { color: track.team ? track.team.color : '#ffffff' })
    this.tag.position.y = 2.2
    this.group.add(this.tag)
    loadTex(track.skinUrl || STEVE, (tex) => this.setSkin(tex))
  }

  build (texH) {
    for (const p of Object.values(this.parts)) this.pose.remove(p)
    this.parts = {}
    this.skinMats = []
    const mat = () => { const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }); this.skinMats.push(m); if (this.tex) m.map = this.tex; return m }
    const base = mat(); const over = mat()
    const legacy = texH === 32
    const B = (w, h, d, u, v, inf = 0, mirror = false) => texBox(w, h, d, u, v, 64, texH, inf, mirror)
    // A part hangs from a pivot so it can rotate at the joint (pixels, y up).
    const part = (name, pivot, boxes) => {
      const p = new THREE.Group(); p.position.set(pivot[0] * PX, pivot[1] * PX, 0)
      p.userData.pivot = pivot
      for (const [geo, off, m] of boxes) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(off[0] * PX, off[1] * PX, off[2] * PX || 0); p.add(mesh) }
      this.pose.add(p); this.parts[name] = p
      return p
    }
    const ov = (arr) => legacy ? [] : arr
    part('head', [0, 24], [[B(8, 8, 8, 0, 0), [0, 4], base], [B(8, 8, 8, 32, 0, 0.5), [0, 4], over]])
    part('body', [0, 24], [[B(8, 12, 4, 16, 16), [0, -6], base], ...ov([[B(8, 12, 4, 16, 32, 0.25), [0, -6], over]])])
    part('rightArm', [-5, 22], [[B(4, 12, 4, 40, 16), [-1, -4], base], ...ov([[B(4, 12, 4, 40, 32, 0.25), [-1, -4], over]])])
    part('leftArm', [5, 22], [[legacy ? B(4, 12, 4, 40, 16, 0, true) : B(4, 12, 4, 32, 48), [1, -4], base], ...ov([[B(4, 12, 4, 48, 48, 0.25), [1, -4], over]])])
    part('rightLeg', [-1.9, 12], [[B(4, 12, 4, 0, 16), [0, -6], base], ...ov([[B(4, 12, 4, 0, 32, 0.25), [0, -6], over]])])
    part('leftLeg', [1.9, 12], [[legacy ? B(4, 12, 4, 0, 16, 0, true) : B(4, 12, 4, 16, 48), [0, -6], base], ...ov([[B(4, 12, 4, 0, 48, 0.25), [0, -6], over]])])
    this.armor = [null, null, null, null, null]; this.armorKey = ['', '', '', '', '']
  }

  setSkin (tex) {
    this.tex = tex
    const h = tex.image && tex.image.height === 32 ? 32 : 64
    if (h !== 64) this.build(h)
    for (const m of this.skinMats) { m.map = tex; m.needsUpdate = true }
  }

  /** Armour piece for slot 1-4 (boots, legs, chest, helmet). */
  setArmor (slot, item) {
    const mat = item && ARMOR[item.id]
    const key = mat ? mat + ':' + (item.color != null ? item.color : '') + (item.glint ? '*' : '') : ''
    if (key === this.armorKey[slot]) return
    this.armorKey[slot] = key
    if (this.armor[slot]) { for (const m of this.armor[slot]) m.parent.remove(m); this.armor[slot] = null }
    if (!mat) return
    const layer = slot === 2 ? 2 : 1
    const inf = slot === 2 ? 0.5 : 1
    const meshes = []
    const add = (file, tint) => {
      const first = meshes.length
      const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
      if (tint != null) m.color.setHex(tint)
      loadTex('replay/armor/' + file + '.png', (t) => { m.map = t; m.needsUpdate = true })
      const B = (w, h, d, u, v, mirror) => texBox(w, h, d, u, v, 64, 32, inf, mirror)
      const put = (partName, geo, off) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(off[0] * PX, off[1] * PX, 0); this.parts[partName].add(mesh); meshes.push(mesh) }
      if (slot === 4) put('head', B(8, 8, 8, 0, 0), [0, 4])
      if (slot === 3) { put('body', B(8, 12, 4, 16, 16), [0, -6]); put('rightArm', B(4, 12, 4, 40, 16), [-1, -4]); put('leftArm', B(4, 12, 4, 40, 16, true), [1, -4]) }
      if (slot === 2) { put('body', B(8, 12, 4, 16, 16), [0, -6]); put('rightLeg', B(4, 12, 4, 0, 16), [0, -6]); put('leftLeg', B(4, 12, 4, 0, 16, true), [0, -6]) }
      if (slot === 1) { put('rightLeg', B(4, 12, 4, 0, 16), [0, -6]); put('leftLeg', B(4, 12, 4, 0, 16, true), [0, -6]) }
      if (item.glint && !/_overlay$/.test(file)) for (const mesh of meshes.slice(first)) { const g = new THREE.Mesh(mesh.geometry, glintMaterial(0.8)); g.position.copy(mesh.position); mesh.parent.add(g); meshes.push(g) }
    }
    if (mat === 'leather') {
      add(`leather_layer_${layer}`, item.color != null ? item.color : 0xa06540)
      add(`leather_layer_${layer}_overlay`, null)
    } else add(`${mat}_layer_${layer}`, null)
    this.armor[slot] = meshes
  }

  setHeld (item, texture = null) {
    const key = item ? item.id + ':' + item.damage + (item.glint ? '*' : '') + (item.color != null ? item.color : '') + (texture || '') : ''
    if (key === this.heldKey) return
    this.heldKey = key
    if (this.held) { this.parts.rightArm.remove(this.held); this.held = null }
    this.heldItem = item
    if (!item || !this.items) return
    const m = this.items.mesh(item, { texture })
    if (!m) return
    // The item's own third-person transform, applied in the hand the way
    // LayerHeldItem and ItemRenderer do (in Minecraft's model space, which
    // is upside down; HAND_FLIP turns it into ours).
    const [rot, tr, sc] = this.items.thirdPerson(item)
    const D = Math.PI / 180
    const mat = new THREE.Matrix4()
    const mul = (m2) => mat.multiply(m2)
    mat.copy(HAND_FLIP)
    mul(new THREE.Matrix4().makeTranslation(-1 / 16, 7 / 16, 1 / 16))
    this.sneakSlot = new THREE.Matrix4() // filled in each frame (crouching moves it)
    const before = mat.clone()
    const after = new THREE.Matrix4().makeScale(2, 2, 2)
      .multiply(new THREE.Matrix4().makeTranslation(tr[0] / 16, tr[1] / 16, tr[2] / 16))
      .multiply(new THREE.Matrix4().makeRotationY(rot[1] * D))
      .multiply(new THREE.Matrix4().makeRotationX(rot[0] * D))
      .multiply(new THREE.Matrix4().makeRotationZ(rot[2] * D))
      .multiply(new THREE.Matrix4().makeScale(sc * 0.5, sc * 0.5, sc * 0.5))
    const holder = new THREE.Group()
    holder.matrixAutoUpdate = false
    holder.userData = { before, after }
    holder.add(m)
    this.parts.rightArm.add(holder)
    this.held = holder
    this.placeHeld(false)
  }

  placeHeld (sneaking) {
    const h = this.held
    if (!h || h.userData.sneaking === sneaking) return
    h.userData.sneaking = sneaking
    h.matrix.copy(h.userData.before)
    if (sneaking) h.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0.203125, 0))
    h.matrix.multiply(h.userData.after)
    h.matrixWorldNeedsUpdate = true
  }

  /** Pose at replay time t. Returns the state, or null when not there. */
  update (t) {
    const tr = this.track
    const s = tr.stateAt(t)
    this.present = !!s
    this.state = s
    if (!s) { this.group.visible = false; return null }
    this.group.visible = true
    for (let slot = 1; slot <= 4; slot++) this.setArmor(slot, tr.equip[slot].at(t))

    const flags = tr.flags.at(t) || 0
    const sneaking = !!(flags & 0x02)
    const using = !!(flags & 0x10)
    const hand = tr.equip[0].at(t)
    const bow = !!hand && hand.id === 261
    // A bow being drawn shows its pulling picture (ItemModelMesher).
    let bowTex = null
    if (bow && using) {
      const held = (t - tr.flags.since(t)) / 50
      bowTex = held >= 18 ? 'bow_pulling_2' : held > 13 ? 'bow_pulling_1' : 'bow_pulling_0'
      if (!this.items || !this.items.d.items.textures[bowTex]) bowTex = null
    }
    this.setHeld(hand, bowTex)
    this.placeHeld(sneaking)

    const P = this.parts
    const D = Math.PI / 180
    this.group.position.set(s.x, s.y, s.z)
    this.group.rotation.y = -s.yaw * D
    const ageInTicks = t / 50
    const limb = s.limb; const amt = s.amount

    // ModelBiped.setRotationAngles, word for word, in Minecraft's own model
    // space (angles in radians, rotation points in pixels, y down).
    const A = {
      head: { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 },
      body: { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 },
      rightArm: { x: 0, y: 0, z: 0, px: -5, py: 2, pz: 0 },
      leftArm: { x: 0, y: 0, z: 0, px: 5, py: 2, pz: 0 },
      rightLeg: { x: 0, y: 0, z: 0, px: -1.9, py: 12, pz: 0.1 },
      leftLeg: { x: 0, y: 0, z: 0, px: 1.9, py: 12, pz: 0.1 }
    }
    const { head, body, rightArm, leftArm, rightLeg, leftLeg } = A
    head.y = (((s.head - s.yaw) % 360 + 540) % 360 - 180) * D
    head.x = s.pitch * D
    rightArm.x = Math.cos(limb * 0.6662 + Math.PI) * 2 * amt * 0.5
    leftArm.x = Math.cos(limb * 0.6662) * 2 * amt * 0.5
    rightLeg.x = Math.cos(limb * 0.6662) * 1.4 * amt
    leftLeg.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * amt
    const sword = hand && SWORDS.has(hand.id)
    const heldRight = !hand ? 0 : using && sword ? 3 : 1
    if (heldRight) rightArm.x = rightArm.x * 0.5 - Math.PI / 10 * heldRight
    if (heldRight === 3) rightArm.y = -0.5235988
    const sw = tr.lastBefore(tr.swings, t)
    const swing = t - sw < 300 ? (t - sw) / 300 : 0
    if (swing > 0) {
      body.y = Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2
      rightArm.pz = Math.sin(body.y) * 5; rightArm.px = -Math.cos(body.y) * 5
      leftArm.pz = -Math.sin(body.y) * 5; leftArm.px = Math.cos(body.y) * 5
      rightArm.y += body.y; leftArm.y += body.y; leftArm.x += body.y
      let f = 1 - swing; f = f * f; f = f * f; f = 1 - f
      const f1 = Math.sin(f * Math.PI)
      const f2 = Math.sin(swing * Math.PI) * -(head.x - 0.7) * 0.75
      rightArm.x -= f1 * 1.2 + f2
      rightArm.y += body.y * 2
      rightArm.z += Math.sin(swing * Math.PI) * -0.4
    }
    if (sneaking) {
      body.x = 0.5
      rightArm.x += 0.4; leftArm.x += 0.4
      rightLeg.pz = 4; leftLeg.pz = 4
      rightLeg.py = 9; leftLeg.py = 9
      head.py = 1
    }
    rightArm.z += Math.cos(ageInTicks * 0.09) * 0.05 + 0.05
    leftArm.z -= Math.cos(ageInTicks * 0.09) * 0.05 + 0.05
    rightArm.x += Math.sin(ageInTicks * 0.067) * 0.05
    leftArm.x -= Math.sin(ageInTicks * 0.067) * 0.05
    if (using && bow) {
      rightArm.z = 0; leftArm.z = 0
      rightArm.y = -0.1 + head.y
      leftArm.y = 0.1 + head.y + 0.4
      rightArm.x = -Math.PI / 2 + head.x
      leftArm.x = -Math.PI / 2 + head.x
      rightArm.z += Math.cos(ageInTicks * 0.09) * 0.05 + 0.05
      leftArm.z -= Math.cos(ageInTicks * 0.09) * 0.05 + 0.05
      rightArm.x += Math.sin(ageInTicks * 0.067) * 0.05
      leftArm.x -= Math.sin(ageInTicks * 0.067) * 0.05
    }
    // Into this model's space: x stays, y and z flip (so y and z turns flip).
    for (const [name, a] of Object.entries(A)) {
      const p = P[name]
      p.position.set(a.px * PX, (24 - a.py) * PX, -a.pz * PX)
      p.rotation.set(a.x, -a.y, -a.z, 'ZYX')
    }
    // Crouching: ModelBiped.render moves the model down 0.2 and RenderPlayer
    // another 0.125.
    this.pose.position.y = sneaking ? -0.325 : 0
    this.tag.position.y = sneaking ? 2.2 - 0.375 : 2.2
    this.tag.material.opacity = sneaking ? 0.35 : 1
    // Death: tip over onto the left side over a second (rotateCorpse).
    if (s.dying > 0) {
      const d = Math.min(1, Math.sqrt((s.dying * 20 - 1 > 0 ? s.dying * 20 - 1 : 0) / 20 * 1.6))
      this.pose.rotation.z = -d * Math.PI / 2
    } else this.pose.rotation.z = 0
    // Red while hurt (10 ticks) or dying.
    const hurt = tr.recent(tr.hurts, t, 500) || s.dying > 0
    for (const m of this.skinMats) m.color.setHex(hurt ? 0xff7070 : 0xffffff)
    if (this.armor) for (const set of this.armor) if (set) for (const m of set) if (m.material.isMeshLambertMaterial && m.material.emissive) m.material.emissive.setHex(hurt ? 0x550000 : 0x000000)
    return s
  }
}

// Minecraft draws entities in a flipped space (x stays, y and z negated).
const HAND_FLIP = new THREE.Matrix4().makeScale(1, -1, -1)

module.exports = { PlayerModel, skinUrl, textSprite, texBox, loadTex }
