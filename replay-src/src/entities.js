// Everything in the replay that isn't a player: dropped items (spinning
// and bobbing like in game), arrows, fireballs, TNT, pearls, snowballs,
// falling blocks, shop villagers, iron golems, silverfish, and Hypixel's
// floating text (generator timers, shop names).
const THREE = require('three')
const { textSprite, texBox, loadTex } = require('./players')

const PX = 1 / 16
const THROWN = { snowball: 'snowball', egg: 'egg', pearl: 'ender_pearl', fireball: 'fire_charge', small_fireball: 'fire_charge', potion: 'potion', xp_bottle: 'experience_bottle', eye: 'ender_eye' }

class EntityView {
  constructor (track, items) {
    this.track = track
    this.items = items
    this.group = new THREE.Group()
    this.textKey = null
    this.hover = ((track.id * 2654435761) >>> 0) / 4294967296 * Math.PI * 2
    this.build()
  }

  build () {
    const e = this.track
    const g = this.group
    if (e.kind === 'object' && e.type === 'item') {
      this.spin = true
      this.itemKey = ''
    } else if (e.kind === 'object' && e.type === 'arrow') {
      this.inner = new THREE.Mesh(arrowGeo(), arrowMat())
      this.inner.matrixAutoUpdate = false
      g.add(this.inner)
      this.orient = true
    } else if (e.kind === 'object' && THROWN[e.type]) {
      const m = this.items && this.items.mesh({ id: { snowball: 332, egg: 344, ender_pearl: 368, fire_charge: 385, potion: 373, experience_bottle: 384, ender_eye: 381 }[THROWN[e.type]], damage: 0 })
      if (m) { m.scale.setScalar(e.type === 'fireball' ? 1 : 0.4); this.billboard = m; g.add(m) }
      if (e.type === 'fireball') {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.35 }))
        g.add(glow)
      }
    } else if (e.kind === 'object' && (e.type === 'tnt' || e.type === 'falling_block')) {
      const m = this.items && this.items.mesh({ id: e.type === 'tnt' ? 46 : e.block >> 4, damage: e.type === 'tnt' ? 0 : e.block & 15 }, { glint: false })
      if (m) {
        m.position.y = 0.5
        g.add(m)
        if (e.type === 'tnt') {
          // When it goes off: the moment it disappears.
          let end = Infinity
          for (let k = 0; k < e.t.length; k++) if (!e.alive[k]) { end = e.t[k]; break }
          this.fuseEnd = end
          // Own material, so only this TNT flashes white.
          m.traverse(o => { if (o.material) o.material = o.material.clone() })
          this.flash = m
        }
      }
    } else if (e.kind === 'mob' && e.type === 'villager') {
      this.model = villager()
      g.add(this.model)
    } else if (e.kind === 'mob' && e.type === 'iron_golem') {
      this.model = golem()
      g.add(this.model)
    } else if (e.kind === 'mob' && e.type === 'silverfish') {
      const m = new THREE.MeshLambertMaterial({ color: 0x8c8c8c })
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.6), m); b.position.y = 0.1
      g.add(b)
    }
    // Other mobs (lobby animals, pets) aren't part of the game: not drawn,
    // rather than shown as blank boxes.
  }

  /** A dropped stack: more copies for bigger stacks, like the game. */
  dropped (item) {
    const n = item.count > 48 ? 5 : item.count > 32 ? 4 : item.count > 16 ? 3 : item.count > 1 ? 2 : 1
    const g = new THREE.Group()
    let seed = this.track.id >>> 0
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 }
    for (let k = 0; k < n; k++) {
      const m = this.items.mesh(item)
      if (!m) return k ? g : null
      if (m.userData.block) {
        m.scale.setScalar(0.25)
        if (k) m.position.set((rnd() * 2 - 1) * 0.15 * 0.5, (rnd() * 2 - 1) * 0.15 * 0.5, (rnd() * 2 - 1) * 0.15 * 0.5)
      } else {
        m.scale.setScalar(0.5)
        m.position.z = -k * 0.046875 * 0.5
      }
      g.add(m)
    }
    return g
  }

  /** A short fading streak behind a flying arrow, so shots are easy to follow. */
  trailAt (t, s) {
    if (!this.trail) {
      if (!trailMat) trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3))
      const col = new Float32Array(TRAIL * 3)
      for (let k = 0; k < TRAIL; k++) { const a = 0.95 * (1 - k / (TRAIL - 1)); col[k * 3] = a; col[k * 3 + 1] = a; col[k * 3 + 2] = a * 0.9 }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      this.trail = new THREE.Line(geo, trailMat)
      this.trail.frustumCulled = false
      this.group.add(this.trail)
    }
    const pos = this.trail.geometry.attributes.position
    let last = s; let n = 1
    pos.setXYZ(0, 0, 0, 0)
    for (let k = 1; k < TRAIL; k++) {
      const p = this.track.stateAt(t - k * 50)
      // Stop at the bow, or where it was lying still (stuck in a block).
      if (!p || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 0.05) break
      pos.setXYZ(k, p.x - s.x, p.y - s.y, p.z - s.z); last = p; n++
    }
    this.trail.geometry.setDrawRange(0, n)
    this.trail.visible = n > 1
    pos.needsUpdate = true
  }

  update (t, camera) {
    const e = this.track
    const s = e.stateAt(t)
    const g = this.group
    if (!s) { g.visible = false; return }
    // Armour stands with no name are invisible markers.
    const name = e.nameTl ? e.nameTl.at(t) : ''
    const isStand = e.type === 'armor_stand'
    const invisible = isStand && ((e.meta[0] || 0) & 0x20)
    g.visible = true
    g.position.set(s.x, s.y, s.z)
    if (e.type === 'item') {
      const item = e.item
      const key = item ? item.id + ':' + item.damage : ''
      if (key !== this.itemKey) {
        this.itemKey = key
        if (this.inner) g.remove(this.inner)
        this.inner = item && this.items ? this.dropped(item) : null
        if (this.inner) g.add(this.inner)
      }
      if (this.inner) {
        // RenderEntityItem: bob up and down and turn, from a random start.
        const age = (t - e.t[0]) / 50
        this.inner.rotation.y = age / 20 + this.hover
        this.inner.position.y = Math.sin(age / 10 + this.hover) * 0.1 + 0.1 + 0.25
      }
    } else if (this.orient) {
      // RenderArrow: turn by yaw - 90 and pitch, then its own 45 degrees.
      const D = Math.PI / 180
      this.inner.matrix.makeRotationY((s.yaw - 90) * D)
        .multiply(new THREE.Matrix4().makeRotationZ(s.pitch * D))
        .multiply(ARROW_LOCAL)
      this.inner.matrixWorldNeedsUpdate = true
      this.trailAt(t, s)
    } else if (this.billboard) {
      this.billboard.quaternion.copy(camera.quaternion)
    } else if (this.model) {
      g.rotation.y = -s.yaw * Math.PI / 180
      if (this.model.userData.head) this.model.userData.head.rotation.x = s.pitch * Math.PI / 180
    }
    if (this.flash) {
      // RenderTNTPrimed: swells in its last 10 ticks and flashes white
      // every 5 ticks, brighter as it gets close.
      const fuse = Math.max(0, (this.fuseEnd - t) / 50)
      let f = Math.min(1, Math.max(0, 1 - fuse / 10)); f = f * f; f = f * f
      this.flash.scale.setScalar(1 + f * 0.3)
      const white = Math.floor(fuse / 5) % 2 === 0 ? Math.min(1, (1 - fuse / 100) * 0.8) : 0
      this.flash.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setScalar(white) })
    }
    // Floating text.
    const showName = name && (isStand || e.nameVisible)
    if (showName !== !!this.text || (showName && name !== this.textKey)) {
      if (this.text) { g.remove(this.text); this.text.material.map.dispose(); this.text.material.dispose(); this.text = null }
      if (showName) {
        this.text = textSprite(name, { scale: 0.28, plate: !isStand })
        this.text.position.y = isStand ? (invisible ? 2 : 2.1) : 2.3
        g.add(this.text)
      }
      this.textKey = name
    }
  }
}

