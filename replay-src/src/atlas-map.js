// Prism Atlas map data, without the page (so it runs in Node tests too):
// reading the backend's map files, and making the same kind of map from a
// local replay.
const { gunzipSync } = require('fflate')
const { readMcpr, buildTimeline } = require('./model')

/** A map file (gzip, see atlas-core.js in the backend) -> { header, columns: [{ x, z, kind, sections }] }. */
function decodeMap (bytes) {
  const buf = gunzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'PATL') throw new Error('This isn\'t an Atlas map file')
  const n = dv.getUint32(4)
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + n)))
  if (header.v !== 1) throw new Error('This map file is from a newer version of the Atlas')
  let p = 8 + n
  const columns = []
  for (const [x, z, mask, kind] of header.columns) {
    const sections = new Array(16).fill(null)
    for (let sy = 0; sy < 16; sy++) {
      if (!(mask & (1 << sy))) continue
      const s = new Uint16Array(4096)
      for (let k = 0; k < 4096; k++) s[k] = buf[p + k * 2] | (buf[p + k * 2 + 1] << 8)
      sections[sy] = s
      p += 8192
    }
    columns.push({ x, z, kind, sections })
  }
  return { header, columns }
}

/**
 * A local .mcpr -> the same as decodeMap gives: the map just before the
 * start, minus the waiting lobby (the blocks that go at the start), without
 * the island toppers added then or anything players did later.
 */
function mapFromReplay (bytes) {
  const tl = buildTimeline(readMcpr(bytes))
  const startLine = tl.chat.find(c => /Protect your bed and destroy the enemy beds/.test(c.text || ''))
  const start = startLine ? startLine.t : null
  const BEFORE = 1000; const AFTER = 1500
  const cols = new Map()
  for (const [key, c] of tl.columns) {
    const kind = start == null ? 2 : c.firstSeen < start - BEFORE ? 0 : c.firstSeen <= start + AFTER ? 1 : 2
    cols.set(key, { x: c.x, z: c.z, kind, sections: c.sections.map(s => s && s.slice()) })
  }
  const ch = tl.changes
  if (start != null) {
    for (let k = 0; k < ch.n; k++) {
      const t = ch.t[k]
      if (t > start + AFTER) break
      const c = cols.get((ch.x[k] >> 4) + ',' + (ch.z[k] >> 4))
      if (!c || c.kind === 2) continue
      if (t >= start - BEFORE && ch.to[k] !== 0) continue // toppers
      let s = c.sections[ch.y[k] >> 4]
      if (!s) { if (!ch.to[k]) continue; s = c.sections[ch.y[k] >> 4] = new Uint16Array(4096) }
      s[((ch.y[k] & 15) << 8) | ((ch.z[k] & 15) << 4) | (ch.x[k] & 15)] = ch.to[k]
    }
  }
  const columns = []
  let midgame = 0
  for (const c of cols.values()) {
    c.sections = c.sections.map(s => (s && s.some(v => v) ? s : null))
    if (!c.sections.some(Boolean)) continue
    if (c.kind === 2) midgame++
    columns.push(c)
  }
  const info = tl.info || {}
  const when = tl.meta.date ? new Date(tl.meta.date + (start || 0)).toISOString() : null
  return {
    header: {
      name: info.map || 'Unknown map', modes: info.mode ? [info.mode] : [], local: true,
      sources: [{ id: 'local', playedAt: when, started: start != null }],
      stats: { columns: columns.length, midgameColumns: midgame, complete: columns.length > 0 && midgame === 0 }
    },
    columns
  }
}

module.exports = { decodeMap, mapFromReplay }
