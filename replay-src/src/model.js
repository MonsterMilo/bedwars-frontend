// Reads a ReplayMod .mcpr (what Prism Proxy's replay saver writes) and turns
// it into a timeline the viewer can jump around in:
//   - world: every chunk column ever sent, as first seen (unloads are
//     ignored so the whole map stays drawn), plus a list of block changes
//     with the block before and after, so time can run both ways.
//   - players: position/rotation samples per entity, with gaps while dead,
//     plus crouching/sprinting/blocking, armour and held items, swings, hits
//     and deaths.
//   - other entities: dropped items, arrows, fireballs, TNT, pearls, mobs,
//     and Hypixel's floating text (generator timers and so on).
//   - effects: particles, block-break bursts and sounds, each with its time.
//   - chat: every chat line (with its colours) and its time; final kills and
//     bed breaks become timeline markers; deaths say who is respawning.
// Pure data - no three.js here, so it runs in Node tests too.
// Minecraft 1.8 protocol (47), clientbound play packets.

const { unzipSync } = require('fflate')

const P = {
  JOIN: 0x01, CHAT: 0x02, TIME: 0x03, EQUIP: 0x04, RESPAWN: 0x07, POSITION: 0x08,
  ANIMATION: 0x0b, SPAWN_PLAYER: 0x0c, COLLECT: 0x0d, SPAWN_OBJECT: 0x0e, SPAWN_MOB: 0x0f,
  VELOCITY: 0x12, DESTROY: 0x13, REL_MOVE: 0x15, LOOK: 0x16, LOOK_MOVE: 0x17, TELEPORT: 0x18,
  HEAD_LOOK: 0x19, STATUS: 0x1a, METADATA: 0x1c, CHUNK: 0x21, MULTI_BLOCK: 0x22, BLOCK: 0x23,
  BLOCK_BREAK_ANIM: 0x25, CHUNK_BULK: 0x26, EXPLOSION: 0x27, EFFECT: 0x28, SOUND: 0x29, PARTICLE: 0x2a,
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
  i64 () { const hi = this.i32(); const lo = this.dv.getUint32(this.pos); this.pos += 4; return hi * 4294967296 + lo }
  f32 () { const v = this.dv.getFloat32(this.pos); this.pos += 4; return v }
  f64 () { const v = this.dv.getFloat64(this.pos); this.pos += 8; return v }
  blockPos () {
    const hi = this.dv.getInt32(this.pos); const lo = this.dv.getUint32(this.pos + 4); this.pos += 8
    // 26 bits x, 12 bits y, 26 bits z
    return [hi >> 6, ((hi & 0x3f) << 6) | (lo >>> 26), (lo << 6) >> 6]
  }

  uuid () {
    let s = ''
    for (let k = 0; k < 16; k++) s += this.b[this.pos++].toString(16).padStart(2, '0')
    return s
  }

  strN (n) { const s = new TextDecoder().decode(this.b.subarray(this.pos, this.pos + n)); this.pos += n; return s }
  str () { return this.strN(this.varint()) }
  bytes (n) { const s = this.b.subarray(this.pos, this.pos + n); this.pos += n; return s }

  /** One NBT tag's payload. Only what the viewer needs is kept. */
  nbt (type) {
    switch (type) {
      case 1: return this.i8()
      case 2: return this.i16()
      case 3: return this.i32()
      case 4: return this.i64()
      case 5: return this.f32()
      case 6: return this.f64()
      case 7: { const n = this.i32(); this.pos += n; return null }
      case 8: return this.strN(this.u16())
      case 9: { const t = this.u8(); const n = this.i32(); const a = []; for (let k = 0; k < n; k++) a.push(this.nbt(t)); return a }
      case 10: {
        const o = {}
        for (;;) { const t = this.u8(); if (t === 0) break; const name = this.strN(this.u16()); o[name] = this.nbt(t) }
        return o
      }
      case 11: { const n = this.i32(); this.pos += n * 4; return null }
      default: throw new Error('bad nbt')
    }
  }

  /** An item stack: { id, count, damage, color, glint } or null. */
  slot () {
    const id = this.i16()
    if (id < 0) return null
    const count = this.i8(); const damage = this.i16()
    let tag = null
    const t = this.u8()
    if (t !== 0) { this.strN(this.u16()); tag = this.nbt(t) }
    const item = { id, count, damage }
    if (tag) {
      if (tag.display && typeof tag.display.color === 'number') item.color = tag.display.color
      if (Array.isArray(tag.ench) && tag.ench.length) item.glint = true
    }
    return item
  }

  /** Entity metadata -> { index: value }. */
  metadata () {
    const out = {}
    for (;;) {
      const h = this.u8()
      if (h === 0x7f) break
      const idx = h & 0x1f
      switch (h >> 5) {
        case 0: out[idx] = this.i8(); break
        case 1: out[idx] = this.i16(); break
        case 2: out[idx] = this.i32(); break
        case 3: out[idx] = this.f32(); break
        case 4: out[idx] = this.str(); break
        case 5: out[idx] = this.slot(); break
        case 6: out[idx] = [this.i32(), this.i32(), this.i32()]; break
        case 7: out[idx] = [this.f32(), this.f32(), this.f32()]; break
        default: return out
      }
    }
    return out
  }
}

