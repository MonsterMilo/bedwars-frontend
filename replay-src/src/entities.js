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
    this.build()
  }

  build () {
    const e = this.track
    const g = this.group
    if (e.kind === 'object' && e.type === 'item') {
      this.spin = true
      this.itemKey = ''
    } else if (e.kind === 'object' && e.type === 'arrow') {
      const m = new THREE.MeshLambertMaterial({ color: 0x8a6a40 })
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), m)
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.08), new THREE.MeshLambertMaterial({ color: 0x9a9a9a }))
      tip.position.z = 0.27
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.12), new THREE.MeshLambertMaterial({ color: 0xeeeeee }))
      fl.position.z = -0.2
      this.inner = new THREE.Group(); this.inner.add(shaft, tip, fl)
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
    } else if (e.kind === 'mob' && e.type !== 'armor_stand' && e.type !== 'bat') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0xdddddd }))
      b.position.y = 0.3
      g.add(b)
    }
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
        this.inner = item && this.items ? this.items.mesh(item) : null
        if (this.inner) { this.inner.scale.setScalar(this.inner.userData.block ? 0.25 : 0.4); g.add(this.inner) }
      }
      if (this.inner) {
        // Dropped items bob and turn (ticks since spawn).
        const age = (t - e.t[0]) / 50
        this.inner.rotation.y = age / 20
        this.inner.position.y = Math.sin(age / 10) * 0.1 + 0.1 + (this.inner.userData.block ? 0.125 : 0.2)
      }
    } else if (this.orient) {
      g.rotation.order = 'YXZ'
      g.rotation.y = -s.yaw * Math.PI / 180 + Math.PI
      g.rotation.x = s.pitch * Math.PI / 180
    } else if (this.billboard) {
      this.billboard.quaternion.copy(camera.quaternion)
    } else if (this.model) {
      g.rotation.y = -s.yaw * Math.PI / 180
      if (this.model.userData.head) this.model.userData.head.rotation.x = s.pitch * Math.PI / 180
    }
    if (this.flash) {
      const fuse = (t - e.t[0]) / 50
      const on = Math.floor(fuse / 5) % 2 === 0
      this.flash.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(on ? 0x888888 : 0x000000) })
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

module.exports = { EntityView }
