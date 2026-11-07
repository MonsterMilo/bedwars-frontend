// Potion effects of each player over the game, for the timers over their
// heads. Hypixel sends some effects of other players (Invisibility,
// Absorption, Slowness, Weakness...) but not all; the rest are worked out
// from what every client sees: a player finishing a golden apple or a Bed
// Wars potion (the "using item" flag held for the eating time while holding
// it). Death clears everything, as in Minecraft.
const NAMES = { 1: 'Speed', 2: 'Slowness', 3: 'Haste', 4: 'Fatigue', 5: 'Strength', 8: 'Jump Boost', 10: 'Regen', 11: 'Resistance', 12: 'Fire Res', 14: 'Invisibility', 15: 'Blindness', 18: 'Weakness', 19: 'Poison', 22: 'Absorption' }
// Minecraft's potion colours (Potion.liquidColor), a little lighter to read on a dark plate.
const COLORS = { 1: '#7cafc6', 2: '#8a97ab', 3: '#e3d24b', 4: '#7a7a5a', 5: '#d84a3c', 8: '#4ec75a', 10: '#e07ad0', 11: '#b45ad0', 12: '#f0a050', 14: '#a3abc9', 15: '#7a7a7a', 18: '#7a8190', 19: '#6aa040', 22: '#f2c94c' }
const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI']
const EAT_MS = 32 * 50
const SKIP = new Set([16]) // night vision: Hypixel's mark for spectators

/** Uses of the held item long enough to finish it: [{ t (finished), item }]. */
function finishedUses (track) {
  const out = []
  const f = track.flags
  for (let i = 0; i < f.t.length; i++) {
    if (!(f.v[i] & 0x10)) continue
    if (i > 0 && (f.v[i - 1] & 0x10)) continue
    const from = f.t[i]
    let to = Infinity
    for (let j = i + 1; j < f.t.length; j++) if (!(f.v[j] & 0x10)) { to = f.t[j]; break }
    if (to - from < EAT_MS - 250) continue
    const item = track.equip[0].at(from + 100)
    if (item) out.push({ t: from + EAT_MS, item })
  }
  return out
}

/** Every effect of one player as intervals: [{ id, amp, from, to, guessed }]. */
function effectIntervals (track) {
  const list = []
  const open = new Map()
  const close = (id, t) => { const e = open.get(id); if (e) { e.to = Math.min(e.to, t); open.delete(id) } }
  const add = (id, amp, from, ms, guessed) => {
    close(id, from)
    const e = { id, amp, from, to: from + ms, guessed }
    list.push(e); open.set(id, e)
  }
  const events = []
  for (const e of track.effectsIn) events.push({ t: e.t, server: e })
  for (const u of finishedUses(track)) events.push({ t: u.t, use: u })
  for (const d of track.deaths) events.push({ t: d, death: true })
  for (const d of track.chatDeaths || []) events.push({ t: d.t, death: true })
  events.sort((a, b) => a.t - b.t)
  for (const ev of events) {
    if (ev.death) { for (const id of [...open.keys()]) close(id, ev.t); continue }
    if (ev.server) {
      const e = ev.server
      if (SKIP.has(e.id) || e.amp === 127 || e.ms > 60 * 60 * 1000) continue
      if (e.remove) close(e.id, e.t); else add(e.id, e.amp, e.t, e.ms, false)
      continue
    }
    const { item, t } = ev.use
    const has = (id) => { const e = open.get(id); return e && e.to > t && !e.guessed && t - e.from < 1500 }
    if (item.id === 322) {
      // Golden apple (1.8): Absorption I for 2 minutes, Regeneration II for 5 s.
      if (!has(22)) add(22, 0, t, 120000, true)
      add(10, 1, t, 5000, true)
    } else if (item.id === 373) {
      // Bed Wars potions: Speed II and Jump Boost V for 45 s, Invisibility 30 s.
      const kind = item.damage & 15
      if (kind === 2 || kind === 3) { if (!has(1)) add(1, 1, t, 45000, true) } else if (kind === 11) { if (!has(8)) add(8, 4, t, 45000, true) } else if (kind === 14) { if (!has(14)) add(14, 0, t, 30000, true) }
    }
  }
  return list
}

/** Effects active at t, longest left first: [{ id, name, color, left }]. */
function effectsAt (intervals, t) {
  const out = []
  for (const e of intervals) {
    if (e.from > t || e.to <= t || !NAMES[e.id]) continue
    out.push({ id: e.id, name: NAMES[e.id] + (ROMAN[e.amp + 1] || ''), color: COLORS[e.id] || '#ffffff', left: e.to - t })
  }
  return out.sort((a, b) => b.left - a.left)
}

function clock (ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

module.exports = { effectIntervals, effectsAt, clock, NAMES }