// --- Chat ---
const COLOR_CODES = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff'
}
const NAMED_COLORS = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
  dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f'
}

/** Chat JSON -> coloured pieces [{ text, color, bold }], following § codes too. */
function chatSegments (json) {
  let c
  try { c = JSON.parse(json) } catch { c = String(json) }
  const segs = []
  const push = (text, style) => {
    // Old-style § codes inside the text.
    let st = { ...style }
    const parts = String(text).split(/(§[0-9a-fk-or])/i)
    for (const p of parts) {
      if (!p) continue
      const m = p.match(/^§([0-9a-fk-or])$/i)
      if (m) {
        const k = m[1].toLowerCase()
        if (COLOR_CODES[k]) st = { color: COLOR_CODES[k], bold: false }
        else if (k === 'l') st = { ...st, bold: true }
        else if (k === 'r') st = { color: null, bold: false }
        continue
      }
      const last = segs[segs.length - 1]
      if (last && last.color === st.color && last.bold === st.bold) last.text += p
      else segs.push({ text: p, color: st.color || null, bold: !!st.bold })
    }
  }
  const walk = (n, style) => {
    if (n == null) return
    if (typeof n === 'string' || typeof n === 'number') { push(n, style); return }
    if (Array.isArray(n)) { for (const x of n) walk(x, style); return }
    const st = { ...style }
    if (n.color) st.color = COLOR_CODES[NAMED_COLORS[n.color]] || st.color
    if (n.bold !== undefined) st.bold = !!n.bold
    if (n.text) push(n.text, st)
    else if (n.translate) push(n.translate, st)
    if (Array.isArray(n.extra)) for (const x of n.extra) walk(x, st)
  }
  walk(c, { color: null, bold: false })
  return segs
}
const chatText = (json) => chatSegments(json).map(s => s.text).join('')

// Bed Wars teams are named like "Red8"; their colour is fixed.
const TEAM_COLORS = {
  red: '#ff5555', blue: '#5555ff', green: '#55ff55', yellow: '#ffff55', aqua: '#55ffff', white: '#ffffff', pink: '#ff55ff', gray: '#aaaaaa', grey: '#aaaaaa'
}
function bedwarsTeam (name) {
  const m = String(name || '').match(/^(Red|Blue|Green|Yellow|Aqua|White|Pink|Gr[ae]y)\d*$/i)
  return m ? { label: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), color: TEAM_COLORS[m[1].toLowerCase()] } : null
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

/** Binary search: index of the last entry with time <= t, or -1. */
function lastAt (times, t) {
  let lo = 0; let hi = times.length - 1; let ans = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { ans = m; lo = m + 1 } else hi = m - 1 }
  return ans
}

/** A value that changes over time: [[t, value], ...]. */
class Timeline {
  constructor (initial = null) { this.t = []; this.v = []; this.initial = initial }
  set (t, v) { const n = this.t.length; if (n && this.t[n - 1] === t) this.v[n - 1] = v; else { this.t.push(t); this.v.push(v) } }
  at (t) { const i = lastAt(this.t, t); return i < 0 ? this.initial : this.v[i] }
  /** Time the current value started. */
  since (t) { const i = lastAt(this.t, t); return i < 0 ? -Infinity : this.t[i] }
}

/** Per-entity samples: time, position, rotation (degrees), shown or not. */
class Track {
  constructor (id, kind) {
    this.id = id; this.kind = kind; this.uuid = null
    this.t = []; this.x = []; this.y = []; this.z = []; this.yaw = []; this.head = []; this.pitch = []; this.alive = []
    this.swings = []; this.hurts = []; this.deaths = []; this.crits = []
    this.flags = new Timeline(0) // 0x02 crouch, 0x08 sprint, 0x10 using item (blocking, eating, bow)
    this.health = new Timeline(null)
    this.equip = [new Timeline(null), new Timeline(null), new Timeline(null), new Timeline(null), new Timeline(null)] // hand, boots, legs, chest, helmet
    this.meta = {} // latest metadata (objects and mobs)
    this.cur = { x: 0, y: 0, z: 0, yaw: 0, head: 0, pitch: 0, alive: false }
  }

