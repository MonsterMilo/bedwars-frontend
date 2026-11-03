// Reads a ReplayMod .mcpr (what Prism Proxy's replay saver writes) and turns
// it into a timeline the viewer can jump around in:
//   - world: every chunk column ever sent, as first seen (unloads are
//     ignored so the whole map stays drawn), plus a list of block changes
//     with the block before and after, so time can run both ways.
//   - players: position/rotation samples per entity, with gaps while dead.
//   - chat: every chat line with its time; final kills and bed breaks
//     become timeline markers.
// Pure data - no three.js here, so it runs in Node tests too.
// Minecraft 1.8 protocol (47), clientbound play packets.

const { unzipSync } = require('fflate')

const P = {
  JOIN: 0x01, CHAT: 0x02, TIME: 0x03, EQUIP: 0x04, RESPAWN: 0x07, POSITION: 0x08,
  ANIMATION: 0x0b, SPAWN_PLAYER: 0x0c, DESTROY: 0x13, REL_MOVE: 0x15, LOOK: 0x16,
  LOOK_MOVE: 0x17, TELEPORT: 0x18, HEAD_LOOK: 0x19, STATUS: 0x1a, METADATA: 0x1c,
  CHUNK: 0x21, MULTI_BLOCK: 0x22, BLOCK: 0x23, CHUNK_BULK: 0x26, EXPLOSION: 0x27,
  PLAYER_LIST: 0x38, TEAMS: 0x3e
}

class Reader {
  constructor (buf, pos, end) {
    this.b = buf; this.pos = pos; this.end = end
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  varint () { let r = 0; let s = 0; let x; do { x = this.b[this.pos++]; r |= (x & 0x7f) << s; s += 7 } while ((x & 0x80) && s < 35); return r }
  u8 () { return this.b[this.pos++] }
  i8 () { const v = this.dv.getInt8(this.pos); this.pos += 1; return v }
  bool () { return this.b[this.pos++] !== 0 }
  i16 () { const v = this.dv.getInt16(this.pos); this.pos += 2; return v }
  u16 () { const v = this.dv.getUint16(this.pos); this.pos += 2; return v }
  i32 () { const v = this.dv.getInt32(this.pos); this.pos += 4; return v }
  f32 () { const v = this.dv.getFloat32(this.pos); this.pos += 4; return v }
  f64 () { const v = this.dv.getFloat64(this.pos); this.pos += 8; return v }
  blockPos () {
    const hi = this.dv.getInt32(this.pos); const lo = this.dv.getUint32(this.pos + 4); this.pos += 8
    // 26 bits x, 12 bits y, 26 bits z
    const x = hi >> 6
    const y = ((hi & 0x3f) << 6) | (lo >>> 26)
    const z = (lo << 6) >> 6
    return [x, y, z]
  }

  uuid () {
    let s = ''
    for (let k = 0; k < 16; k++) s += this.b[this.pos++].toString(16).padStart(2, '0')
    return s
  }

  str () {
    const n = this.varint()
    const s = new TextDecoder().decode(this.b.subarray(this.pos, this.pos + n))
    this.pos += n
    return s
  }

  bytes (n) { const s = this.b.subarray(this.pos, this.pos + n); this.pos += n; return s }
}

/** Chat JSON -> plain text (colour codes dropped). */
function chatText (json) {
  let c
  try { c = JSON.parse(json) } catch { return String(json) }
  const walk = (n) => {
    if (n == null) return ''
    if (typeof n === 'string') return n
    if (Array.isArray(n)) return n.map(walk).join('')
    let s = n.text || ''
    if (n.translate && !n.text) s = n.translate
    if (Array.isArray(n.extra)) s += n.extra.map(walk).join('')
    return s
  }
  return walk(c).replace(/§./g, '')
}

// Bed Wars teams are named like "Red8"; their colour is fixed.
const TEAM_COLORS = {
  red: '#ff5555', blue: '#5555ff', green: '#55ff55', yellow: '#ffff55', aqua: '#55ffff', white: '#ffffff', pink: '#ff55ff', gray: '#aaaaaa', grey: '#aaaaaa'
}
function bedwarsTeam (name) {
  const m = String(name || '').match(/^(Red|Blue|Green|Yellow|Aqua|White|Pink|Gr[ae]y)\d*$/i)
  return m ? { label: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), color: TEAM_COLORS[m[1].toLowerCase()] } : null
}