const ARROW_LOCAL = new THREE.Matrix4().makeRotationX(Math.PI / 4)
  .multiply(new THREE.Matrix4().makeScale(0.05625, 0.05625, 0.05625))
  .multiply(new THREE.Matrix4().makeTranslation(-4, 0, 0))
const TRAIL = 8 // points, one per tick
let trailMat = null
let arrowGeometry = null
let arrowMaterial = null
/** Minecraft's arrow: two crossed planes and a square for the feathers. */
function arrowGeo () {
  if (arrowGeometry) return arrowGeometry
  const pos = []; const uv = []; const idx = []
  const quad = (pts, uvs) => { const b = pos.length / 3; for (const p of pts) pos.push(...p); for (const q of uvs) uv.push(q[0], 1 - q[1]); idx.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  const sh = [[0, 0], [0.5, 0], [0.5, 5 / 32], [0, 5 / 32]]
  quad([[-8, -2, 0], [8, -2, 0], [8, 2, 0], [-8, 2, 0]], sh)
  quad([[-8, 0, -2], [8, 0, -2], [8, 0, 2], [-8, 0, 2]], sh)
  quad([[-7, -2, -2], [-7, -2, 2], [-7, 2, 2], [-7, 2, -2]], [[0, 5 / 32], [0.15625, 5 / 32], [0.15625, 10 / 32], [0, 10 / 32]])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  arrowGeometry = g
  return g
}
function arrowMat () {
  if (arrowMaterial) return arrowMaterial
  arrowMaterial = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, transparent: false })
  loadTex('replay/entity/arrow.png', (t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; arrowMaterial.map = t; arrowMaterial.needsUpdate = true })
  return arrowMaterial
}

