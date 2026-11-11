// Prism Atlas: every Bed Wars map from Milo's games, to fly around in 3D.
// atlas.html holds the page; this file runs both of its views:
//   - the list (atlas.html): the maps in the Atlas, drawn from above, and
//     the maps in Hypixel's rotation that aren't in it yet
//   - one map (atlas.html?map=<slug>): the map in 3D, with a free camera
//     and a map (orbit) camera
// Maps are built by the backend from the pre-game moments of saved replays
// (see atlas-core.js in bedwars-backend). A local .mcpr can be opened too:
// it's read the same way here, in the browser.
global.THREE = require('three')
const THREE = global.THREE
const { gunzipSync } = require('fflate')
const { BlockRenderer } = require('./renderer')
const { Mesher } = require('./mesher')
const { ReplayCamera } = require('./camera')
const { decodeMap, mapFromReplay } = require('./atlas-map')

const BACKEND = 'https://bedwars-backend.onrender.com'
const KEY_STORAGE = 'bedwarsAdminKey'
const ROTATION_LIVE = 'https://jaayminecraft.github.io/bedwars/data/'
const $ = (id) => document.getElementById(id)
const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || '' } catch { return '' } }
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
const tick = () => new Promise(r => setTimeout(r, 0))

const MODES = {
  BEDWARS_EIGHT_ONE: 'Solo', BEDWARS_EIGHT_TWO: 'Doubles', BEDWARS_FOUR_THREE: '3v3v3v3', BEDWARS_FOUR_FOUR: '4v4v4v4', BEDWARS_TWO_FOUR: '4v4'
}
const modeName = (m) => MODES[m] || String(m || '').replace(/^BEDWARS_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

function setStatus (text, { error = false, progress = null } = {}) {
  const box = $('atLoading')
  if (!box) return
  box.hidden = !text
  $('atLoadingText').textContent = text || ''
  box.classList.toggle('is-error', error)
  const bar = $('atLoadingBar')
  bar.hidden = progress == null
  if (progress != null) bar.style.setProperty('--p', Math.round(progress * 100) + '%')
}

async function api (path, opts = {}) {
  const key = getKey()
  if (!key) { const e = new Error('no key'); e.noKey = true; throw e }
  const res = await fetch(BACKEND + path, { ...opts, headers: { 'x-admin-key': key } })
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error
    const e = new Error(msg || `The server answered ${res.status}`)
    e.status = res.status
    throw e
  }
  return res
}

// --- Block colours (for the drawings from above) ---
let blockData = null
async function loadBlockData () {
  if (blockData) return blockData
  const res = await fetch('replay/blocks.json')
  if (!res.ok) throw new Error('Couldn\'t load the block data')
  const data = await res.json()
  const mesher = new Mesher(data)
  const texName = new Map(Object.entries(data.textures).map(([k, v]) => [v, k]))
  const cache = new Map()
  const colorOf = (state) => {
    let c = cache.get(state)
    if (c) return c
    c = null
    try {
      const b = mesher.blockInfo(state)
      const quads = b.air ? [] : mesher.modelQuads(b.name, b.props)
      const q = quads.find(q => q.dir === 'up') || quads[0]
      const avg = q && data.avgColors[texName.get(q.tex)]
      if (avg) {
        const tint = q.tint ? mesher.tintFor(b.name) : [255, 255, 255]
        c = avg.slice(0, 3).map((v, k) => v * tint[k] / 255)
      }
    } catch { /* unknown block */ }
    if (!c) c = [150, 150, 150]
    cache.set(state, c)
    return c
  }
  blockData = { data, mesher, colorOf }
  return blockData
}

