// Item meshes, as Minecraft draws them: flat items (swords, ingots, pearls)
// are their 16x16 picture given 1/16 of thickness; block items (wool,
// clay, TNT) are small blocks. Used for held items and dropped items.
const THREE = require('three')
const { glintMaterial } = require('./glint')

class ItemFactory {
  constructor (data, mesher, blocksTex, itemsTex) {
    this.d = data
    this.mesher = mesher
    this.blocksTex = blocksTex
    this.itemsTex = itemsTex
    this.geo = new Map()
    this.pixels = null
    const img = itemsTex.image
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    this.pixels = ctx.getImageData(0, 0, img.width, img.height).data
    this.flatMat = new THREE.MeshLambertMaterial({ map: itemsTex, alphaTest: 0.5, side: THREE.DoubleSide })
    this.blockMat = new THREE.MeshLambertMaterial({ map: blocksTex, alphaTest: 0.5, vertexColors: true })
  }

  name (item) {
    const L = this.d.items.legacy
    return L[item.id + ':' + item.damage] || L[item.id + ':0'] || null
  }

  isBlock (item) {
    const n = this.name(item)
    return item.id < 256 && !(n && this.d.items.textures[n]) && !!n
  }

  /** A mesh for this item, about one block in size, centred. */
  mesh (item, { glint = true } = {}) {
    if (!item) return null
    const name = this.name(item)
    if (!name) return null
    const group = new THREE.Group()
    let mesh = null
    if (this.d.items.textures[name]) {
      const tinted = item.color != null && /^leather_/.test(name)
      const mat = tinted ? this.flatMat.clone() : this.flatMat
      if (tinted) mat.color.setHex(item.color)
      mesh = new THREE.Mesh(this.flatGeo(name), mat)
      group.add(mesh)
      if (tinted && this.d.items.textures[name + '_overlay']) group.add(new THREE.Mesh(this.flatGeo(name + '_overlay'), this.flatMat))
      group.userData.flat = true
    } else if (item.id < 256) {
      const g = this.blockGeo((item.id << 4) | (item.damage & 15))
      if (!g) return null
      mesh = new THREE.Mesh(g, this.blockMat)
      group.add(mesh)
      group.userData.block = true
    } else return null
    if (item.glint && glint) {
      const glintMat = glintMaterial(1)
      group.add(new THREE.Mesh(mesh.geometry, glintMat))
      group.userData.glint = glintMat
    }
    return group
  }

  /** The 16x16 picture, extruded 1/16 deep (sides only where pixels end). */
  flatGeo (name) {
    if (this.geo.has('f:' + name)) return this.geo.get('f:' + name)
    const t = this.d.items.textures[name]
    const A = this.d.items.atlas
    const pos = []; const uv = []; const nor = []; const idx = []
    const quad = (pts, n, u0, v0, u1, v1) => {
      const b = pos.length / 3
      for (const p of pts) pos.push(...p)
      for (let k = 0; k < 4; k++) nor.push(...n)
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1)
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    const U = (px) => (t.x + px) / A.w; const V = (py) => 1 - (t.y + py) / A.h
    const d = 1 / 32
    // Front and back: the whole picture (transparent pixels are cut out).
    quad([[-0.5, 0.5, d], [0.5, 0.5, d], [0.5, -0.5, d], [-0.5, -0.5, d]], [0, 0, 1], U(0), V(0), U(16), V(16))
    quad([[0.5, 0.5, -d], [-0.5, 0.5, -d], [-0.5, -0.5, -d], [0.5, -0.5, -d]], [0, 0, -1], U(16), V(0), U(0), V(16))
    const W = this.itemsTex.image.width
    const solid = (px, py) => px >= 0 && py >= 0 && px < 16 && py < 16 && this.pixels[((t.y + py) * W + t.x + px) * 4 + 3] > 127
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        if (!solid(px, py)) continue
        const x0 = px / 16 - 0.5; const x1 = x0 + 1 / 16; const y1 = 0.5 - py / 16; const y0 = y1 - 1 / 16
        const u0 = U(px + 0.1); const u1 = U(px + 0.9); const v0 = V(py + 0.1); const v1 = V(py + 0.9)
        if (!solid(px - 1, py)) quad([[x0, y1, -d], [x0, y1, d], [x0, y0, d], [x0, y0, -d]], [-1, 0, 0], u0, v0, u1, v1)
        if (!solid(px + 1, py)) quad([[x1, y1, d], [x1, y1, -d], [x1, y0, -d], [x1, y0, d]], [1, 0, 0], u0, v0, u1, v1)
        if (!solid(px, py - 1)) quad([[x0, y1, -d], [x1, y1, -d], [x1, y1, d], [x0, y1, d]], [0, 1, 0], u0, v0, u1, v1)
        if (!solid(px, py + 1)) quad([[x0, y0, d], [x1, y0, d], [x1, y0, -d], [x0, y0, -d]], [0, -1, 0], u0, v0, u1, v1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    this.geo.set('f:' + name, g)
    return g
  }

  /** A block's model as a small mesh centred on the origin. */
  blockGeo (stateId) {
    const key = 'b:' + stateId
    if (this.geo.has(key)) return this.geo.get(key)
    const b = this.mesher.blockInfo(stateId)
    let quads = b.air ? [] : this.mesher.modelQuads(b.name, b.props)
    if (!quads.length) {
      // Chests and the like: draw a plain cube with the block's texture if any.
      quads = []
    }
    if (!quads.length) { this.geo.set(key, null); return null }
    const W = this.mesher.W; const H = this.mesher.H
    const pos = []; const uv = []; const col = []; const idx = []
    const SH = { up: 1, down: 0.5, north: 0.8, south: 0.8, west: 0.6, east: 0.6 }
    const tint = this.mesher.tintFor(b.name)
    for (const q of quads) {
      const base = pos.length / 3
      const s = SH[q.dir] || 1
      const c = q.tint ? tint.map(v => v / 255 * s) : [s, s, s]
      for (let k = 0; k < 4; k++) {
        pos.push(q.pos[k][0] - 0.5, q.pos[k][1] - 0.5, q.pos[k][2] - 0.5)
        const u = q.uv[k]
        // (the block atlas is loaded unflipped, for the block shader)
        uv.push((q.tex.x + Math.min(Math.max(u[0], 0.02), 15.98) / 16 * q.tex.w) / W, (q.tex.y + Math.min(Math.max(u[1], 0.02), 15.98) / 16 * q.tex.h) / H)
        col.push(...c)
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    this.geo.set(key, g)
    return g
  }
}

module.exports = { ItemFactory }
