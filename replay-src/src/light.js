// Minecraft 1.8 lighting: sky light (15 under open sky, spreading sideways
// and fading by one a block, or more through water and leaves) and block
// light from torches, glowstone, lava and the like, worked out over the
// whole map in the mesh worker and kept up to date as blocks change. The
// lightmap turns the two levels into a colour the way the game does at
// midday (warm torchlight, near-black in sealed caves).

// Light given off, by block id.
const EMIT = new Uint8Array(256)
for (const [ids, v] of [[[10, 11, 51, 89, 91, 119, 124, 138, 169], 15], [[50], 14], [[62], 13], [[90], 11], [[74], 9], [[76, 94, 130], 7], [[39, 117, 122], 1]]) for (const id of ids) EMIT[id] = v

// --- Lightmap (EntityRenderer.updateLightmap at full daylight) ---
const table = (i) => { const f = 1 - i / 15; return (1 - f) / (f * 3 + 1) }
const GAMMA = 0.5 // halfway between Moody and Bright
const finish = (c) => {
  c = Math.min(1, c * 0.96 + 0.03)
  const g = 1 - Math.pow(1 - c, 4)
  return Math.min(1, Math.max(0, (c * (1 - GAMMA) + g * GAMMA) * 0.96 + 0.03))
}
/** RGB for (possibly fractional) sky and block levels, into out[o..o+2]. */
function lightRGB (sky, block, out, o = 0) {
  const s = table(sky)
  const b = table(block) * 1.5
  const g = b * ((b * 0.6 + 0.4) * 0.6 + 0.4)
  const bl = b * (b * b * 0.6 + 0.4)
  out[o] = finish(s + b); out[o + 1] = finish(s + g); out[o + 2] = finish(s + bl)
  return out
}
const LUT = new Float32Array(256 * 3)
for (let i = 0; i < 256; i++) lightRGB(i >> 4, i & 15, LUT, i * 3)

/** A copy of the light grid on the main thread, for lighting entities and the hand. */
class LightGrid {
  constructor () { this.data = null }
  /** A full grid or a patch from the worker. */
  apply (m) {
    if (m.full) { this.x0 = m.x0; this.z0 = m.z0; this.X = m.X; this.Z = m.Z; this.H = m.H; this.data = m.data; return }
    if (!this.data) return
    const { X, Z } = this
    let k = 0
    for (let y = 0; y < m.h; y++) for (let z = m.z; z < m.z + m.d; z++) { const row = (y * Z + z) * X; for (let x = m.x; x < m.x + m.w; x++) this.data[row + x] = m.data[k++] }
  }

  get (x, y, z) {
    if (!this.data) return 0xf0
    if (y >= this.H) return 0xf0
    if (y < 0) return 0
    const lx = x - this.x0; const lz = z - this.z0
    if (lx < 0 || lz < 0 || lx >= this.X || lz >= this.Z) return 0xf0
    return this.data[(y * this.Z + lz) * this.X + lx]
  }

  /** Light at a spot, taking the brightest neighbour if it's inside a solid block. */
  at (x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z)
    const v = this.get(x, y, z)
    if (v) return v
    let s = 0; let b = 0
    for (const [dx, dy, dz] of N6) { const n = this.get(x + dx, y + dy, z + dz); s = Math.max(s, n >> 4); b = Math.max(b, n & 15) }
    return s << 4 | b
  }

  /** Lightmap colour at a spot, into a THREE.Color (or anything with r, g, b). */
  color (x, y, z, out) {
    const i = this.at(x, y, z) * 3
    out.r = LUT[i]; out.g = LUT[i + 1]; out.b = LUT[i + 2]
    return out
  }

  /** 0..1 brightness at a spot (World.getLightBrightness: the stronger of the two). */
  brightness (x, y, z) {
    const v = this.at(x, y, z)
    return table(Math.max(v >> 4, v & 15))
  }
}

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

/** The light engine (in the worker), over a box covering every column. */
class Light {
  constructor (mesher) {
    this.m = mesher
    this.oe = null // per cell: opacity << 4 | emission
    this.light = null // per cell: sky << 4 | block
    this.cache = new Int16Array(65536).fill(-1)
    this.queue = []
  }

