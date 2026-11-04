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
async function loadRotation () {
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

// --- The list ---
async function showList () {
  document.body.dataset.view = 'list'
  const rotationP = loadRotation().catch(() => ({ maps: [] }))
  let maps = []; let replays = null; let previews = {}
  let note = ''
  try {
    const list = await (await api('/maps')).json()
    maps = list.maps; replays = list.replays
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
  const have = new Set(maps.map(m => norm(m.name)))

  // Summary.
  const inRot = (rotation.maps || []).filter(r => r.in)
  const covered = inRot.filter(r => have.has(norm(r.name)))
  const known = !note
  $('atCount').textContent = known ? maps.length : '–'
  $('atCovered').textContent = (known ? covered.length : '–') + ' / ' + inRot.length
  $('atMissingTitle').textContent = known ? 'Not in the Atlas yet' : 'Maps in rotation now'
  $('atGames').textContent = replays ? replays.total : '–'
  $('atGamesNote').textContent = replays && replays.waiting ? replays.waiting + ' still being read' : 'saved replays'
  $('atAsOf').textContent = rotation.asOf ? `Rotation from the ${rotation.live ? '' : 'saved '}player-kept list, ${rotation.asOf}.` : ''
  $('atNote').hidden = !note
  $('atNote').textContent = note

  // Your maps.
  const grid = $('atGrid')
  grid.textContent = ''
  const bd = maps.length ? await loadBlockData().catch(() => null) : null
  for (const m of maps) {
    const r = rot.get(norm(m.name))
    const a = document.createElement('a')
    a.className = 'at-card'
    a.href = 'atlas.html?map=' + encodeURIComponent(m.slug)
    a.dataset.name = norm(m.name)
    const fig = document.createElement('div'); fig.className = 'at-thumb'
    const cv = document.createElement('canvas'); fig.appendChild(cv)
    if (previews[m.slug] && bd) {
      try { drawPreview(cv, gunzipSync(Uint8Array.from(atob(previews[m.slug]), ch => ch.charCodeAt(0))), bd.colorOf) } catch { /* no picture */ }
    }
    const body = document.createElement('div'); body.className = 'at-card-body'
    const h = document.createElement('h3'); h.textContent = m.name
    const chips = document.createElement('div'); chips.className = 'at-chips'
    const chip = (text, cls = '') => { const s = document.createElement('span'); s.className = 'at-chip ' + cls; s.textContent = text; chips.appendChild(s) }
    if (r) chip(r.teams === 8 ? '8 teams' : '4 teams')
    if (r && r.season) chip(r.season + (r.in ? ' · now' : ''), 'is-season')
    else if (r) chip(r.in ? 'In rotation' : 'Out of rotation', r.in ? 'is-in' : '')
    if (m.stats && !m.stats.complete) chip('Edges unsure', 'is-warn')
    const meta = document.createElement('p'); meta.className = 'at-meta'
    const newest = m.newestGame ? new Date(m.newestGame).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
    meta.textContent = (m.games === 1 ? '1 game' : m.games + ' games') + (newest ? ' · newest ' + newest : '')
    body.append(h, chips, meta)
    a.append(fig, body)
    grid.appendChild(a)
  }
  $('atEmpty').hidden = !!maps.length || !!note

  // Not in the Atlas yet.
  const missing = $('atMissing')
  missing.textContent = ''
  const groups = [
    ['8 teams (Solo, Doubles)', inRot.filter(r => !r.season && r.teams === 8)],
    ['4 teams (3s, 4s)', inRot.filter(r => !r.season && r.teams === 4)],
    ['Event maps now', inRot.filter(r => r.season)]
  ]
  let missingCount = 0
  for (const [title, list] of groups) {
    const rows = list.filter(r => !have.has(norm(r.name)))
    if (!list.length) continue
    missingCount += rows.length
    const g = document.createElement('div'); g.className = 'at-group'
    const h = document.createElement('h3')
    h.innerHTML = '<span></span> <span class="at-group-count"></span>'
    h.firstChild.textContent = title
    h.lastChild.textContent = !known ? list.length + ' maps' : rows.length ? rows.length + ' of ' + list.length + ' missing' : 'all ' + list.length + ' in the Atlas'
    const ul = document.createElement('ul'); ul.className = 'at-pills'
    for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
      const li = document.createElement('li'); li.className = 'at-pill'; li.textContent = r.name
      if (r.aka) li.title = 'Event version of ' + r.aka
      li.dataset.name = norm(r.name)
      ul.appendChild(li)
    }
    g.append(h, ul)
    missing.appendChild(g)
  }
  $('atMissingCount').textContent = !known ? '' : missingCount ? `${missingCount} maps in rotation` : 'none'
  // Out of rotation (for later).
  const out = (rotation.maps || []).filter(r => !r.in && !r.season)
  $('atOutCount').textContent = out.length
  const outUl = $('atOut')
  outUl.textContent = ''
  for (const r of out.sort((a, b) => a.name.localeCompare(b.name))) {
    const li = document.createElement('li'); li.className = 'at-pill' + (have.has(norm(r.name)) ? ' is-have' : ''); li.textContent = r.name
    li.dataset.name = norm(r.name)
    outUl.appendChild(li)
  }

  // Search.
  $('atSearch').addEventListener('input', () => {
    const q = norm($('atSearch').value)
    for (const el of document.querySelectorAll('[data-name]')) el.hidden = !!q && !el.dataset.name.includes(q)
  })
  if (replays && replays.failed && replays.failed.length) {
    $('atFailed').hidden = false
    $('atFailed').textContent = `${replays.failed.length} replay${replays.failed.length === 1 ? '' : 's'} couldn't be read (${replays.failed[0].error}).`
  }
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
  const sources = h.sources || []
  const newest = sources.reduce((a, s) => (s.playedAt && (!a || s.playedAt > a) ? s.playedAt : a), null)
  const bits = []
  if (r) bits.push(r.teams === 8 ? '8 teams' : '4 teams')
  else if (h.modes && h.modes.length) bits.push(h.modes.map(modeName).join(', '))
  bits.push(h.local ? 'from a replay file' : (sources.length === 1 ? 'from 1 game' : `from ${sources.length} games`))
  if (newest) bits.push(new Date(newest).toLocaleDateString(undefined, { dateStyle: 'medium' }))
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
  cam.setMode('overview')
  cam.tDist = cam.dist = Math.min(400, span * 1.15)
  cam.tPitch = cam.pitch = -0.85

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
    if (k === 'r') { cam.center.copy(mid); centerTo = null; cam.setMode('overview'); cam.tDist = Math.min(400, span * 1.15); cam.tPitch = -0.85 }
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
