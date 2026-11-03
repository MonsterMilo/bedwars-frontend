// Game sounds for everyone in the replay, not just the recording player.
// The server only sent sounds near the player who recorded, so instead we
// rebuild them from what happened, the way the game would have played
// them: blocks placed and broken, footsteps, hits, deaths, bow shots,
// fireballs, TNT, explosions and item pickups. The recorded versions of
// these are dropped so nothing plays twice; other recorded sounds stay.

// Block id -> 1.8 sound type.
const TYPES = {}
const set = (type, ids) => { for (const id of ids) TYPES[id] = type }
set('cloth', [35, 171, 81, 92])
set('glass', [20, 95, 102, 160, 89, 79, 174])
set('wood', [5, 17, 162, 47, 54, 58, 64, 193, 194, 195, 196, 197, 85, 188, 189, 190, 191, 192, 107, 183, 184, 185, 186, 187, 53, 134, 135, 136, 163, 164, 125, 126, 96, 26, 25, 84, 146, 72, 143, 63, 68])
set('ladder', [65])
set('grass', [2, 18, 161, 31, 32, 37, 38, 106, 46, 19, 170, 6, 175, 39, 40, 83, 111, 110])
set('gravel', [3, 13, 60, 82])
set('sand', [12, 88])
set('snow', [78, 80])
set('metal', [42, 41, 57, 133, 152, 101, 167, 154, 145])
const LIQUID = new Set([8, 9, 10, 11])
// Food (eaten) and drinks, by item id.
const FOOD = new Set([260, 282, 297, 319, 320, 322, 349, 350, 357, 360, 363, 364, 365, 366, 367, 375, 391, 392, 393, 394, 396, 400, 411, 412, 413, 423, 424])
const NOT_GROUND = new Set([0, 8, 9, 10, 11, 31, 32, 37, 38, 6, 39, 40, 50, 51, 59, 83, 106, 175, 30, 55, 66, 27, 28, 157, 69, 77, 143, 63, 68, 171, 90, 119])

function soundType (state) {
  const t = TYPES[state >> 4] || 'stone'
  if (t === 'glass') return { brk: 'dig.glass', place: 'step.stone', step: 'step.stone', vol: 1, pitch: 1 }
  if (t === 'ladder') return { brk: 'dig.wood', place: 'dig.wood', step: 'step.ladder', vol: 1, pitch: 1 }
  if (t === 'metal') return { brk: 'dig.stone', place: 'dig.stone', step: 'step.stone', vol: 1, pitch: 1.5 }
  return { brk: 'dig.' + t, place: 'dig.' + t, step: 'step.' + t, vol: 1, pitch: 1 }
}

const REPLACED = /^(dig\.|step\.|game\.player\.(hurt|die|swim\.splash)|random\.(bow|explode|pop|eat|drink|burp)$|mob\.ghast\.fireball$|game\.tnt\.primed$|mob\.endermen\.portal$)/
// Sounds Hypixel plays only to the recording player (countdown ticks,
// purchases, level-ups, game announcements). Played loud at their spot,
// they'd be heard across the map, so they're left out.
const POV_ONLY = /^(note\.|random\.(orb|levelup|click|successful_hit)$|mob\.(enderdragon|wither|villager|cat)\.)/

/** How far a player had just fallen when hurt at time t (0 if not falling). */
function fallBefore (tr, t) {
  // Movement here glides 3 ticks behind the server, so look just after t.
  const k = Math.min(tr.ty.length - 1, Math.max(1, Math.round((t - tr.t0) / 50) + 3))
  // Still dropping then: hit in mid-air, not a landing.
  if (tr.ty[k] < tr.ty[k - 1] - 0.05) return 0
  // Find where they landed (within the last half second), then climb back
  // up the fall to its top.
  let land = k
  for (let j = k; j > k - 10 && j > 0; j--) if (tr.ty[j] < tr.ty[land]) land = j
  let top = land
  while (top > 0 && tr.talive[top - 1] && tr.ty[top - 1] >= tr.ty[top] - 0.01 && land - top < 100) top--
  return tr.ty[top] - tr.ty[land]
}