  props (state) {
    let v = this.cache[state]
    if (v >= 0) return v
    const b = this.m.blockInfo(state); const n = b.name
    let op = 0
    if (b.air) op = 0
    else if (/^(water|ice)$/.test(n)) op = 3
    else if (/leaves/.test(n)) op = 1
    else if (b.solid || /_slab$|_stairs$|^farmland$/.test(n)) op = 15
    v = op << 4 | (b.air ? 0 : EMIT[state >> 4])
    this.cache[state] = v
    return v
  }

  /** Builds the grid from the current world. Returns true if it already existed. */
  build () {
    const had = !!this.light
    let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity; let top = 0
    for (const [k, secs] of this.m.cols) {
      // Empty columns (and empty sections) are open sky.
      let hi = -1
      for (let s = 15; s >= 0 && hi < 0; s--) { const sec = secs[s]; if (sec) for (let i = 0; i < 4096; i++) if (sec[i]) { hi = s; break } }
      if (hi < 0) continue
      const [cx, cz] = k.split(',').map(Number)
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minZ = Math.min(minZ, cz); maxZ = Math.max(maxZ, cz)
      top = Math.max(top, hi + 1)
    }
    if (minX === Infinity) return had
    this.x0 = minX * 16; this.z0 = minZ * 16
    this.X = (maxX - minX + 1) * 16; this.Z = (maxZ - minZ + 1) * 16
    this.H = Math.min(256, top * 16 + 16) // a section of open air on top
    const { X, Z, H } = this
    this.oe = new Uint8Array(X * Z * H)
    this.light = new Uint8Array(X * Z * H)
    for (const [k, secs] of this.m.cols) {
      const [cx, cz] = k.split(',').map(Number)
      const ox = cx * 16 - this.x0; const oz = cz * 16 - this.z0
      if (ox < 0 || oz < 0 || ox >= X || oz >= Z) continue
      for (let s = 0; s < 16 && s * 16 < H; s++) {
        const sec = secs[s]; if (!sec) continue
        for (let i = 0; i < 4096; i++) {
          const st = sec[i]; if (!st) continue
          const y = s * 16 + (i >> 8); const z = oz + ((i >> 4) & 15); const x = ox + (i & 15)
          this.oe[(y * Z + z) * X + x] = this.props(st)
        }
      }
    }
    this.compute(0, 0, X, Z)
    return had
  }

  idx (x, y, z) {
    const lx = x - this.x0; const lz = z - this.z0
    if (y < 0 || y >= this.H || lx < 0 || lz < 0 || lx >= this.X || lz >= this.Z) return -1
    return (y * this.Z + lz) * this.X + lx
  }

  /** A block changed (world coordinates): true if the light needs redoing, 'outside' if the grid must grow. */
  set (x, y, z, state) {
    if (!this.oe) return false
    const v = this.props(state)
    const i = this.idx(x, y, z)
    if (i < 0) return v && y >= 0 && y < 256 ? 'outside' : false // the grid has to grow
    if (v === this.oe[i]) return false
    this.oe[i] = v
    return true
  }