const COLOR_CODES = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff'
}
/** The last colour code in a scoreboard team prefix, as a CSS colour. */
function prefixColor (prefix) {
  const m = String(prefix || '').match(/§([0-9a-f])/gi)
  return m ? COLOR_CODES[m[m.length - 1][1].toLowerCase()] : null
}

/** Raw .mcpr bytes -> { meta, rec, packets: {t, id, start, end} typed arrays }. */
function readMcpr (bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
  if (!files['recording.tmcpr']) throw new Error('This file has no recording in it (not a Replay Mod file?)')
  let meta = {}
  try { meta = JSON.parse(new TextDecoder().decode(files['metaData.json'])) } catch { /* optional */ }
  const rec = files['recording.tmcpr']
  const dv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength)
  // Count first so the arrays are the right size.
  let n = 0
  for (let i = 0; i + 8 <= rec.length;) { const len = dv.getInt32(i + 4); i += 8 + len; n++ }
  const t = new Int32Array(n); const id = new Int32Array(n); const start = new Int32Array(n); const end = new Int32Array(n)
  let i = 0
  for (let k = 0; k < n; k++) {
    t[k] = dv.getInt32(i); const len = dv.getInt32(i + 4); i += 8
    const r = new Reader(rec, i, i + len)
    id[k] = r.varint(); start[k] = r.pos; end[k] = i + len
    i += len
  }
  return { meta, rec, packets: { n, t, id, start, end } }
}

const colKey = (x, z) => x + ',' + z
const PRIVATE_CHAT = /^\s*(From |To |Party >|P >|Guild >|G >|Officer >|O >|Friend >|F >|\[Party\]|-{5,}|You'll be partying with|.* has (invited you|joined the party|left the party)|Party (Leader|Moderators|Members))/

/** One growing list of block changes, stored in typed arrays. */
class ChangeList {
  constructor () { this.n = 0; this.cap = 4096; this.alloc() }
  alloc () {
    const grow = (a, T) => { const b = new T(this.cap); if (a) b.set(a.subarray(0, this.n)); return b }
    this.t = grow(this.t, Int32Array); this.x = grow(this.x, Int32Array); this.y = grow(this.y, Uint8Array)
    this.z = grow(this.z, Int32Array); this.from = grow(this.from, Uint16Array); this.to = grow(this.to, Uint16Array)
  }

  push (t, x, y, z, from, to) {
    if (this.n === this.cap) { this.cap *= 2; this.alloc() }
    const k = this.n++
    this.t[k] = t; this.x[k] = x; this.y[k] = y; this.z[k] = z; this.from[k] = from; this.to[k] = to
  }
}

/** Per-entity samples: time, position, yaw/pitch (degrees), shown or not. */
class Track {
  constructor (id) {
    this.id = id; this.uuid = null
    this.t = []; this.x = []; this.y = []; this.z = []; this.yaw = []; this.pitch = []; this.alive = []
    this.swings = []; this.hurts = []; this.sneak = []
    this.cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, alive: false }
  }

  sample (t) {
    const c = this.cur; const n = this.t.length
    // Several packets in the same millisecond: keep the last.
    if (n && this.t[n - 1] === t) {
      this.x[n - 1] = c.x; this.y[n - 1] = c.y; this.z[n - 1] = c.z; this.yaw[n - 1] = c.yaw; this.pitch[n - 1] = c.pitch; this.alive[n - 1] = c.alive
      return
    }
    this.t.push(t); this.x.push(c.x); this.y.push(c.y); this.z.push(c.z); this.yaw.push(c.yaw); this.pitch.push(c.pitch); this.alive.push(c.alive)
  }

  /** Index of the last sample at or before t, or -1. */
  indexAt (t) {
    let lo = 0; let hi = this.t.length - 1; let ans = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (this.t[m] <= t) { ans = m; lo = m + 1 } else hi = m - 1 }
    return ans
  }

  /** Where the entity is at time t (smoothed between samples), or null. */
  stateAt (t) {
    const i = this.indexAt(t)
    if (i < 0 || !this.alive[i]) return null
    const j = i + 1
    let f = 0
    if (j < this.t.length && this.alive[j]) {
      const dt = this.t[j] - this.t[i]
      // Long gaps are teleports or pauses - don't glide across them.
      if (dt > 0 && dt <= 400) f = (t - this.t[i]) / dt
    }
    const lerp = (a) => a[i] + (a[j] - a[i]) * f
    let yaw = this.yaw[i]
    if (f) { let d = ((this.yaw[j] - yaw) % 360 + 540) % 360 - 180; yaw += d * f }
    return {
      x: f ? lerp(this.x) : this.x[i], y: f ? lerp(this.y) : this.y[i], z: f ? lerp(this.z) : this.z[i],
      yaw, pitch: f ? lerp(this.pitch) : this.pitch[i]
    }
  }

  /** Is there an event in `list` within `ms` before time t? */
  recent (list, t, ms) {
    let lo = 0; let hi = list.length - 1; let ans = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m] <= t) { ans = m; lo = m + 1 } else hi = m - 1 }
    return ans >= 0 && t - list[ans] < ms
  }

  sneakingAt (t) {
    let v = false
    for (const [st, on] of this.sneak) { if (st > t) break; v = on }
    return v
  }
}