/** Draws a preview (top block per column, from the backend) into a canvas. */
function drawPreview (canvas, raw, colorOf) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const w = dv.getUint16(0); const h = dv.getUint16(2)
  const states = 13; const heights = 13 + w * h * 2
  // Trim to where there's something.
  let x0 = w; let x1 = -1; let z0 = h; let z1 = -1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (raw[states + (j * w + i) * 2] | raw[states + (j * w + i) * 2 + 1]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < z0) z0 = j; if (j > z1) z1 = j }
  if (x1 < 0) return
  const pad = 2
  x0 = Math.max(0, x0 - pad); z0 = Math.max(0, z0 - pad); x1 = Math.min(w - 1, x1 + pad); z1 = Math.min(h - 1, z1 + pad)
  const size = Math.max(x1 - x0 + 1, z1 - z0 + 1)
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const ox = Math.floor((size - (x1 - x0 + 1)) / 2); const oz = Math.floor((size - (z1 - z0 + 1)) / 2)
  for (let j = z0; j <= z1; j++) {
    for (let i = x0; i <= x1; i++) {
      const k = j * w + i
      const st = raw[states + k * 2] | (raw[states + k * 2 + 1] << 8)
      if (!st) continue
      const y = raw[heights + k]
      // Lit from the north-west, like a relief map.
      const yN = j > 0 ? raw[heights + k - w] : y; const yW = i > 0 ? raw[heights + k - 1] : y
      const slope = Math.max(-3, Math.min(3, (y - yN) + (y - yW)))
      const light = Math.max(0.55, Math.min(1.25, 0.82 + (y - 64) / 120 + slope * 0.06))
      const c = colorOf(st)
      const o = ((j - z0 + oz) * size + (i - x0 + ox)) * 4
      img.data[o] = Math.min(255, c[0] * light); img.data[o + 1] = Math.min(255, c[1] * light); img.data[o + 2] = Math.min(255, c[2] * light); img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

// --- Hypixel's rotation (a player-kept list; a saved copy if it can't be reached) ---
// The list isn't always kept up to date. What Milo has seen in game since its
// last update wins; each fix stops counting once the list is newer than it.
const ROTATION_FIXES = [
  // Not in the in-game map selector on 2026-11-04 (Milo); the list still had it in from 2026-10-05.
  { name: 'Ghoulish', in: false, seen: '2026-11-04' }
]
function withFixes (rot) {
  const asOf = Date.parse(rot.asOf || '') || 0
  for (const f of ROTATION_FIXES) {
    if (Date.parse(f.seen) <= asOf) continue
    const m = rot.maps.find(x => x.name.toLowerCase() === f.name.toLowerCase())
    if (m) m.in = f.in
  }
  return rot
}
// Hypixel's own map selector, as the proxy last saw it (one list per team
// size): newer than the player-kept list, it decides what's in rotation.
async function fromSelector () {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const t = ctl && setTimeout(() => ctl.abort(), 20000) // a sleeping server: go on without it
  try {
    const r = await fetch(BACKEND + '/maps/rotation', ctl ? { signal: ctl.signal } : {})
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j.rotation) ? j.rotation : []
  } catch { return [] } finally { if (t) clearTimeout(t) }
}
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function withSelector (rot, lists) {
  const asOf = Date.parse(rot.asOf || '') || 0
  for (const l of lists) {
    if (!Array.isArray(l.maps) || !l.maps.length || !(Date.parse(l.at) > asOf)) continue
    const listed = new Map(l.maps.map(n => [nameKey(n), n]))
    for (const m of rot.maps) {
      if (m.teams !== l.teams) continue
      m.in = listed.has(nameKey(m.name))
      listed.delete(nameKey(m.name))
    }
    // In the selector but not in the player-kept list yet: a new map.
    for (const n of listed.values()) rot.maps.push({ name: n, teams: l.teams, in: true })
  }
  return rot
}
async function loadRotation () {
  const [list, lists] = await Promise.all([loadRotationList(), fromSelector()])
  return withSelector(withFixes(list), lists)
}
async function loadRotationList () {
  const fromLive = async () => {
    const [core, seasonal] = await Promise.all(['maps.json', 'seasonal_maps.json'].map(f => fetch(ROTATION_LIVE + f).then(r => { if (!r.ok) throw new Error(); return r.json() })))
    const row = (m, isSeasonal) => {
      const mm = /^(.*?)\s*\((.*)\)$/.exec(m.name)
      const r = { name: mm ? mm[1] : m.name, teams: /^Solos/.test(m.mode) ? 8 : 4, in: m.status === 'in' }
      if (mm) r.aka = mm[2]
      if (isSeasonal) r.season = m.season || 'Event'
      return r
    }
    if (!Array.isArray(core.maps) || !Array.isArray(seasonal)) throw new Error('changed format')
    return { asOf: core.meta && core.meta.latest_rotation, live: true, maps: [...core.maps.map(m => row(m, false)), ...seasonal.map(m => row(m, true))] }
  }
  try { return await fromLive() } catch {
    const saved = await fetch('atlas/rotation.json').then(r => r.json())
    return { ...saved, live: false }
  }
}

// --- The list (laid out like the Cosmetics Library) ---
// Only what each map is: no games counted, no dates (Milo 2026-11-04).
const CATS = [
  { id: 'all', name: 'All maps', icon: '<rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="11" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
  { id: 'eight', name: 'Solo & Doubles', icon: '<circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.7 4.7l2.1 2.1M13.2 13.2l2.1 2.1M15.3 4.7l-2.1 2.1M6.8 13.2l-2.1 2.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  { id: 'four', name: '3s & 4s', icon: '<circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  { id: 'event', name: 'Event maps', icon: '<path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' },
  { id: 'other', name: 'Other maps', icon: '<path d="M1.5 5v12.5l5.5-3 6 3 5.5-3V2l-5.5 3-6-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 2v12.5M13 5v12.5" stroke="currentColor" stroke-width="1.5"/>' }
]
// The buttons above the grid (Milo 2026-11-11): All, In rotation, Out of rotation, Still needed.
const HAVES = { all: 'All maps', rot: 'In rotation', out: 'Out of rotation', need: 'Still needed' }
const MAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/></svg>'

function catOfEntry (e) {
  if (e.r && e.r.season) return 'event'
  if (e.r) return e.r.teams === 8 ? 'eight' : 'four'
  return 'other'
}
// Which of the four buttons above the grid it belongs to (besides "All").
function haveOfEntry (e) {
  if (e.map) return 'have'
  return e.r && e.r.in ? 'need' : 'out'
}

async function showList () {
  document.body.dataset.view = 'list'
  const rotationP = loadRotation().catch(() => ({ maps: [] }))
  let maps = []; let previews = {}
  let note = ''
  try {
    const list = await (await api('/maps')).json()
    maps = list.maps
    // The server lets the browser keep previews for 5 minutes: asking with
    // the list's state in the address means a map added since gets its
    // picture straight away (2026-11-04: new maps showed blank).
    const v = maps.map(m => m.slug + ':' + (m.builtAt || '')).join('|')
    let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0
    previews = (await (await api('/maps/previews?v=' + (h >>> 0).toString(36))).json()).previews || {}
  } catch (err) {
    note = err.noKey
      ? 'The Atlas needs your tracker key. Open the tracker, enter your key there, then come back here. You can still open a replay file with the button above.'
      : 'Couldn\'t load your maps: ' + err.message
  }
  const rotation = await rotationP
  const rot = new Map()
  for (const r of rotation.maps || []) { rot.set(norm(r.name), r); if (r.aka && !rot.has(norm(r.aka))) rot.set(norm(r.aka), { ...r, via: r.name }) }
  const known = !note

  // One entry per map: the Atlas's maps, then the rest of the rotation list.
  const entries = []
  const have = new Set()
  for (const m of maps) {
    const r = rot.get(norm(m.name)) || null
    have.add(norm(m.name)); if (r) have.add(norm(r.via || r.name))
    entries.push({ name: m.name, map: m, r })
  }
  for (const r of rotation.maps || []) if (!have.has(norm(r.name))) entries.push({ name: r.name, map: null, r })
  for (const e of entries) { e.cat = catOfEntry(e); e.have = haveOfEntry(e); e.key = norm(e.name + ' ' + (e.r && e.r.aka || '')) }

  const need = entries.filter(e => e.have === 'need').length
  $('tally').innerHTML = known
    ? `<b>${maps.length}</b> maps in the Atlas` + (need ? `, <b>${need}</b> in rotation still needed` : ', every map in rotation')
    : ''
  $('atNote').hidden = !note
  $('atNote').textContent = note

  const bd = maps.length ? await loadBlockData().catch(() => null) : null
  const state = { cat: 'all', have: 'all', q: '' }
  // Without the key only the rotation list is known: which maps are still needed isn't.
  if (!known) for (const b of document.querySelectorAll('#haveSeg button')) b.hidden = b.dataset.h === 'need'

  const inRotation = (e) => !!(e.r && e.r.in)
  const inHave = (e) => state.have === 'all' ? true
    : state.have === 'rot' ? inRotation(e)
      : state.have === 'out' ? !inRotation(e)
        : e.have === 'need'
  const rail = $('rail')
  for (const c of CATS) {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'cat'; b.dataset.cat = c.id
    b.innerHTML = `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true">${c.icon}</svg><span>${c.name}</span><span class="n"></span>`
    b.onclick = () => { state.cat = c.id; render() }
    rail.appendChild(b)
  }
  for (const b of document.querySelectorAll('#haveSeg button')) b.onclick = () => { state.have = b.dataset.h; render() }
  const q = $('q')
  q.addEventListener('input', () => { state.q = norm(q.value); render() })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) { e.preventDefault(); q.focus() }
  })

  function card (e, i) {
    const a = document.createElement(e.map ? 'a' : 'div')
    a.className = 'card' + (e.map ? '' : ' is-missing')
    a.style.animationDelay = `${Math.min(i, 12) * 30}ms`
    a.style.setProperty('--rc', e.cat === 'event' ? '#ffb547' : e.cat === 'four' ? 'var(--accent-2)' : e.cat === 'other' ? 'var(--faint)' : 'var(--accent)')
    if (e.map) a.href = 'atlas.html?map=' + encodeURIComponent(e.map.slug)
    const thumb = document.createElement('div'); thumb.className = 'thumb'
    if (e.map) {
      const cv = document.createElement('canvas'); thumb.appendChild(cv)
      const p = previews[e.map.slug]
      if (p && bd) { try { drawPreview(cv, gunzipSync(Uint8Array.from(atob(p), ch => ch.charCodeAt(0))), bd.colorOf) } catch { /* no picture */ } }
    } else {
      const blank = document.createElement('div'); blank.className = 'blank'
      blank.innerHTML = MAP_ICON + '<span></span>'
      blank.lastChild.textContent = 'Not in the Atlas yet'
      thumb.appendChild(blank)
    }
    if (e.r) {
      const t = document.createElement('span'); t.className = 'tag'; t.textContent = e.r.teams === 8 ? '8 teams' : '4 teams'
      thumb.appendChild(t)
    }
    if (e.r && e.r.season) { const s = document.createElement('span'); s.className = 'season'; s.textContent = e.r.season; thumb.appendChild(s) }
    const meta = document.createElement('div'); meta.className = 'meta'
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = e.name
    if (e.r && e.r.aka) nm.title = 'Event version of ' + e.r.aka
    const sub = document.createElement('span'); sub.className = 'sub'
    const kind = document.createElement('span'); kind.textContent = CATS.find(c => c.id === e.cat).name.replace(/ maps$/, '')
    const st = document.createElement('span')
    if (e.map && e.map.stats && !e.map.stats.complete) { st.className = 'st maybe'; st.textContent = 'Edges unsure'; st.title = 'Parts of it were only seen after the start. Another game on it fixes that.' } else if (!e.r) { st.className = 'st unseen'; st.textContent = 'Not on the list' } else if (e.r.in) { st.className = 'st sure'; st.textContent = e.r.season ? 'On now' : 'In rotation' } else { st.className = 'st unseen'; st.textContent = 'Out of rotation' }
    sub.append(kind, st)
    meta.append(nm, sub)
    a.append(thumb, meta)
    return a
  }

  function render () {
    for (const b of document.querySelectorAll('.cat')) {
      b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat))
      const n = entries.filter(e => (b.dataset.cat === 'all' || e.cat === b.dataset.cat) && inHave(e)).length
      b.querySelector('.n').textContent = n
      b.hidden = !n && b.dataset.cat !== 'all' && b.dataset.cat !== state.cat
    }
    for (const b of document.querySelectorAll('#haveSeg button')) b.setAttribute('aria-pressed', String(b.dataset.h === state.have))
    const cat = CATS.find(c => c.id === state.cat)
    $('heading').textContent = state.cat === 'all' ? HAVES[state.have] : cat.name
    const shown = entries
      .filter(e => (state.cat === 'all' || e.cat === state.cat) && inHave(e) && (!state.q || e.key.includes(state.q)))
      .sort((a, b) => (!!b.map - !!a.map) || a.name.localeCompare(b.name))
    const grid = $('grid')
    grid.textContent = ''
    shown.forEach((e, i) => grid.appendChild(card(e, i)))
    $('empty').hidden = !!shown.length
    $('emptyText').textContent = state.q ? 'Try another word, or another category.'
      : state.have === 'need' ? 'Every map in rotation here is in the Atlas.'
        : 'Try another category.'
  }
  render()
  setStatus('')
  window.__atlas = { ready: true, maps }
}

