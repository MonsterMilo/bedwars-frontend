// Keeps the 3D world in step with the replay clock: starts from every
// column as first seen, then applies (or undoes, when going back) the block
// changes up to the current time.
const { Vec3 } = require('vec3')
const Chunk = require('prismarine-chunk')('1.8.8')
const { Buffer } = require('buffer')
const { colKey } = require('./model')

// Above this many changes in one jump, whole columns are re-sent instead
// of block-by-block updates.
const BULK = 150

class ReplayWorld {
  constructor (viewer, timeline) {
    this.viewer = viewer
    this.tl = timeline
    this.cur = new Map()
    for (const [key, c] of timeline.columns) this.cur.set(key, { x: c.x, z: c.z, sections: c.sections.map(s => s && s.slice()) })
    this.applied = 0 // how many changes are in `cur`
  }

  chunkJson (col) {
    let mask = 0; let secs = 0
    for (let sy = 0; sy < 16; sy++) if (col.sections[sy]) { mask |= 1 << sy; secs++ }
    const buf = Buffer.alloc(secs * (8192 + 2048 + 2048) + 256)
    let o = 0
    for (let sy = 0; sy < 16; sy++) {
      const s = col.sections[sy]; if (!s) continue
      for (let k = 0; k < 4096; k++) { buf[o++] = s[k] & 0xff; buf[o++] = s[k] >> 8 }
    }
    o += secs * 2048 // block light: dark
    buf.fill(0xff, o, o + secs * 2048) // sky light: full
    o += secs * 2048
    buf.fill(1, o, o + 256) // plains, for grass and leaf colours
    const chunk = new Chunk()
    chunk.load(buf, mask, true, true)
    return chunk.toJson()
  }

  /** Send every column to the renderer (once, at the start). */
  loadAll () {
    for (const col of this.cur.values()) this.viewer.addColumn(col.x * 16, col.z * 16, this.chunkJson(col))
  }

  set (x, y, z, v) {
    const col = this.cur.get(colKey(x >> 4, z >> 4)); if (!col) return
    let s = col.sections[y >> 4]
    if (!s) { if (!v) return; s = col.sections[y >> 4] = new Uint16Array(4096) }
    s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = v
  }

  /** Move the world to replay time t. */
  seek (t) {
    const ch = this.tl.changes
    const touched = []
    while (this.applied < ch.n && ch.t[this.applied] <= t) {
      const k = this.applied++
      this.set(ch.x[k], ch.y[k], ch.z[k], ch.to[k]); touched.push(k)
    }
    while (this.applied > 0 && ch.t[this.applied - 1] > t) {
      const k = --this.applied
      this.set(ch.x[k], ch.y[k], ch.z[k], ch.from[k]); touched.push(k)
    }
    if (!touched.length) return
    if (touched.length <= BULK) {
      for (const k of touched) {
        const x = ch.x[k]; const y = ch.y[k]; const z = ch.z[k]
        const col = this.cur.get(colKey(x >> 4, z >> 4))
        const s = col && col.sections[y >> 4]
        this.viewer.setBlockStateId(new Vec3(x, y, z), s ? s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0)
      }
      return
    }
    const cols = new Set()
    for (const k of touched) cols.add(colKey(ch.x[k] >> 4, ch.z[k] >> 4))
    for (const key of cols) { const col = this.cur.get(key); this.viewer.addColumn(col.x * 16, col.z * 16, this.chunkJson(col)) }
  }

  /** Middle of the map (for the starting camera). */
  center () {
    let sx = 0; let sz = 0; let n = 0
    for (const c of this.cur.values()) { if (c.sections.some(Boolean)) { sx += c.x; sz += c.z; n++ } }
    return n ? { x: (sx / n) * 16 + 8, z: (sz / n) * 16 + 8 } : { x: 0, z: 0 }
  }
}

module.exports = { ReplayWorld }
