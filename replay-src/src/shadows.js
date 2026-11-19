// Round shadows under players, dropped items and other entities, the way
// Minecraft 1.8 draws them (Render.renderShadow): the shadow picture laid
// on the top of every full block under the entity, fainter the higher the
// entity is above it and the darker that spot is. In game they fade out
// 16 blocks from the camera; spectating is usually from further away, so
// here they fade over 32.
const THREE = require('three')

const MAX_QUADS = 1500

class Shadows {
  constructor (scene, world, mesher) {
    this.world = world
    this.mesher = mesher
    this.brightness = () => 1 // light at a block (set once lighting is known)
    const g = new THREE.BufferGeometry()
    this.pos = new Float32Array(MAX_QUADS * 4 * 3); this.uv = new Float32Array(MAX_QUADS * 4 * 2); this.alpha = new Float32Array(MAX_QUADS * 4)
    const idx = new Uint32Array(MAX_QUADS * 6)
    for (let i = 0; i < MAX_QUADS; i++) idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6)
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.setDrawRange(0, 0)
    this.geo = g
    const tex = new THREE.TextureLoader().load('replay/shadow.png')
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: `
        attribute float alpha; varying vec2 vUv; varying float vA;
        void main () { vUv = uv; vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUv; varying float vA;
        void main () {
          if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(t.rgb, t.a * vA);
        }`
    })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    scene.add(this.mesh)
    this.full = new Map()
  }

  isFull (state) {
    let v = this.full.get(state)
    if (v === undefined) { const b = this.mesher.blockInfo(state); v = !!b.full; this.full.set(state, v) }
    return v
  }

  /** casters: [{ x, y, z, size, opacity }] at this moment. */
  update (casters, camera) {
    let q = 0
    const cam = camera.position
    for (const c of casters) {
      const d2 = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2
      const fade = (1 - d2 / 1024) * c.opacity
      if (fade <= 0) continue
      const f = c.size
      const x0 = Math.floor(c.x - f); const x1 = Math.floor(c.x + f)
      const y0 = Math.floor(c.y - f); const y1 = Math.floor(c.y)
      const z0 = Math.floor(c.z - f); const z1 = Math.floor(c.z + f)
      for (let bx = x0; bx <= x1; bx++) {
        for (let by = y0; by <= y1; by++) {
          for (let bz = z0; bz <= z1; bz++) {
            if (q >= MAX_QUADS) break
            // The block under this cell must be a full cube.
            const below = this.world.get(bx, by - 1, bz)
            if (!(below >> 4) || !this.isFull(below)) continue
            const light = this.brightness(bx, by, bz)
            const a = (fade - (c.y - by) / 2) * 0.5 * light
            if (a <= 0) continue
            const top = by + 0.015625
            const u0 = (bx - c.x) / 2 / f + 0.5; const u1 = (bx + 1 - c.x) / 2 / f + 0.5
            const v0 = (bz - c.z) / 2 / f + 0.5; const v1 = (bz + 1 - c.z) / 2 / f + 0.5
            const p = q * 12; const t = q * 8; const al = q * 4
            this.pos.set([bx, top, bz, bx + 1, top, bz, bx + 1, top, bz + 1, bx, top, bz + 1], p)
            this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], t)
            this.alpha.fill(Math.min(1, a), al, al + 4)
            q++
          }
        }
      }
    }
    const g = this.geo
    g.setDrawRange(0, q * 6)
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.alpha.needsUpdate = true
  }
}

module.exports = { Shadows }
