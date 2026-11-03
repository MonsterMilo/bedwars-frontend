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

  setHeld (item) {
    const key = item ? item.id + ':' + item.damage + (item.glint ? '*' : '') + (item.color != null ? item.color : '') : ''
    if (key === this.heldKey) return
    this.heldKey = key
    if (this.held) { this.parts.rightArm.remove(this.held); this.held = null }
    this.heldItem = item
    if (!item || !this.items) return
    const m = this.items.mesh(item)
    if (!m) return
    // In the hand: at the bottom of the arm, pointing forward.
    const holder = new THREE.Group()
    holder.position.set(-1 * PX, -10 * PX, 1 * PX)
    if (m.userData.block) {
      m.scale.setScalar(0.375)
      m.position.set(0, -0.05, 0.12)
      m.rotation.set(0.35, Math.PI / 4, 0)
    } else {
      m.scale.setScalar(SWORDS.has(item.id) || TOOLS.has(item.id) ? 0.85 : 0.6)
      // The flat picture stands in the hand's plane, tip forward and up.
      m.rotation.set(-Math.PI / 2 + 0.35, Math.PI / 2, 0)
      m.rotation.order = 'YXZ'
      m.rotation.set(0, -Math.PI / 2, Math.PI / 4)
      m.position.set(0, 0.1, 0.25)
      const outer = new THREE.Group(); outer.add(m); outer.rotation.x = -Math.PI / 2 + 0.6
      holder.add(outer)
      this.parts.rightArm.add(holder)
      this.held = holder
      return
    }
    holder.add(m)
    this.parts.rightArm.add(holder)
    this.held = holder
  }

  /** Pose at replay time t. Returns the state, or null when not there. */
  update (t) {
    const tr = this.track
    const s = tr.stateAt(t)
    this.present = !!s
    if (!s) { this.group.visible = false; return null }
    this.group.visible = true
    for (let slot = 1; slot <= 4; slot++) this.setArmor(slot, tr.equip[slot].at(t))
    this.setHeld(tr.equip[0].at(t))

    const flags = tr.flags.at(t) || 0
    const sneaking = !!(flags & 0x02)
    const using = !!(flags & 0x10)
    const P = this.parts
    const toRad = Math.PI / 180
    this.group.position.set(s.x, s.y, s.z)
    this.group.rotation.y = -s.yaw * toRad
    const netHead = -(((s.head - s.yaw) % 360 + 540) % 360 - 180) * toRad
    const pitch = s.pitch * toRad
    const limb = s.limb; const amt = s.amount
    const reset = (p) => { const pv = p.userData.pivot; p.position.set(pv[0] * PX, pv[1] * PX, 0); p.rotation.set(0, 0, 0) }
    for (const p of Object.values(P)) reset(p)

    // ModelBiped.setRotationAngles, in this model's axes.
    P.head.rotation.y = netHead
    P.head.rotation.x = pitch
    P.rightArm.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 2 * amt * 0.5
    P.leftArm.rotation.x = Math.cos(limb * 0.6662) * 2 * amt * 0.5
    P.rightLeg.rotation.x = Math.cos(limb * 0.6662) * 1.4 * amt
    P.leftLeg.rotation.x = Math.cos(limb * 0.6662 + Math.PI) * 1.4 * amt
    const item = this.heldItem
    const sword = item && SWORDS.has(item.id)
    const bow = item && item.id === 261
    if (item) P.rightArm.rotation.x = P.rightArm.rotation.x * 0.5 - Math.PI / 10
    if (using && sword) { // blocking
      P.rightArm.rotation.x = P.rightArm.rotation.x * 0.5 - Math.PI / 10 * 3
      P.rightArm.rotation.y = -Math.PI / 6
    }
    // Swinging (6 ticks).
    const sw = tr.lastBefore(tr.swings, t)
    const f = t - sw < 300 ? (t - sw) / 300 : 0
    if (f > 0) {
      const bodyY = Math.sin(Math.sqrt(f) * Math.PI * 2) * 0.2
      P.body.rotation.y = bodyY
      P.rightArm.position.z = Math.sin(bodyY) * 5 * PX; P.rightArm.position.x = -Math.cos(bodyY) * 5 * PX
      P.leftArm.position.z = -Math.sin(bodyY) * 5 * PX; P.leftArm.position.x = Math.cos(bodyY) * 5 * PX
      P.rightArm.rotation.y += bodyY; P.leftArm.rotation.y += bodyY
      let f2 = 1 - f; f2 = 1 - f2 * f2 * f2 * f2
      const a = Math.sin(f2 * Math.PI); const b = Math.sin(f * Math.PI) * -(pitch - 0.7) * 0.75
      P.rightArm.rotation.x -= a * 1.2 + b
      P.rightArm.rotation.y += P.body.rotation.y * 2
      P.rightArm.rotation.z += Math.sin(f * Math.PI) * -0.4
    }
    // Breathing.
    const age = t / 50
    P.rightArm.rotation.z += Math.cos(age * 0.09) * 0.05 + 0.05
    P.leftArm.rotation.z -= Math.cos(age * 0.09) * 0.05 + 0.05
    P.rightArm.rotation.x += Math.sin(age * 0.067) * 0.05
    P.leftArm.rotation.x -= Math.sin(age * 0.067) * 0.05
    if (using && bow) {
      P.rightArm.rotation.y = -0.1 + netHead
      P.leftArm.rotation.y = 0.1 + netHead + 0.4
      P.rightArm.rotation.x = -Math.PI / 2 + pitch
      P.leftArm.rotation.x = -Math.PI / 2 + pitch
    }
    if (sneaking) {
      // ModelBiped's sneak: body leans, legs move back and up, and the whole
      // player sits 0.2 blocks lower.
      P.body.rotation.x = 0.5
      P.rightArm.rotation.x += 0.4; P.leftArm.rotation.x += 0.4
      P.rightLeg.position.z = -4 * PX; P.leftLeg.position.z = -4 * PX
      P.rightLeg.position.y = 15 * PX; P.leftLeg.position.y = 15 * PX
      P.head.position.y = 23 * PX
      this.group.position.y -= 0.2
    }
    // Death: tip over sideways over a second, like Minecraft.
    if (s.dying > 0) {
      const d = Math.min(1, Math.sqrt(s.dying * 20 / 20 * 1.6))
      this.pose.rotation.z = d * Math.PI / 2
    } else this.pose.rotation.z = 0
    this.tag.material.opacity = sneaking ? 0.35 : 1
    // Red when hurt.
    const hurt = tr.recent(tr.hurts, t, 400) || s.dying > 0
    for (const m of this.skinMats) m.color.setHex(hurt ? 0xff7070 : 0xffffff)
    if (this.armor) for (const set of this.armor) if (set) for (const m of set) if (m.material.isMeshLambertMaterial && !m.material.userData.base) { m.material.emissive && m.material.emissive.setHex(hurt ? 0x550000 : 0x000000) }
    return s
  }
}

module.exports = { PlayerModel, skinUrl, textSprite, texBox, loadTex }