const SECTION = 4096

/**
 * Build the whole timeline. `onProgress(fraction)` is called now and then.
 * Returns { meta, info, duration, columns, changes, tracks, names, teams, chat, markers, selfId }.
 */
function buildTimeline (mcpr, onProgress = () => {}) {
  const { meta, rec, packets } = mcpr
  const { n, t: T, id: ID, start: S, end: E } = packets
  const columns = new Map() // "x,z" -> { x, z, sections: Array(16) of Uint16Array|null, firstSeen }
  const current = new Map() // live state while building, same shape (shares arrays at first)
  const changes = new ChangeList()
  const tracks = new Map()
  const names = new Map() // uuid (no dashes) -> name
  const skins = new Map() // uuid -> textures property (base64)
  const teamOf = new Map() // player name -> team name
  const teams = new Map() // team name -> { prefix, color }
  const chat = []
  const markers = []
  let info = {}
  let duration = meta.duration || (n ? T[n - 1] : 0)
  let self = { id: meta.selfId != null ? meta.selfId : null, positions: [] }

  const track = (eid) => { let tr = tracks.get(eid); if (!tr) { tr = new Track(eid); tracks.set(eid, tr) } return tr }

  const getBlock = (x, y, z) => {
    if (y < 0 || y > 255) return 0
    const c = current.get(colKey(x >> 4, z >> 4)); if (!c) return 0
    const s = c.sections[y >> 4]; if (!s) return 0
    return s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)]
  }
  const setBlock = (t, x, y, z, to) => {
    if (y < 0 || y > 255) return
    const c = current.get(colKey(x >> 4, z >> 4)); if (!c) return
    let s = c.sections[y >> 4]
    if (!s) { if (!to) return; s = c.sections[y >> 4] = new Uint16Array(SECTION) }
    const i = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15)
    const from = s[i]
    if (from === to) return
    s[i] = to
    changes.push(t, x, y, z, from, to)
  }

  const loadColumn = (t, cx, cz, full, mask, r, skyLight) => {
    const key = colKey(cx, cz)
    let cur = current.get(key)
    const blocks = []
    for (let sy = 0; sy < 16; sy++) {
      if (!(mask & (1 << sy))) continue
      const raw = r.bytes(8192)
      const arr = new Uint16Array(SECTION)
      for (let k = 0; k < SECTION; k++) arr[k] = raw[k * 2] | (raw[k * 2 + 1] << 8)
      blocks.push([sy, arr])
    }
    if (!cur) {
      // First time this column is seen: it becomes part of the base world.
      const sections = new Array(16).fill(null)
      for (const [sy, arr] of blocks) sections[sy] = arr
      columns.set(key, { x: cx, z: cz, sections, firstSeen: t })
      current.set(key, { x: cx, z: cz, sections: sections.map(s => s && s.slice()) })
      return
    }
    // Sent again (Milo came back near it): whatever differs is a change.
    for (const [sy, arr] of blocks) {
      const old = cur.sections[sy]
      for (let k = 0; k < SECTION; k++) {
        const o = old ? old[k] : 0
        if (o !== arr[k]) setBlock(t, (cx << 4) | (k & 15), (sy << 4) | (k >> 8), (cz << 4) | ((k >> 4) & 15), arr[k])
      }
    }
    if (full) {
      // A full column with a section missing means that section is now empty.
      for (let sy = 0; sy < 16; sy++) {
        if (mask & (1 << sy)) continue
        const old = cur.sections[sy]; if (!old) continue
        for (let k = 0; k < SECTION; k++) if (old[k]) setBlock(t, (cx << 4) | (k & 15), (sy << 4) | (k >> 8), (cz << 4) | ((k >> 4) & 15), 0)
      }
    }
  }

  let dimension = 0
  const step = Math.max(1, Math.floor(n / 50))
  for (let k = 0; k < n; k++) {
    if (k % step === 0) onProgress(k / n)
    const t = T[k]; const id = ID[k]
    const r = new Reader(rec, S[k], E[k])
    try {
      switch (id) {
        case P.JOIN: {
          const eid = r.i32(); r.u8(); dimension = r.i8()
          if (self.id == null) self.id = eid
          break
        }
        case P.RESPAWN: dimension = r.i32(); break
        case P.POSITION: {
          // Our own position (only teleports - the server never echoes walking).
          const x = r.f64(); const y = r.f64(); const z = r.f64(); const yaw = r.f32(); const pitch = r.f32(); const flags = r.u8()
          const last = self.positions[self.positions.length - 1]
          const abs = (v, bit, prev) => (flags & bit) && prev != null ? prev + v : v
          self.positions.push({ t, x: abs(x, 1, last && last.x), y: abs(y, 2, last && last.y), z: abs(z, 4, last && last.z), yaw: abs(yaw, 8, last && last.yaw), pitch: abs(pitch, 16, last && last.pitch) })
          break
        }
        case P.CHUNK: {
          const cx = r.i32(); const cz = r.i32(); const full = r.bool(); const mask = r.u16(); r.varint()
          if (full && mask === 0) break // unload: keep it drawn
          loadColumn(t, cx, cz, full, mask, r, dimension === 0)
          break
        }
        case P.CHUNK_BULK: {
          const sky = r.bool(); const count = r.varint()
          const metas = []
          for (let q = 0; q < count; q++) metas.push([r.i32(), r.i32(), r.u16()])
          for (const [cx, cz, mask] of metas) {
            const secs = popcount(mask)
            const sub = new Reader(rec, r.pos, E[k])
            loadColumn(t, cx, cz, true, mask, sub, sky)
            r.pos += secs * 8192 + secs * 2048 + (sky ? secs * 2048 : 0) + 256
          }
          break
        }
        case P.BLOCK: {
          const [x, y, z] = r.blockPos(); setBlock(t, x, y, z, r.varint()); break
        }
        case P.MULTI_BLOCK: {
          const cx = r.i32(); const cz = r.i32(); const cnt = r.varint()
          for (let q = 0; q < cnt; q++) {
            const h = r.u8(); const y = r.u8(); const st = r.varint()
            setBlock(t, (cx << 4) + (h >> 4), y, (cz << 4) + (h & 15), st)
          }
          break
        }
        case P.EXPLOSION: {
          const x = r.f32(); const y = r.f32(); const z = r.f32(); r.f32(); const cnt = r.i32()
          const bx = Math.floor(x); const by = Math.floor(y); const bz = Math.floor(z)
          for (let q = 0; q < cnt; q++) setBlock(t, bx + r.i8(), by + r.i8(), bz + r.i8(), 0)
          break
        }
        case P.SPAWN_PLAYER: {
          const eid = r.varint(); const tr = track(eid)
          tr.uuid = r.uuid()
          tr.cur = { x: r.i32() / 32, y: r.i32() / 32, z: r.i32() / 32, yaw: r.i8() * 360 / 256, pitch: r.i8() * 360 / 256, alive: true }
          tr.sample(t)
          break
        }
        case P.DESTROY: {
          const cnt = r.varint()
          for (let q = 0; q < cnt; q++) { const tr = tracks.get(r.varint()); if (tr && tr.cur.alive) { tr.cur.alive = false; tr.sample(t) } }
          break
        }
        case P.REL_MOVE: case P.LOOK_MOVE: case P.LOOK: {
          const tr = tracks.get(r.varint()); if (!tr || !tr.cur.alive) break
          if (id !== P.LOOK) { tr.cur.x += r.i8() / 32; tr.cur.y += r.i8() / 32; tr.cur.z += r.i8() / 32 }
          if (id !== P.REL_MOVE) { r.i8(); tr.cur.pitch = r.i8() * 360 / 256 } // body yaw ignored: head look drives the model
          tr.sample(t)
          break
        }
        case P.TELEPORT: {
          const tr = tracks.get(r.varint()); if (!tr || !tr.cur.alive) break
          tr.cur.x = r.i32() / 32; tr.cur.y = r.i32() / 32; tr.cur.z = r.i32() / 32; r.i8(); tr.cur.pitch = r.i8() * 360 / 256
          // Two samples at the same spot so the move isn't smoothed over.
          tr.sample(t)
          break
        }
        case P.HEAD_LOOK: {
          const tr = tracks.get(r.varint()); if (!tr || !tr.cur.alive) break
          tr.cur.yaw = r.i8() * 360 / 256; tr.sample(t)
          break
        }
        case P.ANIMATION: {
          const tr = tracks.get(r.varint()); const a = r.u8()
          if (tr && a === 0) tr.swings.push(t)
          if (tr && a === 1) tr.hurts.push(t)
          break
        }
        case P.STATUS: {
          const tr = tracks.get(r.i32()); const s = r.i8()
          if (tr && s === 2) tr.hurts.push(t)
          break
        }
        case P.METADATA: {
          const tr = tracks.get(r.varint()); if (!tr) break
          // Index 0 is the flags byte (0x02 = sneaking); it comes first when sent.
          const head = r.u8()
          if (head !== 0x7f && (head & 0x1f) === 0 && (head >> 5) === 0) tr.sneak.push([t, !!(r.u8() & 0x02)])
          break
        }
        case P.PLAYER_LIST: {
          const action = r.varint(); const cnt = r.varint()
          if (action !== 0) break
          for (let q = 0; q < cnt; q++) {
            const u = r.uuid(); const name = r.str(); const np = r.varint()
            for (let w = 0; w < np; w++) { const pn = r.str(); const pv = r.str(); if (r.bool()) r.str(); if (pn === 'textures') skins.set(u, pv) }
            r.varint(); r.varint(); if (r.bool()) r.str()
            names.set(u, name)
          }
          break
        }
        case P.TEAMS: {
          const name = r.str(); const mode = r.i8()
          let team = teams.get(name)
          if (mode === 0 || mode === 2) {
            r.str(); const prefix = r.str(); r.str(); r.i8(); r.str(); r.i8()
            team = { name, prefix, color: prefixColor(prefix) }
            teams.set(name, team)
          }
          if (mode === 0 || mode === 3) {
            // A player keeps the first Bed Wars team they're put in (Hypixel
            // moves eliminated players to other teams later on).
            const cnt = r.varint()
            for (let q = 0; q < cnt; q++) { const p = r.str(); if (!bedwarsTeam(teamOf.get(p))) teamOf.set(p, name) }
          }
          break
        }
        case P.CHAT: {
          const json = r.str(); const pos = r.pos < r.end ? r.i8() : 0
          if (pos === 2) break // action bar
          const text = chatText(json)
          if (/^\{"server"/.test(text)) {
            try { info = { ...info, ...JSON.parse(text) } } catch { /* not locraw */ }
            break
          }
          if (!text.trim()) break
          // Private and party/guild chat stays out: replays are shared with
          // the roster, and these were never part of the game.
          if (PRIVATE_CHAT.test(text)) break
          chat.push({ t, text })
          if (/FINAL KILL!/.test(text)) markers.push({ t, kind: 'final', text: text.trim() })
          else if (/^\s*BED DESTRUCTION >/.test(text)) markers.push({ t, kind: 'bed', text: text.replace(/^\s*BED DESTRUCTION >\s*/, '').trim() })
          else if (/^\s*(VICTORY|GAME OVER)/i.test(text)) markers.push({ t, kind: 'end', text: text.trim() })
          break
        }
      }
    } catch (err) {
      // One odd packet shouldn't stop the whole replay.
    }
  }
  onProgress(1)
  if (n && T[n - 1] > duration) duration = T[n - 1]

  // Hypixel's NPCs are player entities with version-2 UUIDs; nicked players
  // have version 1, real accounts version 4.
  for (const [eid, tr] of tracks) {
    if (!tr.uuid || !tr.t.length || tr.uuid[12] === '2') { tracks.delete(eid); continue }
    tr.name = names.get(tr.uuid) || null
    tr.nicked = tr.uuid[12] === '1'
    tr.team = bedwarsTeam(teamOf.get(tr.name))
    tr.self = eid === self.id
  }

  return { meta, info, duration, columns, changes, tracks, names, skins, teamOf, teams, chat, markers, self }
}

function popcount (m) { let c = 0; while (m) { c += m & 1; m >>>= 1 } return c }

module.exports = { readMcpr, buildTimeline, chatText, prefixColor, bedwarsTeam, Reader, Track, colKey }