  /** Works the light out again inside [x0, x1) x [z0, z1) (grid columns), every height. */
  compute (x0, z0, x1, z1) {
    const { X, Z, H, oe, light } = this
    const XZ = X * Z
    const q = this.queue; q.length = 0
    // Straight down from the sky, and what each block gives off.
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        let l = 15
        for (let y = H - 1; y >= 0; y--) {
          const i = (y * Z + z) * X + x
          const o = oe[i] >> 4
          if (o !== 0 || l !== 15) l = Math.max(0, l - Math.max(1, o))
          light[i] = l << 4 | (oe[i] & 15)
        }
      }
    }
    // Spread: start from every cell that can light a neighbour, plus the
    // cells just outside the box (they're right already).
    const canSpread = (i, x, y, z) => {
      const v = light[i]; const s = v >> 4; const b = v & 15
      if (s < 2 && b < 2) return false
      for (let k = 0; k < 6; k++) {
        let n
        if (k === 0) { if (x + 1 >= X) continue; n = i + 1 } else if (k === 1) { if (x === 0) continue; n = i - 1 } else if (k === 2) { if (z + 1 >= Z) continue; n = i + X } else if (k === 3) { if (z === 0) continue; n = i - X } else if (k === 4) { if (y + 1 >= H) continue; n = i + XZ } else { if (y === 0) continue; n = i - XZ }
        const o = oe[n] >> 4; if (o === 15) continue
        const c = Math.max(1, o); const nv = light[n]
        if (s - c > nv >> 4 || b - c > (nv & 15)) return true
      }
      return false
    }
    for (let y = 0; y < H; y++) {
      for (let z = Math.max(0, z0 - 1); z < Math.min(Z, z1 + 1); z++) {
        for (let x = Math.max(0, x0 - 1); x < Math.min(X, x1 + 1); x++) {
          const i = (y * Z + z) * X + x
          if (canSpread(i, x, y, z)) q.push(i)
        }
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h]
      const x = i % X; const t = (i - x) / X; const z = t % Z; const y = (t - z) / Z
      const v = light[i]; const s = v >> 4; const b = v & 15
      for (let k = 0; k < 6; k++) {
        let n
        if (k === 0) { if (x + 1 >= X) continue; n = i + 1 } else if (k === 1) { if (x === 0) continue; n = i - 1 } else if (k === 2) { if (z + 1 >= Z) continue; n = i + X } else if (k === 3) { if (z === 0) continue; n = i - X } else if (k === 4) { if (y + 1 >= H) continue; n = i + XZ } else { if (y === 0) continue; n = i - XZ }
        const o = oe[n] >> 4; if (o === 15) continue
        const c = Math.max(1, o); const nv = light[n]
        const ns = Math.max(nv >> 4, s - c); const nb = Math.max(nv & 15, b - c)
        const w = ns << 4 | nb
        if (w !== nv) { light[n] = w; q.push(n) }
      }
      if (h > 1 << 20 && h * 2 > q.length) { q.splice(0, h + 1); h = -1 } // keep the queue small
    }
    q.length = 0
  }

  /**
   * Relights after these changes (world coordinates, flat x,y,z,...).
   * Calls touched(x, y, z) for every cell whose light changed, and returns
   * the patch for the main thread.
   */
  relight (cells, touched) {
    if (!this.light) return null
    const { X, Z, H } = this
    let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity
    for (let k = 0; k < cells.length; k += 3) {
      const lx = cells[k] - this.x0; const lz = cells[k + 2] - this.z0
      x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz)
    }
    if (x0 === Infinity) return null
    x0 = Math.max(0, x0 - 16); z0 = Math.max(0, z0 - 16); x1 = Math.min(X, x1 + 17); z1 = Math.min(Z, z1 + 17)
    const w = x1 - x0; const d = z1 - z0
    const old = new Uint8Array(w * d * H)
    let k = 0
    for (let y = 0; y < H; y++) for (let z = z0; z < z1; z++) { const row = (y * Z + z) * X; for (let x = x0; x < x1; x++) old[k++] = this.light[row + x] }
    this.compute(x0, z0, x1, z1)
    const patch = new Uint8Array(w * d * H)
    k = 0
    for (let y = 0; y < H; y++) {
      for (let z = z0; z < z1; z++) {
        const row = (y * Z + z) * X
        for (let x = x0; x < x1; x++) {
          const v = this.light[row + x]
          if (v !== old[k]) touched(x + this.x0, y, z + this.z0)
          patch[k++] = v
        }
      }
    }
    return { full: false, x: x0, z: z0, w, d, h: H, data: patch }
  }

  /** The whole grid, for the main thread. */
  snapshot () {
    return { full: true, x0: this.x0, z0: this.z0, X: this.X, Z: this.Z, H: this.H, data: this.light.slice() }
  }

  get (x, y, z) {
    if (y >= this.H) return 0xf0
    const i = this.idx(x, y, z)
    if (i < 0) return y < 0 ? 0 : 0xf0
    return this.light[i]
  }

  opaque (x, y, z) { const i = this.idx(x, y, z); return i >= 0 && (this.oe[i] >> 4) === 15 }

  /** Light of a cell; slabs, stairs and other opaque cells take their brightest neighbour. */
  cell (x, y, z) {
    const v = this.get(x, y, z)
    if (v || !this.opaque(x, y, z)) return v
    let s = 0; let b = 0
    for (const [dx, dy, dz] of N6) { const n = this.get(x + dx, y + dy, z + dz); s = Math.max(s, n >> 4); b = Math.max(b, n & 15) }
    return s << 4 | b
  }
}

module.exports = { Light, LightGrid, lightRGB }