  sample (t) {
    const c = this.cur; const n = this.t.length
    if (n && this.t[n - 1] === t) {
      this.x[n - 1] = c.x; this.y[n - 1] = c.y; this.z[n - 1] = c.z; this.yaw[n - 1] = c.yaw; this.head[n - 1] = c.head; this.pitch[n - 1] = c.pitch; this.alive[n - 1] = c.alive
      return
    }
    this.t.push(t); this.x.push(c.x); this.y.push(c.y); this.z.push(c.z); this.yaw.push(c.yaw); this.head.push(c.head); this.pitch.push(c.pitch); this.alive.push(c.alive)
  }

  /**
   * After all samples. Players and mobs are replayed tick by tick (20 per
   * second) the way the Minecraft client does it: each position packet is
   * glided to over 3 ticks, the legs swing by the distance moved each tick,
   * and the body turns toward where they walk, never more than 75 degrees
   * away from where they look.
   */
  finish () {
    this.ticked = this.kind === 'player' || (this.kind === 'mob' && this.type !== 'armor_stand')
    if (!this.ticked || !this.t.length) return
    const t0 = this.t[0]
    const n = Math.max(1, Math.floor((this.t[this.t.length - 1] - t0) / 50) + 2)
    this.t0 = t0
    const X = this.tx = new Float32Array(n); const Y = this.ty = new Float32Array(n); const Z = this.tz = new Float32Array(n)
    const BODY = this.tbody = new Float32Array(n); const HEAD = this.thead = new Float32Array(n); const PITCH = this.tpitch = new Float32Array(n)
    const LIMB = this.tlimb = new Float32Array(n); const AMT = this.tamt = new Float32Array(n)
    const ALIVE = this.talive = new Uint8Array(n)
    const wrap = (a) => ((a % 360) + 540) % 360 - 180
    let i = 0; let alive = false; let inc = 0
    let x = 0; let y = 0; let z = 0; let yaw = 0; let pitch = 0; let head = 0; let body = 0
    let gx = 0; let gy = 0; let gz = 0; let gyaw = 0; let gpitch = 0
    let limb = 0; let amt = 0; let sw = 0
    for (let k = 0; k < n; k++) {
      const tk = t0 + k * 50
      let snapped = false
      while (i < this.t.length && this.t[i] <= tk) {
        const nowAlive = this.alive[i]
        if (nowAlive && (!alive || Math.hypot(this.x[i] - x, this.y[i] - y, this.z[i] - z) > 8)) {
          // Spawned (or a long teleport): appear there at once.
          x = gx = this.x[i]; y = gy = this.y[i]; z = gz = this.z[i]
          yaw = gyaw = this.yaw[i]; pitch = gpitch = this.pitch[i]; body = yaw; inc = 0; snapped = true
        } else if (nowAlive) {
          gx = this.x[i]; gy = this.y[i]; gz = this.z[i]; gyaw = this.yaw[i]; gpitch = this.pitch[i]; inc = 3
        }
        head = this.head[i]
        alive = nowAlive
        i++
      }
      const px = x; const pz = z
      if (inc > 0) {
        x += (gx - x) / inc; y += (gy - y) / inc; z += (gz - z) / inc
        yaw += wrap(gyaw - yaw) / inc; pitch += (gpitch - pitch) / inc
        inc--
      }
      const dx = snapped ? 0 : x - px; const dz = snapped ? 0 : z - pz
      // Body: EntityLivingBase.onUpdate + updateDistance.
      let target = body
      if (dx * dx + dz * dz > 0.0025) target = Math.atan2(dz, dx) * 180 / Math.PI - 90
      while (sw < this.swings.length && this.swings[sw] <= tk - 300) sw++
      if (sw < this.swings.length && this.swings[sw] <= tk) target = yaw
      body += wrap(target - body) * 0.3
      let off = wrap(yaw - body)
      if (off < -75) off = -75
      if (off >= 75) off = 75
      body = yaw - off
      if (off * off > 2500) body += off * 0.2
      // Legs: EntityOtherPlayerMP.onUpdate.
      const f = Math.min(1, Math.sqrt(dx * dx + dz * dz) * 4)
      amt += (f - amt) * 0.4
      limb += amt
      X[k] = x; Y[k] = y; Z[k] = z; BODY[k] = body; HEAD[k] = head; PITCH[k] = pitch; LIMB[k] = limb; AMT[k] = amt; ALIVE[k] = alive ? 1 : 0
    }
  }

