// Block-breaking cracks: when someone mines a block, the server tells
// everyone else how far along they are (stage 0-9). Drawn like Minecraft:
// the destroy_stage texture over the block, darkening what's under it.
// The server never sends your own progress back to you, so the recorder's
// own mining has no cracks.
const THREE = require('three')

const STALE = 20000 // Minecraft drops a crack after 400 ticks without news

class Cracks {
  constructor (scene, tl, world) {
    this.world = world
    this.scene = scene
    // Per breaker, their updates in time order.
    this.byWho = new Map()
    for (const c of tl.cracks || []) {
      if (!this.byWho.has(c.who)) this.byWho.set(c.who, [])
      this.byWho.get(c.who).push(c)
    }
    const loader = new THREE.TextureLoader()
    this.mats = []
    for (let i = 0; i < 10; i++) {
      const tex = loader.load('replay/blocks/destroy_stage_' + i + '.png')
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter
      this.mats.push(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.05, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      }))
    }
    this.geo = new THREE.BoxGeometry(1.004, 1.004, 1.004)
    this.pool = []
  }

  update (now) {
    let n = 0
    for (const list of this.byWho.values()) {
      // Last update at or before now.
      let lo = 0; let hi = list.length - 1; let i = -1
      while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].t <= now) { i = m; lo = m + 1 } else hi = m - 1 }
      if (i < 0) continue
      const c = list[i]
      if (c.stage < 0 || now - c.t > STALE) continue
      const b = this.world.get(c.x, c.y, c.z)
      if (!(b >> 4)) continue // already broken
      // Fit low blocks (beds, bottom slabs, carpets) instead of a full cube.
      const id = b >> 4; const meta = b & 15
      const h = id === 26 ? 9 / 16 : (id === 44 || id === 126 || id === 182) && meta < 8 ? 0.5 : id === 171 ? 1 / 16 : 1
      let mesh = this.pool[n]
      if (!mesh) { mesh = this.pool[n] = new THREE.Mesh(this.geo, this.mats[0]); mesh.renderOrder = 2; this.scene.add(mesh) }
      mesh.material = this.mats[c.stage]
      mesh.scale.set(1, h, 1)
      mesh.position.set(c.x + 0.5, c.y + h / 2, c.z + 0.5)
      mesh.visible = true
      n++
    }
    for (let k = n; k < this.pool.length; k++) this.pool[k].visible = false
  }
}

module.exports = { Cracks }
