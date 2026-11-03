// Player models for the replay: Minecraft's player shape built from boxes,
// wearing the skin each player had in the game (from the tab list), with a
// name tag in their team colour. Walk, arm swing, sneak and a red flash
// when hit.
const THREE = require('three')

const STEVE = 'replay/steve.png'
const PX = 1 / 16
const texCache = new Map()
const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')

function loadSkin (url, onLoad) {
  if (texCache.has(url)) { const c = texCache.get(url); if (c.ready) onLoad(c.tex); else c.waiting.push(onLoad); return }
  const entry = { ready: false, waiting: [onLoad], tex: null }
  texCache.set(url, entry)
  loader.load(url, (tex) => {
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter
    entry.tex = tex; entry.ready = true
    for (const f of entry.waiting) f(tex)
    entry.waiting = []
  }, undefined, () => {
    texCache.delete(url)
    if (url !== STEVE) loadSkin(STEVE, (t) => { for (const f of entry.waiting) f(t); entry.waiting = [] })
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

/** A box of w*h*d skin pixels, UV-mapped from the skin at (u, v). */
function skinBox (w, h, d, u, v, texH, inflate = 0) {
  const g = new THREE.BoxGeometry((w + inflate * 2) * PX, (h + inflate * 2) * PX, (d + inflate * 2) * PX)
  const uv = g.attributes.uv
  const rect = (face, x, y, fw, fh) => {
    const u0 = x / 64; const u1 = (x + fw) / 64; const v0 = 1 - y / texH; const v1 = 1 - (y + fh) / texH
    const k = face * 4
    uv.setXY(k, u0, v0); uv.setXY(k + 1, u1, v0); uv.setXY(k + 2, u0, v1); uv.setXY(k + 3, u1, v1)
  }
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The model faces +z.
  rect(0, u + d + w, v + d, d, h) // +x: the player's left side
  rect(1, u, v + d, d, h) // -x: right side
  rect(2, u + d, v, w, d) // top
  rect(3, u + d + w, v, w, d) // bottom
  rect(4, u + d, v + d, w, h) // front
  rect(5, u + 2 * d + w, v + d, w, h) // back
  uv.needsUpdate = true
  return g
}

function nameSprite (text, color, nicked) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const font = '600 40px "Segoe UI", Arial, sans-serif'
  ctx.font = font
  const label = nicked ? text + ' ·N' : text
  const w = Math.ceil(ctx.measureText(label).width) + 28
  c.width = w; c.height = 60
  ctx.font = font
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, w, 60)
  ctx.fillStyle = color || '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 14, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.renderOrder = 10
  s.scale.set(w / 60 * 0.3, 0.3, 1)
  return s
}

class PlayerModel {
  constructor (track) {
    this.track = track
    this.group = new THREE.Group()
    this.mats = []
    this.parts = {}
    this.build(64)
    this.tag = nameSprite(track.name || '?', track.team ? track.team.color : '#ffffff', track.nicked)
    this.tag.position.y = 2.25
    this.group.add(this.tag)
    loadSkin(track.skinUrl || STEVE, (tex) => this.setSkin(tex))
  }

  build (texH) {
    for (const k of Object.keys(this.parts)) this.group.remove(this.parts[k])
    this.parts = {}
    this.mats = []
    const mat = () => { const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }); this.mats.push(m); return m }
    const base = mat(); const over = mat()
    this.base = base; this.over = over
    const legacy = texH === 32
    // A part hangs from a pivot so it can rotate at the joint.
    const part = (name, pivot, boxes) => {
      const p = new THREE.Group(); p.position.set(pivot[0] * PX, pivot[1] * PX, 0)
      for (const [geo, off, m] of boxes) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(off[0] * PX, off[1] * PX, 0); p.add(mesh) }
      this.group.add(p); this.parts[name] = p
      return p
    }
    part('head', [0, 24], [[skinBox(8, 8, 8, 0, 0, texH), [0, 4], base], [skinBox(8, 8, 8, 32, 0, texH, 0.5), [0, 4], over]])
    part('body', [0, 24], [[skinBox(8, 12, 4, 16, 16, texH), [0, -6], base]].concat(legacy ? [] : [[skinBox(8, 12, 4, 16, 32, texH, 0.25), [0, -6], over]]))
    part('rightArm', [-6, 22], [[skinBox(4, 12, 4, 40, 16, texH), [0, -4], base]].concat(legacy ? [] : [[skinBox(4, 12, 4, 40, 32, texH, 0.25), [0, -4], over]]))
    part('leftArm', [6, 22], [[skinBox(4, 12, 4, legacy ? 40 : 32, legacy ? 16 : 48, texH), [0, -4], base]].concat(legacy ? [] : [[skinBox(4, 12, 4, 48, 48, texH, 0.25), [0, -4], over]]))
    part('rightLeg', [-2, 12], [[skinBox(4, 12, 4, 0, 16, texH), [0, -6], base]].concat(legacy ? [] : [[skinBox(4, 12, 4, 0, 32, texH, 0.25), [0, -6], over]]))
    part('leftLeg', [2, 12], [[skinBox(4, 12, 4, legacy ? 0 : 16, legacy ? 16 : 48, texH), [0, -6], base]].concat(legacy ? [] : [[skinBox(4, 12, 4, 0, 48, texH, 0.25), [0, -6], over]]))
    if (this.tex) this.applyTex()
  }

  setSkin (tex) {
    this.tex = tex
    const h = tex.image && tex.image.height === 32 ? 32 : 64
    if (h !== 64) this.build(h)
    this.applyTex()
  }

  applyTex () { for (const m of this.mats) { m.map = this.tex; m.needsUpdate = true } }

  /** Pose at replay time t. Returns false when the player isn't there. */
  update (t) {
    const tr = this.track
    const s = tr.stateAt(t)
    if (!s) { this.group.visible = false; return null }
    this.group.visible = true
    const sneaking = tr.sneakingAt(t)
    this.group.position.set(s.x, s.y - (sneaking ? 0.08 : 0), s.z)
    this.group.rotation.y = -s.yaw * Math.PI / 180
    this.parts.head.rotation.x = s.pitch * Math.PI / 180
    this.parts.body.rotation.x = sneaking ? 0.5 : 0
    // Walking: legs and arms swing with ground speed.
    const p = tr.stateAt(t - 100)
    const speed = p ? Math.hypot(s.x - p.x, s.z - p.z) * 10 : 0
    const amp = Math.min(1, speed / 4.3) * 0.9
    const phase = t / 1000 * 2 * Math.PI * 1.6
    this.parts.rightLeg.rotation.x = Math.sin(phase) * amp
    this.parts.leftLeg.rotation.x = -Math.sin(phase) * amp
    this.parts.leftArm.rotation.x = Math.sin(phase) * amp * 0.8
    let arm = -Math.sin(phase) * amp * 0.8
    if (tr.recent(tr.swings, t, 300)) {
      const i = tr.swings.length && t - lastBefore(tr.swings, t)
      arm = -Math.sin(Math.min(1, i / 300) * Math.PI) * 1.6
    }
    this.parts.rightArm.rotation.x = arm
    const hurt = tr.recent(tr.hurts, t, 350)
    for (const m of this.mats) m.color.setHex(hurt ? 0xff6666 : 0xffffff)
    return s
  }
}

function lastBefore (list, t) {
  let lo = 0; let hi = list.length - 1; let ans = 0
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m] <= t) { ans = list[m]; lo = m + 1 } else hi = m - 1 }
  return ans
}

module.exports = { PlayerModel, skinUrl }
