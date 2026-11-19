// The block outline in their eyes: the thin dark box Minecraft draws
// around the block the crosshair is on, within reach (4.5 blocks in
// survival). Someone standing in the way takes the aim instead, like in
// game. Boxes follow 1.8's selection shapes (slabs, beds, carpets,
// ladders, fences, panes, plants...).
const THREE = require('three')
const { LineSegments2 } = require('three/examples/jsm/lines/LineSegments2.js')
const { LineSegmentsGeometry } = require('three/examples/jsm/lines/LineSegmentsGeometry.js')
const { LineMaterial } = require('three/examples/jsm/lines/LineMaterial.js')

const REACH = 4.5
const LIQUID = (id) => id >= 8 && id <= 11
const FENCE = new Set([85, 113, 188, 189, 190, 191, 192, 107, 183, 184, 185, 186, 187, 139])
const PANE = new Set([101, 102, 160])
const SLABS = new Set([44, 126, 182])
// Blocks with nothing to aim at (air, fire, and the like).
const NONE = new Set([0, 51, 36, 90, 119, 209])
// Full-height cubes that fences and panes join onto.
const NOT_SOLID = new Set([0, 6, 8, 9, 10, 11, 18, 20, 26, 27, 28, 30, 31, 32, 37, 38, 39, 40, 44, 50, 51, 53, 54, 55, 59, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 75, 76, 77, 78, 81, 83, 85, 88, 89, 92, 93, 94, 95, 96, 101, 102, 104, 105, 106, 107, 108, 109, 111, 113, 114, 115, 116, 117, 118, 120, 122, 126, 127, 128, 130, 131, 132, 134, 135, 136, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 154, 156, 157, 160, 163, 164, 165, 166, 167, 171, 175, 176, 177, 178, 180, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197])

/** The block's selection box as [x0, y0, z0, x1, y1, z1] inside its cell, or null. */
function boxOf (world, x, y, z, b) {
  const id = b >> 4; const m = b & 15
  if (NONE.has(id) || LIQUID(id)) return null
  if (SLABS.has(id)) return m & 8 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]
  if (id === 26) return [0, 0, 0, 1, 0.5625, 1]
  if (id === 171) return [0, 0, 0, 1, 0.0625, 1]
  if (id === 78) return [0, 0, 0, 1, ((m & 7) + 1) / 8, 1]
  if (id === 54 || id === 130 || id === 146) return [0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]
  if (id === 116) return [0, 0, 0, 1, 0.75, 1]
  if (id === 120) return [0, 0, 0, 1, 0.8125, 1]
  if (id === 65) return [null, [0, 0, 0.875, 1, 1, 1], [0, 0, 0, 1, 1, 0.125], [0.875, 0, 0, 1, 1, 1], [0, 0, 0, 0.125, 1, 1]][m - 1] || [0, 0, 0.875, 1, 1, 1]
  if (id === 31 || id === 32) return [0.1, 0, 0.1, 0.9, 0.8, 0.9]
  if (id === 37 || id === 38 || id === 6) return [0.3125, 0, 0.3125, 0.6875, 0.625, 0.6875]
  if (id === 39 || id === 40) return [0.3, 0, 0.3, 0.7, 0.4, 0.7]
  if (id === 50 || id === 75 || id === 76) {
    const s = 0.15
    if (m === 1) return [0, 0.2, 0.5 - s, s * 2, 0.8, 0.5 + s]
    if (m === 2) return [1 - s * 2, 0.2, 0.5 - s, 1, 0.8, 0.5 + s]
    if (m === 3) return [0.5 - s, 0.2, 0, 0.5 + s, 0.8, s * 2]
    if (m === 4) return [0.5 - s, 0.2, 1 - s * 2, 0.5 + s, 0.8, 1]
    return [0.4, 0, 0.4, 0.6, 0.6, 0.6]
  }
  if (id === 70 || id === 72 || id === 147 || id === 148) return [0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375]
  if (FENCE.has(id) || PANE.has(id)) {
    const fence = FENCE.has(id)
    const r = fence ? 0.125 : 0.0625
    const joins = (dx, dz) => {
      const n = world.get(x + dx, y, z + dz) >> 4
      if (fence ? FENCE.has(n) : PANE.has(n)) return true
      return !NOT_SOLID.has(n) && !LIQUID(n)
    }
    return [joins(-1, 0) ? 0 : 0.5 - r, 0, joins(0, -1) ? 0 : 0.5 - r, joins(1, 0) ? 1 : 0.5 + r, 1, joins(0, 1) ? 1 : 0.5 + r]
  }
  return [0, 0, 0, 1, 1, 1]
}