  indexAt (t) { return lastAt(this.t, t) }

  /** Where the entity is at time t (smoothed between samples), or null. */
  stateAt (t) {
    if (this.ticked) return this.tickStateAt(t)
    const i = this.indexAt(t)
    if (i < 0 || !this.alive[i]) return null
    const j = i + 1
    let f = 0
    if (j < this.t.length && this.alive[j]) {
      const dt = this.t[j] - this.t[i]
      // Long gaps are teleports or pauses - don't glide across them,
      // except for things that fly in a line (arrows, items).
      if (dt > 0 && (dt <= 400 || (this.kind === 'object' && dt <= 2000))) f = (t - this.t[i]) / dt
    }
    const lerp = (a) => a[i] + (a[j] - a[i]) * f
    const angle = (a) => { let v = a[i]; if (f) { const d = ((a[j] - v) % 360 + 540) % 360 - 180; v += d * f } return v }
    return {
      x: f ? lerp(this.x) : this.x[i], y: f ? lerp(this.y) : this.y[i], z: f ? lerp(this.z) : this.z[i],
      yaw: angle(this.yaw), head: angle(this.head), pitch: f ? lerp(this.pitch) : this.pitch[i],
      limb: 0, amount: 0, dying: 0
    }
  }

  tickStateAt (t) {
    const n = this.tx.length
    const p = (t - this.t0) / 50
    if (p < 0) return null
    let k = Math.min(n - 1, Math.floor(p))
    const deathAt = this.deaths.length ? this.deaths[lastAt(this.deaths, t)] : undefined
    const sinceDeath = deathAt !== undefined ? t - deathAt : Infinity
    let dying = sinceDeath >= 0 && sinceDeath < 1000 ? sinceDeath / 1000 : 0
    let f = k < n - 1 && this.talive[k + 1] ? p - k : 0
    if (!this.talive[k]) {
      // Just died: keep the body there for Minecraft's one-second fall-over.
      if (!dying) return null
      let j = k
      while (j >= 0 && !this.talive[j]) j--
      if (j < 0 || this.t0 + j * 50 < deathAt - 250) return null
      k = j; f = 0
    }
    const j = f ? k + 1 : k
    const lerp = (a) => a[k] + (a[j] - a[k]) * f
    const angle = (a) => a[k] + (((a[j] - a[k]) % 360 + 540) % 360 - 180) * f
    if (!dying && sinceDeath < 0) dying = 0
    return { x: lerp(this.tx), y: lerp(this.ty), z: lerp(this.tz), yaw: angle(this.tbody), head: angle(this.thead), pitch: lerp(this.tpitch), limb: lerp(this.tlimb), amount: lerp(this.tamt), dying }
  }

  recent (list, t, ms) { const i = lastAt(list, t); return i >= 0 && t - list[i] < ms }
  lastBefore (list, t) { const i = lastAt(list, t); return i >= 0 ? list[i] : -Infinity }
}

const SECTION = 4096
// 1.8 object types (spawn object packet).
const OBJECTS = { 1: 'boat', 2: 'item', 10: 'minecart', 50: 'tnt', 60: 'arrow', 61: 'snowball', 62: 'egg', 63: 'fireball', 64: 'small_fireball', 65: 'pearl', 66: 'skull', 70: 'falling_block', 71: 'item_frame', 72: 'eye', 73: 'potion', 75: 'xp_bottle', 76: 'firework', 78: 'armor_stand', 90: 'fishing_hook' }
const MOBS = { 30: 'armor_stand', 50: 'creeper', 51: 'skeleton', 52: 'spider', 54: 'zombie', 55: 'slime', 57: 'zombie_pigman', 58: 'enderman', 60: 'silverfish', 61: 'blaze', 63: 'ender_dragon', 65: 'bat', 66: 'witch', 90: 'pig', 91: 'sheep', 92: 'cow', 93: 'chicken', 94: 'squid', 95: 'wolf', 96: 'mooshroom', 97: 'snow_golem', 98: 'ocelot', 99: 'iron_golem', 100: 'horse', 101: 'rabbit', 120: 'villager' }
// 1.8 particle ids -> names.
const PARTICLES = ['explode', 'largeexplode', 'hugeexplosion', 'fireworksSpark', 'bubble', 'splash', 'wake', 'suspended', 'depthsuspend', 'crit', 'magicCrit', 'smoke', 'largesmoke', 'spell', 'instantSpell', 'mobSpell', 'mobSpellAmbient', 'witchMagic', 'dripWater', 'dripLava', 'angryVillager', 'happyVillager', 'townaura', 'note', 'portal', 'enchantmenttable', 'flame', 'lava', 'footstep', 'cloud', 'reddust', 'snowballpoof', 'snowshovel', 'slime', 'heart', 'barrier', 'iconcrack', 'blockcrack', 'blockdust', 'droplet', 'take', 'mobappearance']