function synthesize (tl) {
  let seed = 12345
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 }
  const out = tl.sounds.filter(s => s.name && !REPLACED.test(s.name) && !POV_ONLY.test(s.name))
  const add = (t, name, x, y, z, volume, pitch) => out.push({ t, name, x, y, z, volume, pitch })
  const ch = tl.changes
  const uses = [] // eating and drinking: { tr, start, end, kind, item }

  // Blocks placed and broken. Many changes in the same moment are the map
  // loading, cages opening or an explosion: no per-block sounds for those.
  const byTime = new Map()
  for (let i = 0; i < ch.n; i++) byTime.set(ch.t[i], (byTime.get(ch.t[i]) || 0) + 1)
  const history = new Map() // block position -> change indexes, for footsteps
  for (let i = 0; i < ch.n; i++) {
    const key = ch.x[i] + ',' + ch.y[i] + ',' + ch.z[i]
    let h = history.get(key)
    if (!h) history.set(key, h = [])
    h.push(i)
    if (byTime.get(ch.t[i]) > 6) continue
    const from = ch.from[i]; const to = ch.to[i]
    const x = ch.x[i] + 0.5; const y = ch.y[i] + 0.5; const z = ch.z[i] + 0.5
    // Water and lava spreading or drying up make no block sounds (1.8
    // buckets are silent too).
    if (LIQUID.has(to >> 4) || LIQUID.has(from >> 4)) continue
    if (to >> 4 && !(from >> 4)) {
      const st = soundType(to); add(ch.t[i], st.place, x, y, z, (st.vol + 1) / 2, st.pitch * 0.8)
    } else if (from >> 4 && !(to >> 4)) {
      const st = soundType(from); add(ch.t[i], st.brk, x, y, z, (st.vol + 1) / 2, st.pitch * 0.8)
    }
  }
  const blockAt = (t, x, y, z) => {
    const h = history.get(x + ',' + y + ',' + z)
    if (!h) return tl.getBlock(x, y, z)
    let v = ch.from[h[0]]
    for (const i of h) { if (ch.t[i] <= t) v = ch.to[i]; else break }
    return v
  }

  for (const tr of tl.tracks.values()) {
    // Hits and deaths.
    for (const t of tr.hurts) {
      const s = tr.stateAt(t); if (!s) continue
      add(t, 'game.player.hurt', s.x, s.y + 1, s.z, 1, (rnd() - rnd()) * 0.2 + 1)
      // Fall damage (EntityLivingBase.fall): a thud, small or big, and the
      // block landed on, quieter and lower.
      const fall = tr.tx ? fallBefore(tr, t) : 0
      const dmg = Math.ceil(fall - 3)
      if (dmg > 0) {
        add(t, dmg > 4 ? 'game.player.hurt.fall.big' : 'game.player.hurt.fall.small', s.x, s.y, s.z, 1, 1)
        const below = blockAt(t, Math.floor(s.x), Math.floor(s.y - 0.2), Math.floor(s.z))
        if (below >> 4) { const st = soundType(below); add(t, st.step, s.x, s.y, s.z, st.vol * 0.5, st.pitch * 0.75) }
      }
    }
    for (const t of tr.deaths) {
      const s = tr.stateAt(t); if (s) add(t, 'game.player.die', s.x, s.y + 1, s.z, 1, (rnd() - rnd()) * 0.2 + 1)
    }
    // Eating and drinking (EntityPlayer.updateItemUse): while the item is
    // in use, a bite or gulp every 4 ticks once 25 of its 32 ticks are
    // left, and a burp when food is finished. Hypixel hides what invisible
    // players hold, so a 1.6 s use with an empty hand is a potion.
    const fl = tr.flags
    for (let i = 0; i < fl.t.length; i++) {
      if (!(fl.v[i] & 0x10) || (i > 0 && fl.v[i - 1] & 0x10)) continue
      const start = fl.t[i]
      let j = i + 1
      while (j < fl.t.length && fl.v[j] & 0x10) j++
      const end = j < fl.t.length ? fl.t[j] : start + 1600
      const held = tr.equip[0].at(start + 1)
      const len = end - start
      let kind = null
      if (held && FOOD.has(held.id)) kind = 'eat'
      else if (held && (held.id === 335 || (held.id === 373 && !(held.damage & 16384)))) kind = 'drink'
      else if (!held && len > 1500 && len < 1750) kind = 'drink'
      if (!kind) continue
      uses.push({ tr, start, end, kind, item: held })
      for (let k = 8; k <= 32 && k * 50 <= len + 25; k += 4) {
        const t = start + k * 50
        const st = tr.stateAt(t); if (!st) break
        if (kind === 'eat') add(t, 'random.eat', st.x, st.y + 1.5, st.z, 0.5 + 0.5 * Math.floor(rnd() * 2), (rnd() - rnd()) * 0.2 + 1)
        else add(t, 'random.drink', st.x, st.y + 1.5, st.z, 0.5, rnd() * 0.1 + 0.9)
      }
      if (kind === 'eat' && len >= 1550) {
        const st = tr.stateAt(end); if (st) add(end, 'random.burp', st.x, st.y + 1.5, st.z, 0.5, rnd() * 0.1 + 0.9)
      }
    }
    // Footsteps: Entity.moveEntity plays one each time the distance walked
    // (x 0.6) passes the next whole number, on the block underfoot.
    if (!tr.tx) continue
    let walked = 0; let next = 1
    for (let k = 1; k < tr.tx.length; k++) {
      if (!tr.talive[k] || !tr.talive[k - 1]) continue
      const dx = tr.tx[k] - tr.tx[k - 1]; const dz = tr.tz[k] - tr.tz[k - 1]; const dy = tr.ty[k] - tr.ty[k - 1]
      // Falling or walking into water: a splash (Entity.handleWaterMovement).
      {
        const t = tr.t0 + k * 50
        const inNow = LIQUID.has(blockAt(t, Math.floor(tr.tx[k]), Math.floor(tr.ty[k] + 0.1), Math.floor(tr.tz[k])) >> 4)
        const inBefore = LIQUID.has(blockAt(t - 50, Math.floor(tr.tx[k - 1]), Math.floor(tr.ty[k - 1] + 0.1), Math.floor(tr.tz[k - 1])) >> 4)
        if (inNow && !inBefore) {
          const v = Math.min(1, Math.sqrt(dx * dx * 0.2 + dy * dy + dz * dz * 0.2) * 0.2)
          if (v > 0.02) add(t, 'game.player.swim.splash', tr.tx[k], tr.ty[k], tr.tz[k], v, 1 + (rnd() - rnd()) * 0.4)
        }
      }
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > 2) { walked = 0; next = 1; continue }
      walked += d * 0.6
      if (walked <= next || Math.abs(dy) > 0.05) continue
      next = Math.floor(walked) + 1
      const t = tr.t0 + k * 50
      const bx = Math.floor(tr.tx[k]); const by = Math.floor(tr.ty[k] - 0.2); const bz = Math.floor(tr.tz[k])
      const below = blockAt(t, bx, by, bz)
      if (NOT_GROUND.has(below >> 4)) continue
      const st = soundType(below)
      add(t, st.step, tr.tx[k], tr.ty[k], tr.tz[k], st.vol * 0.15, st.pitch)
    }
  }

  for (const e of tl.entities.values()) {
    if (!e.t || !e.t.length) continue
    const x = e.x[0]; const y = e.y[0]; const z = e.z[0]; const t = e.t[0]
    if (e.type === 'arrow') add(t, 'random.bow', x, y, z, 1, 1 / (rnd() * 0.4 + 1.2) + 0.5)
    else if (e.type === 'fireball' || e.type === 'small_fireball') add(t, 'mob.ghast.fireball', x, y, z, 1, (rnd() - rnd()) * 0.2 + 1)
    else if (e.type === 'tnt') add(t, 'game.tnt.primed', x, y, z, 1, 1)
    else if (e.type === 'pearl') {
      // Where the pearl lands, the thrower teleports there.
      let k = e.t.length - 1
      while (k > 0 && !e.alive[k]) k--
      const end = e.alive[e.t.length - 1] ? null : e.t[e.t.length - 1]
      if (end != null) add(end, 'mob.endermen.portal', e.x[k], e.y[k], e.z[k], 1, 1)
    }
    if (e.type === 'item' && e.collectedAt != null) {
      const s = e.stateAt(e.collectedAt - 1) || { x, y, z }
      add(e.collectedAt, 'random.pop', s.x, s.y, s.z, 0.2, ((rnd() - rnd()) * 0.7 + 1) * 2)
    }
  }
  for (const f of tl.effects) {
    if (f.kind === 'explosion') add(f.t, 'random.explode', f.x, f.y, f.z, 4, (1 + (rnd() - rnd()) * 0.2) * 0.7)
  }
  out.sort((a, b) => a.t - b.t)
  // Shared with the particles (sprint dust, eating crumbs).
  tl.blockAt = blockAt
  tl.uses = uses
  return out
}

module.exports = { synthesize }