/** Where a ray (o + d t) enters a box, or Infinity if it misses. */
function hitBox (o, d, b, tMax) {
  let t0 = 0; let t1 = tMax
  for (let k = 0; k < 3; k++) {
    const oo = k === 0 ? o.x : k === 1 ? o.y : o.z
    const dd = k === 0 ? d.x : k === 1 ? d.y : d.z
    const lo = b[k]; const hi = b[k + 3]
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return Infinity; continue }
    let a = (lo - oo) / dd; let c = (hi - oo) / dd
    if (a > c) { const s = a; a = c; c = s }
    if (a > t0) t0 = a
    if (c < t1) t1 = c
    if (t0 > t1) return Infinity
  }
  return t0
}

class Outline {
  constructor (scene, world) {
    this.world = world
    const p = []
    const E = [[0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 1], [1, 0, 1, 0, 0, 1], [0, 0, 1, 0, 0, 0],
      [0, 1, 0, 1, 1, 0], [1, 1, 0, 1, 1, 1], [1, 1, 1, 0, 1, 1], [0, 1, 1, 0, 1, 0],
      [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [1, 0, 1, 1, 1, 1], [0, 0, 1, 0, 1, 1]]
    for (const e of E) p.push(...e)
    const geo = new LineSegmentsGeometry()
    geo.setPositions(p)
    // Minecraft: black at 40%, 2 pixels wide, a hair bigger than the block.
    this.mat = new LineMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.4, depthTest: true })
    this.line = new LineSegments2(geo, this.mat)
    this.line.renderOrder = 3
    this.line.visible = false
    this.line.frustumCulled = false
    scene.add(this.line)
    this.o = new THREE.Vector3(); this.d = new THREE.Vector3()
  }

  /** Aim from the camera; others = present player models that can block it. */
  update (on, camera, others, width, height) {
    this.line.visible = false
    if (!on) return
    this.mat.resolution.set(width, height)
    const o = this.o.copy(camera.position)
    const d = camera.getWorldDirection(this.d)
    // Someone in the way (their hitbox, grown 0.1 like the game's aim).
    let limit = REACH
    for (const m of others) {
      const s = m.state; if (!s) continue
      const t = hitBox(o, d, [s.x - 0.4, s.y - 0.1, s.z - 0.4, s.x + 0.4, s.y + 1.9, s.z + 0.4], limit)
      if (t < limit) limit = t
    }
    // Walk the cells along the ray (Amanatides & Woo).
    let x = Math.floor(o.x); let y = Math.floor(o.y); let z = Math.floor(o.z)
    const sx = Math.sign(d.x); const sy = Math.sign(d.y); const sz = Math.sign(d.z)
    const next = (p, s, dd) => s > 0 ? (Math.floor(p) + 1 - p) / dd : s < 0 ? (p - Math.floor(p)) / -dd : Infinity
    let tx = next(o.x, sx, d.x); let ty = next(o.y, sy, d.y); let tz = next(o.z, sz, d.z)
    const dx = sx ? Math.abs(1 / d.x) : Infinity; const dy = sy ? Math.abs(1 / d.y) : Infinity; const dz = sz ? Math.abs(1 / d.z) : Infinity
    let t = 0
    for (let n = 0; n < 16 && t <= limit; n++) {
      const b = this.world.get(x, y, z)
      if (b >> 4) {
        const box = boxOf(this.world, x, y, z, b)
        if (box) {
          const wb = [x + box[0], y + box[1], z + box[2], x + box[3], y + box[4], z + box[5]]
          const h = hitBox(o, d, wb, limit)
          if (h <= limit) {
            const g = 0.002
            this.line.position.set(wb[0] - g, wb[1] - g, wb[2] - g)
            this.line.scale.set(wb[3] - wb[0] + 2 * g, wb[4] - wb[1] + 2 * g, wb[5] - wb[2] + 2 * g)
            this.line.visible = true
            return
          }
        }
      }
      if (tx < ty && tx < tz) { t = tx; tx += dx; x += sx } else if (ty < tz) { t = ty; ty += dy; y += sy } else { t = tz; tz += dz; z += sz }
    }
  }
}

module.exports = { Outline }
