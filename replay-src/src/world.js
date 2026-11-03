// Keeps the 3D world in step with the replay clock: starts from every
// column as first seen, then applies (or undoes, when going back) the block
// changes up to the current time, and hands them to the block renderer.
const { colKey } = require('./model')

class ReplayWorld {
  constructor (renderer, timeline) {
    this.r = renderer
    this.tl = timeline
    this.cur = new Map()
    for (const [key, c] of timeline.columns) this.cur.set(key, { x: c.x, z: c.z, sections: c.sections.map(s => s && s.slice()) })
    this.applied = 0 // how many changes are in `cur`
  }

  /** Send every column to the renderer (once, at the start). */
  loadAll () {
    for (const col of this.cur.values()) this.r.setColumn(col.x, col.z, col.sections.map(s => s && s.slice()))
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
    const out = []
    while (this.applied < ch.n && ch.t[this.applied] <= t) {
      const k = this.applied++
      this.set(ch.x[k], ch.y[k], ch.z[k], ch.to[k]); out.push(ch.x[k], ch.y[k], ch.z[k], ch.to[k])
    }
    while (this.applied > 0 && ch.t[this.applied - 1] > t) {
      const k = --this.applied
      this.set(ch.x[k], ch.y[k], ch.z[k], ch.from[k]); out.push(ch.x[k], ch.y[k], ch.z[k], ch.from[k])
    }
    if (out.length) this.r.setBlocks(new Int32Array(out))
  }

  /** The block at (x, y, z) right now. */
  get (x, y, z) {
    if (y < 0 || y > 255) return 0
    const col = this.cur.get(colKey(x >> 4, z >> 4)); const s = col && col.sections[y >> 4]
    return s ? s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0
  }

  /** Middle of the map (for the starting camera). */
  center () {
    let sx = 0; let sz = 0; let n = 0
    for (const c of this.cur.values()) { if (c.sections.some(Boolean)) { sx += c.x; sz += c.z; n++ } }
    return n ? { x: (sx / n) * 16 + 8, z: (sz / n) * 16 + 8 } : { x: 0, z: 0 }
  }
}

module.exports = { ReplayWorld }