function villager () {
  const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1 })
  loadTex('replay/entity/villager.png', (t) => { m.map = t; m.needsUpdate = true })
  const B = (w, h, d, u, v, inf = 0) => texBox(w, h, d, u, v, 64, 64, inf)
  const g = new THREE.Group()
  const add = (geo, x, y, z, parent = g) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x * PX, y * PX, z * PX); parent.add(mesh); return mesh }
  const head = new THREE.Group(); head.position.y = 24 * PX; g.add(head)
  add(B(8, 10, 8, 0, 0), 0, 5, 0, head)
  add(B(2, 4, 2, 24, 0), 0, 2, 5, head)
  add(B(8, 12, 6, 16, 20), 0, 18, 0)
  add(B(8, 18, 6, 0, 38, 0.5), 0, 15, 0)
  // Arms folded in front.
  const arms = new THREE.Group(); arms.position.set(0, 21 * PX, 1 * PX); arms.rotation.x = -0.75; g.add(arms)
  add(B(4, 8, 4, 44, 22), -6, -2, 1, arms)
  add(B(4, 8, 4, 44, 22), 6, -2, 1, arms)
  add(B(8, 4, 4, 40, 38), 0, -4, 3, arms)
  add(B(4, 12, 4, 0, 22), -2, 6, 0)
  add(B(4, 12, 4, 0, 22), 2, 6, 0)
  g.userData.head = head
  return g
}

function golem () {
  const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1 })
  loadTex('replay/entity/iron_golem.png', (t) => { m.map = t; m.needsUpdate = true })
  const B = (w, h, d, u, v) => texBox(w, h, d, u, v, 128, 128)
  const g = new THREE.Group()
  const add = (geo, x, y, z, parent = g) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x * PX, y * PX, z * PX); parent.add(mesh); return mesh }
  const head = new THREE.Group(); head.position.y = 38 * PX; g.add(head)
  add(B(8, 10, 8, 0, 0), 0, 5, -2, head)
  add(B(18, 12, 11, 0, 40), 0, 32, 0)
  add(B(9, 5, 6, 0, 70), 0, 23, 0)
  add(B(4, 30, 6, 60, 21), -11, 23, 0)
  add(B(4, 30, 6, 60, 58), 11, 23, 0)
  add(B(6, 16, 5, 37, 0), -4, 8, 0)
  add(B(6, 16, 5, 60, 0), 4, 8, 0)
  g.userData.head = head
  return g
}

module.exports = { EntityView, arrowGeo, arrowMat, ARROW_LOCAL }