// --- One map in 3D ---
async function showMap (map, rotationP) {
  document.body.dataset.view = 'map'
  const h = map.header
  const rotation = await rotationP.catch(() => ({ maps: [] }))
  const r = (rotation.maps || []).find(x => norm(x.name) === norm(h.name) || norm(x.aka) === norm(h.name))
  $('atMapTitle').textContent = h.name
  // What the map is, not how often it was played (Milo 2026-11-04).
  const bits = []
  if (r) bits.push(r.teams === 8 ? '8 teams' : '4 teams')
  else if (h.modes && h.modes.length) bits.push(h.modes.map(modeName).join(', '))
  if (r && r.season) bits.push(r.season + ' map')
  if (h.local) bits.push('from a replay file')
  if (!bits.length) bits.push('Prism Atlas')
  $('atMapSub').textContent = bits.join(' · ')
  $('atMapWarn').hidden = !(h.stats && !h.stats.complete)
  document.title = h.name + ' · Prism Atlas'

  setStatus('Drawing the map…', { progress: 0 })
  const stage = $('atStage')
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  stage.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const SKY = '#7ba4ff'; const FOG = '#c4d8ff'
  scene.background = new THREE.Color(SKY)
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900)
  const resize = () => {
    const w = stage.clientWidth; const hh = stage.clientHeight
    renderer.setSize(w, hh)
    camera.aspect = w / hh
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  const blocks = new BlockRenderer(scene, { fog: { color: FOG, near: 260, far: 520 } })
  await blocks.load()
  for (const c of map.columns) blocks.setColumn(c.x, c.z, c.sections)
  let total = 0; let drawn = false
  blocks.onProgress = (left) => {
    if (drawn) return
    total = Math.max(total, left)
    if (left === 0) { drawn = true; setStatus('') } else setStatus('Drawing the map…', { progress: 1 - left / (total || 1) })
  }

  // Where things are: the middle of the blocks, and how tall the map is.
  let sx = 0; let sz = 0; let sy = 0; let n = 0
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity
  for (const c of map.columns) {
    c.sections.forEach((s, y) => { if (s) { sy += y * 16 + 8; n++ } })
    sx += c.x * 16 + 8; sz += c.z * 16 + 8
    minX = Math.min(minX, c.x * 16); maxX = Math.max(maxX, c.x * 16 + 16); minZ = Math.min(minZ, c.z * 16); maxZ = Math.max(maxZ, c.z * 16 + 16)
  }
  const mid = new THREE.Vector3(sx / Math.max(1, map.columns.length), n ? sy / n : 80, sz / Math.max(1, map.columns.length))
  const span = Math.max(80, maxX - minX, maxZ - minZ)

  const cam = new ReplayCamera(camera, renderer.domElement)
  cam.speed = 18
  cam.center.copy(mid)
  cam.yaw = cam.tYaw = Math.PI / 4
  // Starts flying, a little closer than the whole-map view (Milo 2026-11-04).
  const startDist = Math.min(300, span * 0.8)
  cam.tPitch = cam.pitch = -0.8
  const back = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), -Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch))
  camera.position.copy(mid).addScaledVector(back, startDist)
  camera.rotation.set(cam.pitch, cam.yaw, 0)
  cam.setMode('free')

  // Overview centre glides when it's moved by a double-click.
  let centerTo = null
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  cam.onDoubleClick = (x, y) => {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(blocks.group.children, false)
    if (!hits.length) return
    if (cam.mode === 'overview') { centerTo = hits[0].point.clone(); cam.tDist = Math.max(25, cam.tDist * 0.6) } else cam.glideTo(hits[0].point)
  }

  // Pinch to zoom (phones), in either mode.
  const touches = new Map()
  let pinch = 0
  renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]) })
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return
    touches.set(e.pointerId, [e.clientX, e.clientY])
    if (touches.size !== 2) return
    const [a, b] = [...touches.values()]
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    if (pinch) {
      const f = pinch / d
      if (cam.mode === 'overview') cam.tDist = Math.max(20, Math.min(400, cam.tDist * f))
      else cam.camera.position.addScaledVector(new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), (f - 1) * 25)
    }
    pinch = d
  })
  const lift = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0 }
  renderer.domElement.addEventListener('pointerup', lift)
  renderer.domElement.addEventListener('pointercancel', lift)

  // Modes.
  const modeBtns = [...document.querySelectorAll('.at-mode')]
  const setMode = (m) => {
    if (m === cam.mode) return
    if (m === 'free' && cam.mode === 'overview') {
      // Start flying from where the map camera was, a bit lower.
      const p = camera.position.clone()
      cam.setMode('free')
      camera.position.copy(p)
    } else if (m === 'overview') {
      // Circle what's in front of you.
      const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(30)
      cam.center.set(camera.position.x + fwd.x, Math.min(camera.position.y, mid.y + 10), camera.position.z + fwd.z)
      cam.setMode('overview')
      cam.tDist = 70
    }
  }
  cam.onChange = () => { for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === cam.mode)) }
  cam.onChange()
  for (const b of modeBtns) b.addEventListener('click', () => setMode(b.dataset.mode))
  let toastTimer = 0
  cam.onSpeed = (s) => {
    const t = $('atToast'); t.textContent = 'Flying speed ' + Math.round(s); t.classList.add('is-on')
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 900)
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'f') setMode('free')
    if (k === 'm') setMode('overview')
    if (k === 'r') { cam.center.copy(mid); centerTo = null; cam.setMode('overview'); cam.tDist = Math.min(400, span * 0.8); cam.tPitch = -0.85 }
    if (k === '?' || (k === '/' && e.shiftKey)) $('atHelp').hidden = !$('atHelp').hidden
    if (k === 'escape') $('atHelp').hidden = true
  })
  $('atHelpBtn').addEventListener('click', (e) => { e.stopPropagation(); $('atHelp').hidden = !$('atHelp').hidden })
  $('atHelp').addEventListener('click', () => { $('atHelp').hidden = true })
  $('atFullBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
  })

  let last = performance.now(); let lastCamSent = 0
  function frame (ts) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts
    if (centerTo) { cam.center.lerp(centerTo, 1 - Math.exp(-6 * dt)); if (cam.center.distanceTo(centerTo) < 0.05) centerTo = null }
    cam.update(dt)
    blocks.tick(ts / 1000)
    if (ts - lastCamSent > 500) { blocks.setCamera(camera.position); lastCamSent = ts }
    renderer.render(scene, camera)
  }
  requestAnimationFrame(frame)
  window.__atlas = { cam, blocks, camera, get ready () { return drawn && blocks.left === 0 } }
}