// Hypixel death messages start with the player's name and have no "name:".
const DEATH = /^(\S+) (was|fell|slipped|got|died|burned|tried|walked|hit the ground|didn't|withered|blew up|starved|drowned|suffocated|went|froze|stumbled)\b/

/**
 * Build the whole timeline. `onProgress(fraction)` is called now and then.
 */
function buildTimeline (mcpr, onProgress = () => {}) {
  const { meta, rec, packets } = mcpr
  const { n, t: T, id: ID, start: S, end: E } = packets
  const columns = new Map()
  const current = new Map()
  const changes = new ChangeList()
  const tracks = new Map() // players
  const entities = new Map() // everything else
  const names = new Map()
  const skins = new Map()
  const teamOf = new Map()
  const teams = new Map()
  const chat = []
  const markers = []
  const cracks = [] // { t, who, x, y, z, stage } block-breaking progress
  const effects = [] // { t, kind: 'particle'|'break'|'explosion'|'crit', ... }
  const sounds = [] // { t, name, x, y, z, volume, pitch }
  const deaths = [] // { t, name, final }
  const bedsBroken = [] // { t, team }
  let info = {}
  let duration = meta.duration || (n ? T[n - 1] : 0)
  const self = { id: meta.selfId != null ? meta.selfId : null, positions: [] }
  // The newest entity with each id (ids are reused after despawning).
  const live = new Map()

  const newEntity = (eid, kind) => {
    const old = live.get(eid)
    if (old && kind === 'player' && old.kind === 'player') return old // a player respawning keeps their track
    const e = new Track(eid, kind)
    if (kind === 'player') tracks.set(eid, e)
    else entities.set(eid + '@' + entities.size, e)
    live.set(eid, e)
    return e
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
  const getBlock = (x, y, z) => {
    const c = current.get(colKey(x >> 4, z >> 4)); const s = c && y >= 0 && y < 256 && c.sections[y >> 4]
    return s ? s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0
  }

  const loadColumn = (t, cx, cz, full, mask, r) => {
    const key = colKey(cx, cz)
    const cur = current.get(key)
    const blocks = []
    for (let sy = 0; sy < 16; sy++) {
      if (!(mask & (1 << sy))) continue
      const raw = r.bytes(8192)
      const arr = new Uint16Array(SECTION)
      for (let k = 0; k < SECTION; k++) arr[k] = raw[k * 2] | (raw[k * 2 + 1] << 8)
      blocks.push([sy, arr])
    }
    if (!cur) {
      const sections = new Array(16).fill(null)
      for (const [sy, arr] of blocks) sections[sy] = arr
      columns.set(key, { x: cx, z: cz, sections, firstSeen: t })
      current.set(key, { x: cx, z: cz, sections: sections.map(s => s && s.slice()) })
      return
    }
    for (const [sy, arr] of blocks) {
      const old = cur.sections[sy]
      for (let k = 0; k < SECTION; k++) {
        const o = old ? old[k] : 0
        if (o !== arr[k]) setBlock(t, (cx << 4) | (k & 15), (sy << 4) | (k >> 8), (cz << 4) | ((k >> 4) & 15), arr[k])
      }
    }
    if (full) {
      for (let sy = 0; sy < 16; sy++) {
        if (mask & (1 << sy)) continue
        const old = cur.sections[sy]; if (!old) continue
        for (let k = 0; k < SECTION; k++) if (old[k]) setBlock(t, (cx << 4) | (k & 15), (sy << 4) | (k >> 8), (cz << 4) | ((k >> 4) & 15), 0)
      }
    }
  }

  const applyMeta = (e, t, m) => {
    if (m[0] !== undefined) e.flags.set(t, m[0] & 0xff)
    if (e.kind === 'player' && m[6] !== undefined) e.health.set(t, m[6])
    for (const k of Object.keys(m)) e.meta[k] = m[k]
    if (e.kind === 'object' && e.type === 'item' && m[10] !== undefined) e.item = m[10]
    if (m[2] !== undefined) { if (!e.nameTl) e.nameTl = new Timeline(''); e.nameTl.set(t, m[2]); if (m[2]) e.customName = m[2] }
    if (m[3] !== undefined) e.nameVisible = !!m[3]
  }

  const step = Math.max(1, Math.floor(n / 50))
  for (let k = 0; k < n; k++) {
    if (k % step === 0) onProgress(k / n)
    const t = T[k]; const id = ID[k]
    const r = new Reader(rec, S[k], E[k])
    try {
      switch (id) {
        case P.JOIN: { const eid = r.i32(); if (self.id == null) self.id = eid; break }
        case P.POSITION: {
          const x = r.f64(); const y = r.f64(); const z = r.f64(); const yaw = r.f32(); const pitch = r.f32()
          self.positions.push({ t, x, y, z, yaw, pitch })
          break
        }
        case P.CHUNK: {
          const cx = r.i32(); const cz = r.i32(); const full = r.bool(); const mask = r.u16(); r.varint()
          if (full && mask === 0) break // unload: keep it drawn
          loadColumn(t, cx, cz, full, mask, r)
          break
        }
        case P.CHUNK_BULK: {
          const sky = r.bool(); const count = r.varint()
          const metas = []
          for (let q = 0; q < count; q++) metas.push([r.i32(), r.i32(), r.u16()])
          for (const [cx, cz, mask] of metas) {
            const secs = popcount(mask)
            loadColumn(t, cx, cz, true, mask, new Reader(rec, r.pos, E[k]))
            r.pos += secs * 8192 + secs * 2048 + (sky ? secs * 2048 : 0) + 256
          }
          break
        }
        case P.BLOCK: { const [x, y, z] = r.blockPos(); setBlock(t, x, y, z, r.varint()); break }
        case P.MULTI_BLOCK: {
          const cx = r.i32(); const cz = r.i32(); const cnt = r.varint()
          for (let q = 0; q < cnt; q++) { const h = r.u8(); const y = r.u8(); setBlock(t, (cx << 4) + (h >> 4), y, (cz << 4) + (h & 15), r.varint()) }
          break
        }
        case P.EXPLOSION: {
          const x = r.f32(); const y = r.f32(); const z = r.f32(); const radius = r.f32(); const cnt = r.i32()
          const bx = Math.floor(x); const by = Math.floor(y); const bz = Math.floor(z)
          for (let q = 0; q < cnt; q++) setBlock(t, bx + r.i8(), by + r.i8(), bz + r.i8(), 0)
          effects.push({ t, kind: 'explosion', x, y, z, radius })
          sounds.push({ t, name: 'random.explode', x, y, z, volume: 4, pitch: 1 })
          break
        }
        case P.BLOCK_BREAK_ANIM: {
          // Someone mining a block: stage 0-9 cracks, anything else = stopped.
          const who = r.varint(); const [x, y, z] = r.blockPos(); const stage = r.i8()
          cracks.push({ t, who, x, y, z, stage: stage >= 0 && stage <= 9 ? stage : -1 })
          break
        }
        case P.EFFECT: {
          const effect = r.i32(); const [x, y, z] = r.blockPos(); const data = r.i32()
          if (effect === 2001) {
            // A block broken: its pieces fly out (the block is already gone by now, so use the data).
            effects.push({ t, kind: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, block: (data & 0xfff) << 4 | (data >> 12 & 15) })
          }
          break
        }
        case P.PARTICLE: {
          const pid = r.i32(); r.bool()
          const x = r.f32(); const y = r.f32(); const z = r.f32(); const ox = r.f32(); const oy = r.f32(); const oz = r.f32(); const speed = r.f32(); const count = r.i32()
          const data = []
          while (r.pos < r.end) data.push(r.varint())
          effects.push({ t, kind: 'particle', name: PARTICLES[pid] || 'crit', x, y, z, ox, oy, oz, speed, count: Math.min(count, 60), data })
          break
        }
        case P.SOUND: {
          const name = r.str(); const x = r.i32() / 8; const y = r.i32() / 8; const z = r.i32() / 8; const volume = r.f32(); const pitch = r.u8() / 63
          sounds.push({ t, name, x, y, z, volume, pitch })
          break
        }
        case P.SPAWN_PLAYER: {
          const eid = r.varint(); const e = newEntity(eid, 'player')
          e.uuid = r.uuid()
          const x = r.i32() / 32; const y = r.i32() / 32; const z = r.i32() / 32; const yaw = r.i8() * 360 / 256; const pitch = r.i8() * 360 / 256
          const item = r.i16()
          e.cur = { x, y, z, yaw, head: yaw, pitch, alive: true }
          if (item > 0) e.equip[0].set(t, { id: item, count: 1, damage: 0 })
          e.sample(t)
          applyMeta(e, t, r.metadata())
          break
        }
        case P.SPAWN_OBJECT: {
          const eid = r.varint(); const type = r.i8()
          const e = newEntity(eid, 'object')
          e.type = OBJECTS[type] || 'object'
          const x = r.i32() / 32; const y = r.i32() / 32; const z = r.i32() / 32; const pitch = r.i8() * 360 / 256; const yaw = r.i8() * 360 / 256
          const data = r.i32()
          if (data > 0 && r.pos + 6 <= r.end) e.vel = [r.i16() / 8000, r.i16() / 8000, r.i16() / 8000]
          if (e.type === 'falling_block') e.block = ((data & 0xfff) << 4) | ((data >> 12) & 15)
          e.cur = { x, y, z, yaw, head: yaw, pitch, alive: true }
          e.sample(t)
          break
        }
        case P.SPAWN_MOB: {
          const eid = r.varint(); const type = r.u8()
          const e = newEntity(eid, 'mob')
          e.type = MOBS[type] || 'mob'
          const x = r.i32() / 32; const y = r.i32() / 32; const z = r.i32() / 32; const yaw = r.i8() * 360 / 256; const pitch = r.i8() * 360 / 256; const head = r.i8() * 360 / 256
          r.i16(); r.i16(); r.i16()
          e.cur = { x, y, z, yaw, head, pitch, alive: true }
          e.sample(t)
          applyMeta(e, t, r.metadata())
          break
        }
        case P.DESTROY: {
          const cnt = r.varint()
          for (let q = 0; q < cnt; q++) { const e = live.get(r.varint()); if (e && e.cur.alive) { e.cur.alive = false; e.sample(t) } }
          break
        }
        case P.COLLECT: {
          const e = live.get(r.varint()); const by = live.get(r.varint())
          if (e && by) { e.collectedBy = by; e.collectedAt = t }
          break
        }
        case P.REL_MOVE: case P.LOOK_MOVE: case P.LOOK: {
          const e = live.get(r.varint()); if (!e || !e.cur.alive) break
          if (id !== P.LOOK) { e.cur.x += r.i8() / 32; e.cur.y += r.i8() / 32; e.cur.z += r.i8() / 32 }
          if (id !== P.REL_MOVE) { e.cur.yaw = r.i8() * 360 / 256; e.cur.pitch = r.i8() * 360 / 256 }
          e.sample(t)
          break
        }
        case P.TELEPORT: {
          const e = live.get(r.varint()); if (!e || !e.cur.alive) break
          e.cur.x = r.i32() / 32; e.cur.y = r.i32() / 32; e.cur.z = r.i32() / 32; e.cur.yaw = r.i8() * 360 / 256; e.cur.pitch = r.i8() * 360 / 256
          e.sample(t)
          break
        }
        case P.HEAD_LOOK: {
          const e = live.get(r.varint()); if (!e || !e.cur.alive) break
          e.cur.head = r.i8() * 360 / 256; e.sample(t)
          break
        }
        case P.ANIMATION: {
          const e = live.get(r.varint()); const a = r.u8()
          if (!e) break
          if (a === 0) e.swings.push(t)
          else if (a === 1) e.hurts.push(t)
          else if (a === 4 || a === 5) { e.crits.push(t); effects.push({ t, kind: 'crit', magic: a === 5, entity: e }) }
          break
        }
        case P.STATUS: {
          const e = live.get(r.i32()); const s = r.i8()
          if (!e) break
          if (s === 2) e.hurts.push(t)
          if (s === 3) e.deaths.push(t)
          break
        }
        case P.METADATA: {
          const e = live.get(r.varint()); if (!e) break
          applyMeta(e, t, r.metadata())
          break
        }
        case P.EQUIP: {
          const e = live.get(r.varint()); const slot = r.i16(); const item = r.slot()
          if (e && slot >= 0 && slot < 5) e.equip[slot].set(t, item)
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
          if (mode === 0 || mode === 2) {
            r.str(); const prefix = r.str(); r.str(); r.i8(); r.str(); r.i8()
            teams.set(name, { name, prefix, color: prefixColor(prefix) })
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
          const segs = chatSegments(json)
          const text = segs.map(s => s.text).join('')
          if (/^\{"server"/.test(text)) { try { info = { ...info, ...JSON.parse(text) } } catch { /* not locraw */ } break }
          if (!text.trim()) break
          // Private and party/guild chat stays out: replays are shared with
          // the roster, and these were never part of the game.
          if (PRIVATE_CHAT.test(text)) break
          chat.push({ t, text, segs })
          const final = /FINAL KILL!/.test(text)
          if (final) markers.push({ t, kind: 'final', text: text.trim() })
          else if (/^\s*BED DESTRUCTION >/.test(text)) {
            markers.push({ t, kind: 'bed', text: text.replace(/^\s*BED DESTRUCTION >\s*/, '').trim() })
            const m = text.match(/>\s*(\w+) Bed/)
            if (m) bedsBroken.push({ t, team: m[1] })
          } else if (/^\s*(VICTORY|GAME OVER)/i.test(text)) markers.push({ t, kind: 'end', text: text.trim() })
          const d = text.trim().match(DEATH)
          if (d && !/:/.test(text.split(' ')[0])) deaths.push({ t, name: d[1], final })
          const dc = text.trim().match(/^(\S+) disconnected\.?$/)
          if (dc) deaths.push({ t, name: dc[1], disconnected: true })
          break
        }
      }
    } catch (err) {
      // One odd packet shouldn't stop the whole replay.
    }
  }
  onProgress(1)
  if (n && T[n - 1] > duration) duration = T[n - 1]

  // Bed colour from the "Your Bed" message: the team of the recording player.
  // Hypixel's NPCs are player entities with version-2 UUIDs; nicked players
  // have version 1, real accounts version 4.
  for (const [eid, tr] of tracks) {
    if (!tr.uuid || !tr.t.length || tr.uuid[12] === '2') { tracks.delete(eid); continue }
    tr.name = names.get(tr.uuid) || null
    tr.nicked = tr.uuid[12] === '1'
    tr.team = bedwarsTeam(teamOf.get(tr.name))
    tr.self = eid === self.id
    tr.finish()
  }
  const selfTrack = [...tracks.values()].find(tr => tr.self)
  for (const b of bedsBroken) if (b.team === 'Your' && selfTrack && selfTrack.team) b.team = selfTrack.team.label
  if (selfTrack) selfCracks(selfTrack, changes, cracks)
  // Chat deaths per player: after one, Hypixel turns them into an invisible
  // spectator (respawning, or for good after a final kill).
  for (const tr of tracks.values()) {
    tr.chatDeaths = deaths.filter(d => d.name === tr.name && !d.disconnected)
  }
  for (const e of entities.values()) if (e.kind === 'mob') e.finish()
  // Objects keep their raw samples.

  return { meta, info, duration, columns, changes, tracks, entities, names, skins, teamOf, teams, chat, markers, effects, cracks, sounds, deaths, bedsBroken, self, getBlock }
}

/**
 * The server never tells you your own break progress, so rebuild it: a block
 * within reach turning to air at the end of a run of your arm swings (they
 * come every tick while you dig) was mined by you, and the cracks grow
 * evenly over that run.
 */
function selfCracks (tr, ch, cracks) {
  const sw = tr.swings
  if (!sw.length) return
  let prevT = -Infinity // you mine one block at a time
  for (let i = 0; i < ch.n; i++) {
    if (!(ch.from[i] >> 4) || ch.to[i] >> 4) continue
    const T = ch.t[i]
    let k = lastAt(sw, T + 100)
    if (k < 0 || sw[k] < T - 200) continue
    const st = tr.stateAt(T); if (!st) continue
    const x = ch.x[i]; const y = ch.y[i]; const z = ch.z[i]
    if (Math.hypot(st.x - x - 0.5, st.y + 1.62 - y - 0.5, st.z - z - 0.5) > 6) continue
    let j = k
    while (j > 0 && sw[j] - sw[j - 1] < 350 && T - sw[j - 1] < 6000) j--
    const start = Math.max(sw[j], prevT); const d = T - start
    if (d < 150) { prevT = Math.max(prevT, T); continue } // broken at once (wool with shears, fire...)
    prevT = T
    for (let s = 0; s < 10; s++) cracks.push({ t: Math.round(start + d * s / 10), who: tr.id, x, y, z, stage: s })
    cracks.push({ t: T, who: tr.id, x, y, z, stage: -1 })
  }
  cracks.sort((a, b) => a.t - b.t)
}

function popcount (m) { let c = 0; while (m) { c += m & 1; m >>>= 1 } return c }

module.exports = { Timeline, readMcpr, buildTimeline, chatText, chatSegments, prefixColor, bedwarsTeam, Reader, Track, colKey, lastAt }
