// Fire on burning players (Render.renderEntityOnFire), and what seeing
// through their eyes shows on top of the hand: the fire in front of the
// view while burning (ItemRenderer.renderFireInFirstPerson) and the
// underwater texture when their head is in water
// (ItemRenderer.renderWaterOverlayTexture), as in Minecraft 1.8.
const THREE = require('three')

// fire_layer_0/1.png are 32 frames of 16x16, one a tick, in this order (.mcmeta).
const FRAMES = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function fireTexture (n) {
  const tex = new THREE.TextureLoader().load('replay/fire_layer_' + n + '.png')
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter
  tex.repeat.set(1, 1 / 32)
  return tex
}

/** Shows frame `ticks` of the animated fire on these textures. */
function setFrame (textures, ticks) {
  const f = FRAMES[Math.floor(ticks) % 32]
  for (const tex of textures) tex.offset.y = 1 - (f + 1) / 32
}

/** A quad from (x0, y0) to (x1, y1) at depth z, mirrored if asked. */
function quad (x0, y0, x1, y1, z, mirror) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3))
  const u0 = mirror ? 1 : 0; const u1 = mirror ? 0 : 1
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

class EntityFire {
  constructor (scene) {
    this.scene = scene
    this.tex = [fireTexture(0), fireTexture(1)]
    this.mats = this.tex.map(map => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: false }))
    this.groups = new Map()
    this.euler = new THREE.Euler()
    this.dir = new THREE.Vector3()
  }

  /** The flames for a player-sized entity (0.6 wide, 1.8 tall), built once. */
  build () {
    const g = new THREE.Group()
    const scale = 0.6 * 1.4
    let f1 = 0.5; let f3 = 1.8 / scale; let f4 = 0; let f5 = 0; let i = 0
    while (f3 > 0) {
      const m = new THREE.Mesh(quad(-f1, -f4, f1, 1.4 - f4, -f5, Math.floor(i / 2) % 2 === 0), this.mats[i % 2])
      m.renderOrder = 4
      g.add(m)
      f3 -= 0.45; f4 -= 0.45; f1 *= 0.9; f5 += 0.03; i++
    }
    // Turned around the middle of the body, not the feet.
    g.scale.setScalar(scale)
    g.position.y = -0.9
    const pivot = new THREE.Group()
    pivot.add(g)
    this.scene.add(pivot)
    return pivot
  }

  update (models, camera, now, skip) {
    setFrame(this.tex, now / 50)
    this.euler.setFromQuaternion(camera.quaternion, 'YXZ')
    for (const m of models) {
      const burning = m.present && !m.ghost && m !== skip && ((m.track.flags.at(now) || 0) & 0x01)
      let g = this.groups.get(m)
      if (!burning) { if (g) g.visible = false; continue }
      if (!g) { g = this.build(); this.groups.set(m, g) }
      g.visible = true
      // The game puts the flames 0.3 in front of the body, turned with the
      // camera's yaw. Here they face the camera fully and sit about a block nearer it
      // (shrunk to look the same size), so the head and arms never poke
      // through, from any angle.
      g.position.copy(m.group.position)
      g.position.y += m.pose.position.y < 0 ? 0.6 : 0.9
      const d = g.position.distanceTo(camera.position)
      const near = Math.min(1.1, d * 0.5)
      g.position.addScaledVector(this.dir.subVectors(camera.position, g.position).normalize(), near)
      g.scale.setScalar((d - near) / d)
      g.rotation.set(this.euler.x, this.euler.y, 0, 'YXZ')
    }
  }
}

class EyesOverlays {
  /** Added to the hand's scene, in eye space (in front of the hand camera). */
  constructor (handScene) {
    this.tex = fireTexture(1)
    this.group = new THREE.Group()
    handScene.add(this.group)
    // Fire: two tilted quads low in the view, 90% opaque.
    this.fire = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0.9, alphaTest: 0.05, depthTest: false, depthWrite: false })
      const m = new THREE.Mesh(quad(-0.5, -0.5, 0.5, 0.5, -0.5, i === 0), mat)
      m.position.set(-(i * 2 - 1) * 0.24, -0.3, 0)
      m.rotation.y = (i * 2 - 1) * 10 * Math.PI / 180
      m.renderOrder = 20
      this.fire.add(m)
    }
    this.group.add(this.fire)
    // Water: the underwater texture over everything, half see-through,
    // sliding as they turn.
    const wtex = new THREE.TextureLoader().load('replay/underwater.png')
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping
    wtex.repeat.set(4, 4)
    wtex.magFilter = THREE.NearestFilter
    this.wtex = wtex
    this.water = new THREE.Mesh(quad(-1, -1, 1, 1, -0.5, false), new THREE.MeshBasicMaterial({ map: wtex, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }))
    this.water.renderOrder = 19
    this.group.add(this.water)
  }

  update ({ burning, water, yaw, pitch, now, light = 1 }) {
    this.fire.visible = !!burning
    if (burning) setFrame([this.tex], now / 50)
    this.water.visible = !!water
    if (water) {
      this.wtex.offset.set(-yaw / 64, pitch / 64)
      this.water.material.color.setScalar(light)
    }
    return !!(burning || water)
  }
}

module.exports = { EntityFire, EyesOverlays }