async function openMap (slug) {
  const rotationP = loadRotation()
  setStatus('Waking up the server…', { progress: 0 })
  try {
    const res = await api('/maps/' + encodeURIComponent(slug) + '/file', { cache: 'no-cache' }) // (a game added in the last 5 min shows too)
    setStatus('Loading the map…')
    const map = decodeMap(new Uint8Array(await res.arrayBuffer()))
    await showMap(map, rotationP)
  } catch (err) {
    document.body.dataset.view = 'map'
    setStatus(err.noKey ? 'This map needs your tracker key. Open the tracker, enter your key there, then come back.' : (err.status === 404 ? 'There\'s no map by that name in the Atlas.' : 'Couldn\'t load the map: ' + err.message), { error: true })
  }
}

async function openFile (file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  setStatus('Reading the file…', { progress: 0 })
  await tick()
  // A replay is a zip ("PK"); a map file is gzip.
  const map = bytes[0] === 0x50 && bytes[1] === 0x4b ? mapFromReplay(bytes) : decodeMap(bytes)
  if (!map.columns.length) throw new Error('No map in this file.')
  history.replaceState(null, '', 'atlas.html?file=' + encodeURIComponent(file.name))
  await showMap(map, loadRotation())
}

function pickFile () {
  for (const input of document.querySelectorAll('.at-file')) {
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0]
      if (!f) return
      try { await openFile(f) } catch (err) { console.error(err); setStatus(err.message || String(err), { error: true }) }
    })
  }
}

function main () {
  pickFile()
  const params = new URLSearchParams(location.search)
  const slug = params.get('map')
  if (slug && /^[a-z0-9-]{1,40}$/.test(slug)) openMap(slug)
  else showList().catch(err => { console.error(err); setStatus('Couldn\'t show the Atlas: ' + err.message, { error: true }) })
}

main()
