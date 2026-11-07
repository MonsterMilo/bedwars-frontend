// Prism replay viewer: plays a recorded Bed Wars game in 3D in the browser.
// The page (replay.html) holds the controls; this file loads the replay,
// builds the timeline and runs the 3D view.
global.THREE = require('three')
const THREE = global.THREE
const { BlockRenderer } = require('./renderer')
const { readMcpr, buildTimeline } = require('./model')
const { ReplayWorld } = require('./world')
const { PlayerModel, skinUrl, skinSlim } = require('./players')
const { Mesher } = require('./mesher')
const { ItemFactory } = require('./items')
const { EntityView } = require('./entities')
const { Particles } = require('./particles')
const { Sounds } = require('./sounds')
const { synthesize } = require('./soundsynth')
const { tickGlint } = require('./glint')
const { Cracks } = require('./cracks')
const { ReplayCamera } = require('./camera')
const { TacticalMap } = require('./tactical')
const { FirstPersonHand } = require('./fphand')
const { Hud } = require('./hud')
const { Keybinds, renderBindings } = require('./keybinds')
const { Recorder } = require('./recorder')

const BACKEND = 'https://bedwars-backend.onrender.com'
const KEY_STORAGE = 'bedwarsAdminKey'
const $ = (id) => document.getElementById(id)

function getKey () { try { return localStorage.getItem(KEY_STORAGE) || '' } catch { return '' } }

function fmt (ms) {
  ms = Math.max(0, ms)
  const s = Math.floor(ms / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function setStatus (text, { error = false, progress = null } = {}) {
  const box = $('rpLoading')
  box.hidden = !text
  $('rpLoadingText').textContent = text || ''
  box.classList.toggle('is-error', error)
  const bar = $('rpLoadingBar')
  bar.hidden = progress == null
  if (progress != null) bar.style.setProperty('--p', Math.round(progress * 100) + '%')
}

/** Read a fetch response's body, reporting download progress. */
async function readWithProgress (res, onProgress) {
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const parts = []; let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value); got += value.length
    if (total) onProgress(got / total)
  }
  const out = new Uint8Array(got); let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** A replay (what = 'replays') or a clip ('clips') from the backend. */
async function loadFromBackend (id, what = 'replays') {
  const noun = what === 'clips' ? 'clip' : 'replay'
  const key = getKey()
  if (!key) throw new Error(`This ${noun} needs your tracker key. Open the tracker site, enter your key there, then come back to this page.`)
  const headers = { 'x-admin-key': key }
  setStatus('Waking up the server…', { progress: 0 })
  const infoRes = await fetch(`${BACKEND}/${what}/${encodeURIComponent(id)}`, { headers })
  if (!infoRes.ok) throw new Error((await infoRes.json().catch(() => ({}))).error || `Couldn't find this ${noun} (${infoRes.status}).`)
  const details = await infoRes.json()
  setStatus(`Downloading the ${noun}…`, { progress: 0 })
  const res = await fetch(`${BACKEND}/${what}/${encodeURIComponent(id)}/file`, { headers })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't download the ${noun} (${res.status}).`)
  const bytes = await readWithProgress(res, (p) => setStatus(`Downloading the ${noun}…`, { progress: p }))
  if (what === 'clips') details.isClip = true
  return { bytes, details }
}

// Inside the tracker's player popup (replay.html?clip=…&embed=1): just the
// view and the controls, playing on a loop.
const EMBED = new URLSearchParams(location.search).get('embed') === '1'
if (EMBED) document.documentElement.classList.add('rp-embed')
// The clip's controls fade out after 2 s with no mouse movement over it
// (not while a menu or the settings are open), and come back on any move.
if (EMBED) {
  const root = document.documentElement
  let idleTimer = 0
  const idle = () => {
    const open = ['rpSettings', 'rpSpeedMenu'].some(id => { const el = document.getElementById(id); return el && !el.hidden })
    if (open) { idleTimer = setTimeout(idle, 2000); return }
    root.classList.add('rp-idle')
  }
  const wake = () => { root.classList.remove('rp-idle'); clearTimeout(idleTimer); idleTimer = setTimeout(idle, 2000) }
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) document.addEventListener(ev, wake, { passive: true })
  wake()
}

const tick = () => new Promise(r => setTimeout(r, 0))
// The replay's id on the backend, when opened from the tracker (for saving clips).
const REPLAY_ID = new URLSearchParams(location.search).get('id') || null

async function start (bytes, details = null) {
  setStatus('Reading the replay…', { progress: 0 })
  await tick()
  const mcpr = readMcpr(bytes)
  setStatus('Rebuilding the game…', { progress: 0 })
  await tick()
  const tl = buildTimeline(mcpr)
  for (const tr of tl.tracks.values()) { tr.skinUrl = skinUrl(tl.skins.get(tr.uuid)); tr.slim = skinSlim(tl.skins.get(tr.uuid)) }
  await runViewer(tl, details)
}

async function runViewer (tl, details) {
  setStatus('Drawing the map…', { progress: 0 })
  const stage = $('rpStage')
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  stage.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  // Minecraft 1.8's midday sky, with fog near the edge of the view.
  const SKY = '#7ba4ff'
  const FOG = '#c4d8ff'
  scene.background = new THREE.Color(SKY)
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const sun = new THREE.DirectionalLight(0xffffff, 0.45)
  sun.position.set(0.3, 1, 0.5)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 700)
  let recorder = null
  let resScale = 1
  const resize = () => {
    if (recorder && recorder.sizeLocked) return
    const w = stage.clientWidth; const h = stage.clientHeight
    renderer.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * resScale))
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  const blocks = new BlockRenderer(scene, { fog: { color: FOG, near: 160, far: 320 } })
  await blocks.load()
  const world = new ReplayWorld(blocks, tl)
  world.loadAll()
  // Only the first build of the map shows progress; later jumps redraw
  // in the background.
  let mapReady = false
  let total = 0
  blocks.onProgress = (left) => {
    if (mapReady) return
    total = Math.max(total, left)
    if (left === 0) { mapReady = true; setStatus('') } else setStatus('Drawing the map…', { progress: 1 - left / (total || 1) })
  }

  // Items, players, other entities, particles, sounds.
  const mesher = new Mesher(blocks.data)
  const itemsTex = await new Promise((resolve, reject) => new THREE.TextureLoader().load('replay/items.png', resolve, undefined, () => reject(new Error('Couldn\'t load the item textures'))))
  itemsTex.magFilter = THREE.NearestFilter; itemsTex.minFilter = THREE.NearestFilter; itemsTex.generateMipmaps = false
  const items = new ItemFactory(blocks.data, mesher, blocks.tex, itemsTex)
  const models = []
  for (const tr of tl.tracks.values()) {
    const m = new PlayerModel(tr, items)
    scene.add(m.group)
    models.push(m)
  }
  const views = []
  for (const e of tl.entities.values()) {
    if (!e.t || !e.t.length) continue
    const v = new EntityView(e, items)
    scene.add(v.group)
    views.push(v)
  }
  const texName = new Map(Object.entries(blocks.data.textures).map(([k, v]) => [v, k]))
  const colorCache = new Map()
  const colorOf = (state) => {
    if (colorCache.has(state)) return colorCache.get(state)
    let c = [0.6, 0.6, 0.6]
    try {
      const b = mesher.blockInfo(state)
      const quads = b.air ? [] : mesher.modelQuads(b.name, b.props)
      const q = quads.find(q => q.dir === 'north') || quads[0]
      const avg = q && blocks.data.avgColors[texName.get(q.tex)]
      if (avg) {
        const tint = q.tint ? mesher.tintFor(b.name) : [255, 255, 255]
        c = avg.map((v, k) => v / 255 * tint[k] / 255)
      }
    } catch { /* unknown block: grey */ }
    colorCache.set(state, c)
    return c
  }
  const cracks = new Cracks(scene, tl, world)
  tl.sounds = synthesize(tl)
  const particles = new Particles(scene, tl, { colorOf })
  const sounds = new Sounds(tl)
  for (const m of models) m.group.userData.model = m

  // --- Settings (remembered in this browser) ---
  const SETTINGS_KEY = 'replaySettings'
  const settings = { chat: true, feed: true, names: true, invis: true, particles: true, hearing: 2, smooth: true, sensitivity: 1, volume: 0.7, panel: window.innerWidth > 860, timers: true, hitboxes: false, hand: true, fov: 70, res: 1, fps: 0, view: 320, map: 'mini', moments: { kill: true, final: true, bed: true, elim: true } }
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) } catch { /* private window */ }
  const saveSettings = () => { if (EMBED) return; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ } }
  // A clip in the popup: no side panel or chat. It plays with sound (it only
  // starts after a card is clicked), even if the full viewer was muted.
  if (EMBED) { settings.panel = false; settings.chat = false; if (!(settings.volume > 0)) settings.volume = settings.lastVolume || 0.7 }
  const clip = details && details.isClip ? details : null

  const cam = new ReplayCamera(camera, renderer.domElement)
  const binds = new Keybinds()
  cam.binds = binds
  const hand = new FirstPersonHand(items)
  const hud = new Hud(scene, models)
  cam.solidAt = (x, y, z) => {
    const v = world.get(Math.floor(x), Math.floor(y), Math.floor(z))
    return v !== 0 && mesher.blockInfo(v).solid
  }
  const c = world.center()
  const startY = 95
  cam.center.set(c.x, startY - 10, c.z)
  cam.lookAt({ x: c.x + 40, y: startY + 45, z: c.z + 40 }, { x: c.x, y: startY - 10, z: c.z })

  function applySettings () {
    $('rpChat').hidden = !settings.chat
    $('rpFeed').hidden = !settings.feed
    for (const m of models) { m.tag.visible = settings.names; m.ghostAllowed = settings.invis }
    particles.points.visible = settings.particles
    cam.smooth = settings.smooth
    cam.sensitivity = settings.sensitivity
    sounds.volume = settings.volume
    sounds.range = settings.hearing
    sounds.setOn(settings.volume > 0)
    hud.timers = settings.timers
    hud.hitboxes = settings.hitboxes
    camera.fov = settings.fov; camera.far = settings.view + 60; camera.updateProjectionMatrix()
    blocks.uniforms.fogFar.value = settings.view; blocks.uniforms.fogNear.value = settings.view * 0.5
    if (resScale !== settings.res) { resScale = settings.res; resize() }
    $('rpHitBtn').setAttribute('aria-pressed', String(!!settings.hitboxes))
    $('rp').classList.toggle('is-collapsed', !settings.panel)
    $('rpPanelBtn').setAttribute('aria-pressed', String(settings.panel))
    $('rpSound').innerHTML = settings.volume > 0 ? ICON.sound : ICON.mute
    $('rpSound').setAttribute('aria-pressed', String(settings.volume > 0))
    for (const el of document.querySelectorAll('[data-set]')) {
      const k = el.dataset.set
      if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = String(settings[k])
      const out = el.parentElement.querySelector('output')
      if (out) out.textContent = k === 'fov' ? settings.fov + '°' : k === 'view' ? settings.view + ' blocks' : ''
    }
    setTimeout(resize, 320) // after the side panel slides
  }
  for (const el of document.querySelectorAll('[data-set]')) {
    el.addEventListener('input', () => {
      const k = el.dataset.set
      settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value)
      saveSettings(); applySettings()
    })
  }

  // --- Toast ---
  let toastTimer = 0
  function toast (text) {
    const t = $('rpToast')
    t.textContent = text
    t.classList.add('is-on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 900)
  }
  cam.onSpeed = (s) => toast('Flying speed ' + Math.round(s))

  // --- Header ---
  const info = tl.info || {}
  const modeName = (info.mode || '').replace(/^BEDWARS_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
  const when = new Date(tl.meta.date || (details && details.playedAt) || Date.now())
  $('rpTitle').textContent = [info.map || (details && details.map), modeName || (details && details.mode)].filter(Boolean).join(' · ') || 'Replay'
  $('rpSub').textContent = when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + fmt(tl.duration) + ' · ' + tl.tracks.size + ' players'
  if (clip) {
    // "Final kill · Steve" / "by Milo · Lighthouse · 3 Nov, 20:14"
    $('rpTitle').textContent = clip.kind === 'manual'
      ? 'Clip' + (clip.people && clip.people.length ? ' · ' + clip.people.slice(0, 3).map(p => p.name).join(', ') : '')
      : (clip.kind === 'bed' ? 'Bed break' : 'Final kill') + ' · ' + (clip.victim || clip.username || '?')
    $('rpSub').textContent = [clip.by ? 'by ' + clip.by : null, clip.map, when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')
  }
  document.title = ($('rpTitle').textContent || 'Replay') + ' · Prism Replay'

  // --- Player heads (from each skin's face and hat layer) ---
  function headCanvas (m, size = 30) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 8
    cv.className = 'rp-head'
    const ctx = cv.getContext('2d')
    ctx.fillStyle = m.track.team ? m.track.team.color : '#888'
    ctx.fillRect(0, 0, 8, 8)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { ctx.clearRect(0, 0, 8, 8); ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8); ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8) }
    img.src = m.track.skinUrl || 'replay/steve.png'
    return cv
  }

  // --- Player list, grouped by team ---
  const list = $('rpPlayers')
  list.textContent = ''
  const teams = new Map()
  for (const m of models) {
    const label = m.track.team ? m.track.team.label : 'No team'
    if (!teams.has(label)) teams.set(label, { label, color: m.track.team ? m.track.team.color : '#bbbbbb', members: [] })
    // Someone who left and rejoined comes back as a new entity: one row each name.
    const members = teams.get(label).members
    const same = m.track.name && members.find(x => x.track.name === m.track.name)
    if (same) { same.others = same.others || []; same.others.push(m) } else members.push(m)
  }
  const order = ['Red', 'Blue', 'Green', 'Yellow', 'Aqua', 'White', 'Pink', 'Gray']
  const rows = []
  const teamRows = []
  const sortedTeams = [...teams.values()].sort((a, b) => (order.indexOf(a.label) + 99) % 99 - (order.indexOf(b.label) + 99) % 99)
  for (const team of sortedTeams) {
    const h = document.createElement('li')
    h.className = 'rp-team'
    h.style.setProperty('--team', team.color)
    h.innerHTML = '<span class="rp-team-dot"></span><span class="rp-team-name"></span><span class="rp-team-info"><span class="rp-alive"></span><span class="rp-bed">bed</span></span>'
    h.querySelector('.rp-team-name').textContent = team.label
    list.appendChild(h)
    const bedT = (tl.bedsBroken.find(b => b.team === team.label) || {}).t
    const tr = { team, el: h, bed: h.querySelector('.rp-bed'), alive: h.querySelector('.rp-alive'), bedT, rows: [] }
    teamRows.push(tr)
    for (const m of team.members) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rp-player'
      btn.style.setProperty('--team', team.color)
      const head = headCanvas(m)
      const name = document.createElement('span'); name.className = 'rp-pname'; name.textContent = m.track.name || '?'
      const tags = document.createElement('span'); tags.className = 'rp-tags'
      if (m.track.self) { const b = document.createElement('span'); b.className = 'rp-badge is-you'; b.textContent = 'you'; tags.append(b) }
      if (m.track.nicked) { const b = document.createElement('span'); b.className = 'rp-badge is-nick'; b.textContent = 'nick'; b.title = 'Played under a nick'; tags.append(b) }
      const status = document.createElement('span'); status.className = 'rp-status'; status.hidden = true
      tags.append(status)
      const hp = document.createElement('span'); hp.className = 'rp-hp'; hp.innerHTML = '<i></i>'
      const statsEl = document.createElement('span'); statsEl.className = 'rp-pstats'; statsEl.hidden = true
      btn.append(head, name, tags, statsEl, hp)
      btn.addEventListener('click', () => pickPlayer(row))
      li.appendChild(btn)
      list.appendChild(li)
      const row = { m, all: [m, ...(m.others || [])], btn, status, hp, head, tags, stats: statsEl, team: tr, deaths: tl.deaths.filter(d => d.name === m.track.name), kind: undefined, text: '', hpv: -1 }
      rows.push(row)
      tr.rows.push(row)
    }
  }
  if (!tl.tracks.size) list.innerHTML = '<li class="rp-empty">No players in this recording.</li>'
  if (!tl.self.id || !tl.tracks.has(tl.self.id)) {
    $('rpNoSelf').hidden = false
    setTimeout(() => { $('rpNoSelf').hidden = true }, 12000)
  }

  const rowOf = (model) => rows.find(r => r.all.includes(model))
  const currentModel = (r) => r.all.find(x => x.present) || r.all.filter(x => x.track.t[0] <= now).pop() || r.m

  /** Clicking a player (list or 3D): follow, then their eyes, then stop. */
  function pickPlayer (r) {
    const target = currentModel(r)
    const same = cam.model && r.all.includes(cam.model)
    if (same && cam.mode === 'follow') cam.setMode('eyes', target)
    else if (same && cam.mode === 'eyes') cam.setMode('free')
    else {
      cam.tYaw = cam.yaw = -target.group.rotation.y + Math.PI
      cam.tPitch = -0.35
      cam.setMode('follow', target)
    }
  }

  // --- Camera modes ---
  const modeBtns = [...document.querySelectorAll('.rp-mode')]
  const followBox = $('rpFollow')
  cam.onChange = () => {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === cam.mode))
    const r = cam.model && rowOf(cam.model)
    for (const x of rows) x.btn.classList.toggle('is-following', x === r && (cam.mode === 'follow' || cam.mode === 'eyes'))
    followBox.hidden = !(r && (cam.mode === 'follow' || cam.mode === 'eyes'))
    if (!followBox.hidden) {
      followBox.textContent = ''
      followBox.style.setProperty('--team', r.team.team.color)
      const head = headCanvas(r.m)
      const label = document.createElement('span')
      label.innerHTML = (cam.mode === 'eyes' ? 'Seeing through ' : 'Following ') + '<b></b> <span class="rp-follow-note"></span>'
      label.querySelector('b').textContent = r.m.track.name || '?'
      const swap = document.createElement('button'); swap.type = 'button'
      swap.textContent = cam.mode === 'eyes' ? 'Third person' : 'Their eyes'
      swap.addEventListener('click', () => cam.setMode(cam.mode === 'eyes' ? 'follow' : 'eyes', currentModel(r)))
      const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop'
      stop.addEventListener('click', () => cam.setMode('free'))
      followBox.append(head, label, swap, stop)
      followBox._note = label.querySelector('.rp-follow-note')
    }
  }
  function defaultPlayer () {
    return rows.find(r => r.m.track.self && r.all.some(x => x.present)) || rows.find(r => r.all.some(x => x.present)) || rows[0]
  }
  for (const b of modeBtns) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode
      if (mode === 'follow' || mode === 'eyes') {
        const r = (cam.model && rowOf(cam.model)) || defaultPlayer()
        if (!r) return toast('No players to follow')
        if (cam.mode !== 'follow' && cam.mode !== 'eyes') { cam.tYaw = cam.yaw = -currentModel(r).group.rotation.y + Math.PI; cam.tPitch = -0.35 }
        cam.setMode(mode, currentModel(r))
      } else {
        if (mode === 'overview') { const p = cam.focus || camera.position; cam.center.set(p.x, Math.min(p.y, startY), p.z) }
        cam.setMode(mode)
      }
    })
  }
  cam.onChange(cam)

  // Clicking a player in the 3D view follows them; double-click flies there.
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const toNdc = (x, y) => { const b = renderer.domElement.getBoundingClientRect(); ndc.set((x - b.left) / b.width * 2 - 1, -((y - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera) }
  function modelAt (x, y) {
    toNdc(x, y)
    const hits = ray.intersectObjects(models.filter(m => m.group.visible).map(m => m.pose), true)
    if (hits.length) { let o = hits[0].object; while (o && !o.userData.model) o = o.parent; return o ? o.userData.model : null }
    // Near misses count: the closest player within a small angle.
    let best = null; let bestD = 0.035
    for (const m of models) {
      if (!m.group.visible) continue
      const p = m.group.position.clone(); p.y += 1
      const v = p.clone().project(camera)
      if (v.z > 1) continue
      const d = Math.hypot(v.x - ndc.x, v.y - ndc.y)
      if (d < bestD) { bestD = d; best = m }
    }
    return best
  }
  cam.onClick = (x, y) => { const m = modelAt(x, y); const r = m && rowOf(m); if (r) pickPlayer(r) }
  cam.onDoubleClick = (x, y) => {
    if (modelAt(x, y)) return
    toNdc(x, y)
    const hits = ray.intersectObjects(blocks.group.children, false)
    if (hits.length) cam.glideTo(hits[0].point)
  }
  let hoverAt = 0
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons || performance.now() - hoverAt < 80) return
    hoverAt = performance.now()
    $('rpStage').classList.toggle('is-hovering', !!modelAt(e.clientX, e.clientY))
  })

  // --- Tactical map ---
  const heads = new Map()
  const headOf = (m) => { if (!heads.has(m)) heads.set(m, headCanvas(m)); return heads.get(m) }
  const tmap = new TacticalMap({
    tl, world, colorOf, models, headOf, parent: $('rpMain'),
    onPickModel: (m) => { const r = rowOf(m); if (r) pickPlayer(r); setMap('mini') },
    onPickPoint: (p) => { cam.glideTo(new THREE.Vector3(p.x, p.y, p.z)); setMap('mini') },
    onExpand: () => setMap('full')
  })
  world.onChange = (out) => { for (let i = 0; i < out.length; i += 4) tmap.markDirty(out[i], out[i + 2]) }
  function setMap (mode) {
    tmap.setMode(mode)
    if (mode !== 'full') { settings.map = mode; saveSettings() }
    $('rpMapBtn').setAttribute('aria-pressed', String(mode !== 'off'))
    $('rpMapBtn').title = 'Tactical map: ' + (mode === 'off' ? 'off' : mode === 'mini' ? 'corner' : 'full') + ' (' + binds.label('map') + ')'
  }
  const cycleMap = () => setMap(tmap.mode === 'off' ? 'mini' : tmap.mode === 'mini' ? 'full' : 'off')
  $('rpMapBtn').addEventListener('click', cycleMap)
  setMap(EMBED ? 'off' : settings.map === 'off' ? 'off' : 'mini')

  // --- Stars, FKDR and Urchin tags in the player list (needs a key) ---
  async function loadStats () {
    const key = getKey()
    if (!key || EMBED) return
    const headers = { 'x-admin-key': key }
    const queue = rows.filter(r => !r.m.track.nicked && r.m.track.uuid && /^[0-9a-f-]{32,36}$/i.test(r.m.track.uuid))
    const work = async () => {
      while (queue.length) {
        const r = queue.shift()
        const uuid = r.m.track.uuid.replace(/-/g, '')
        try {
          const [st, ur] = await Promise.all([
            fetch(`${BACKEND}/stats/uuid/${uuid}`, { headers }).then(x => x.ok ? x.json() : null).catch(() => null),
            r.m.track.name ? fetch(`${BACKEND}/urchin/${encodeURIComponent(r.m.track.name)}`, { headers }).then(x => x.ok ? x.json() : null).catch(() => null) : null
          ])
          if (st && st.star != null) {
            r.stats.textContent = ''
            const star = document.createElement('span'); star.className = 'rp-star'; star.textContent = '★' + st.star
            const fk = document.createElement('span'); fk.textContent = (Math.round(st.fkdr * 100) / 100) + ' FKDR'
            r.stats.append(star, fk)
            r.stats.hidden = false
          }
          for (const t of (ur && ur.tags) || []) {
            const b = document.createElement('span')
            const type = String(t.type || '')
            b.className = 'rp-badge rp-urchin' + (/caution|info/i.test(type) ? ' is-caution' : '')
            b.textContent = type.replace(/_/g, ' ')
            b.title = 'Urchin: ' + type.replace(/_/g, ' ') + (t.reason ? ' · ' + t.reason : '')
            r.tags.insertBefore(b, r.status)
          }
        } catch { /* stats unavailable */ }
      }
    }
    await Promise.all([work(), work(), work()])
  }
  loadStats()

  // --- Side panel ---
  $('rpPanelBtn').addEventListener('click', () => { settings.panel = !settings.panel; saveSettings(); applySettings() })
  const tabs = [[$('rpTabPlayers'), $('rpPanePlayers')], [$('rpTabEvents'), $('rpPaneEvents')], [$('rpTabClips'), $('rpPaneClips')]]
  for (const [tab, pane] of tabs) {
    tab.addEventListener('click', () => { for (const [t2, p2] of tabs) { t2.setAttribute('aria-selected', String(t2 === tab)); p2.hidden = p2 !== pane } })
  }

  // --- Moments: kills, finals, beds and teams out, as a list and on the timeline ---
  const KIND_LABEL = { kill: 'Kills', final: 'Finals', bed: 'Beds', elim: 'Teams out' }
  const moments = []
  for (const mk of tl.markers) moments.push({ t: mk.t, kind: mk.kind, text: mk.text.replace(/\s*FINAL KILL!$/, '') })
  const markerTimes = new Set(tl.markers.map(m => m.t))
  for (const d of tl.deaths) {
    if (d.final || d.disconnected || markerTimes.has(d.t)) continue
    const line = tl.chat.find(l => l.t === d.t && l.text.trim().startsWith(d.name))
    moments.push({ t: d.t, kind: 'kill', text: line ? line.text.trim() : d.name + ' died' })
  }
  for (const l of tl.chat) if (/^\s*TEAM ELIMINATED\s*>/.test(l.text)) moments.push({ t: l.t, kind: 'elim', text: l.text.replace(/^\s*TEAM ELIMINATED\s*>\s*/, '').trim() })
  moments.sort((x, y) => x.t - y.t)
  const shownMoments = () => moments.filter(m => m.kind === 'end' || settings.moments[m.kind] !== false)

  // Filter chips.
  const chips = $('rpChips')
  chips.textContent = ''
  for (const k of Object.keys(KIND_LABEL)) {
    const n = moments.filter(m => m.kind === k).length
    if (!n) continue
    const c = document.createElement('button'); c.type = 'button'; c.className = 'rp-chip rp-chip-' + k
    c.innerHTML = '<i></i><span></span><small></small>'
    c.querySelector('span').textContent = KIND_LABEL[k]
    c.querySelector('small').textContent = n
    c.setAttribute('aria-pressed', String(settings.moments[k] !== false))
    c.addEventListener('click', () => {
      settings.moments = { ...settings.moments, [k]: settings.moments[k] === false }
      c.setAttribute('aria-pressed', String(settings.moments[k] !== false))
      saveSettings(); drawMoments()
    })
    chips.appendChild(c)
  }

  const evList = $('rpEvents')
  let evRows = []
  const markerBox = $('rpMarkers')
  let markerGroups = []
  function drawMoments () {
    const list = shownMoments()
    evList.textContent = ''
    evRows = []
    for (const mk of list) {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'rp-event rp-event-' + mk.kind
      b.innerHTML = '<span class="rp-event-icon"></span><span class="rp-event-time"></span><span class="rp-event-text"></span>'
      b.querySelector('.rp-event-time').textContent = fmt(mk.t)
      b.querySelector('.rp-event-text').textContent = mk.text
      b.addEventListener('click', () => { jump(Math.max(0, mk.t - 5000)); play(true) })
      li.appendChild(b); evList.appendChild(li)
      evRows.push({ t: mk.t, b })
    }
    if (!list.length) evList.innerHTML = '<li class="rp-empty">Nothing to show with these filters.</li>'
    // Timeline: moments closer than ~10 px become one marker with a count.
    markerBox.textContent = ''
    markerGroups = []
    const width = timeline.getBoundingClientRect().width || 800
    for (const mk of list) {
      const g = markerGroups[markerGroups.length - 1]
      if (g && (mk.t - g.last) / tl.duration * width < 10) { g.items.push(mk); g.last = mk.t } else markerGroups.push({ items: [mk], last: mk.t })
    }
    const rank = { end: 4, final: 3, bed: 2, elim: 1, kill: 0 }
    for (const g of markerGroups) {
      const top = g.items.reduce((x, y) => (rank[y.kind] > rank[x.kind] ? y : x))
      g.t = g.items[0].t
      const d = document.createElement('div')
      d.className = 'rp-marker rp-marker-' + top.kind
      d.style.left = (g.t / tl.duration * 100) + '%'
      if (g.items.length > 1) { const n = document.createElement('b'); n.textContent = g.items.length; d.appendChild(n); d.classList.add('is-group') }
      markerBox.appendChild(d)
    }
  }
  /** Jump to a time with a quick dip to black, so the cut reads as a cut. */
  function jump (t) {
    const f = $('rpFade')
    f.classList.remove('is-on'); void f.offsetWidth; f.classList.add('is-on')
    seek(t)
  }
  function stepMoment (dir) {
    const list = shownMoments()
    if (!list.length) return toast('No moments to jump to')
    // Each moment is watched from 5 s before it.
    const target = dir > 0 ? list.find(m => m.t - 5000 > now + 600) : [...list].reverse().find(m => m.t - 5000 < now - 1500)
    if (!target) return toast(dir > 0 ? 'No more moments' : 'No earlier moments')
    jump(Math.max(0, target.t - 5000))
    toast(fmt(target.t) + ' · ' + target.text.slice(0, 60))
  }
  window.addEventListener('resize', () => drawMoments())

  // --- Chat and kill feed ---
  const chatBox = $('rpChat')
  const feedBox = $('rpFeed')
  const feedTimes = new Set([...tl.deaths.map(d => d.t), ...tl.markers.map(m => m.t)])
  const feed = tl.chat.filter(l => feedTimes.has(l.t) && !/^\s*$/.test(l.text) && !/^(VICTORY|GAME OVER)/i.test(l.text.trim()))
  const lineEl = (l) => {
    const line = document.createElement('div')
    for (const seg of l.segs || [{ text: l.text }]) {
      const span = document.createElement(seg.bold ? 'b' : 'span')
      span.textContent = seg.text
      if (seg.color) span.style.color = seg.color
      line.appendChild(span)
    }
    return line
  }
  const lastIndex = (arr, t) => { let lo = 0; let hi = arr.length - 1; let i = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { i = m; lo = m + 1 } else hi = m - 1 } return i }
  // Lines are kept by index: only new lines are added (and animate in) and
  // old ones are removed, so nothing already on screen redraws or flashes.
  function syncLines (box, list, from, to, t, maxAge, make, style) {
    const keep = new Set()
    for (let k = from; k <= to; k++) if (k >= 0 && t - list[k].t <= maxAge && t >= list[k].t) keep.add(k)
    for (const el of [...box.children]) if (!keep.has(+el.dataset.k)) el.remove()
    const have = new Set([...box.children].map(el => +el.dataset.k))
    for (const k of keep) {
      if (have.has(k)) continue
      const line = make(list[k]); line.dataset.k = String(k)
      const next = [...box.children].find(el => +el.dataset.k > k)
      box.insertBefore(line, next || null)
    }
    if (style) for (const el of box.children) style(el, list[+el.dataset.k])
  }
  function showChat (t) {
    const i = lastIndex(tl.chat, t)
    syncLines(chatBox, tl.chat, i - 9, i, t, 10000, (c) => { const l = lineEl(c); l.className = 'rp-chat-line'; return l },
      (el, c) => el.classList.toggle('is-old', t - c.t > 9000))
    const j = lastIndex(feed, t)
    syncLines(feedBox, feed, j - 4, j, t, 6000, (c) => {
      const l = lineEl(c); l.className = 'rp-feed-line'
      if (/FINAL KILL!/.test(c.text)) l.classList.add('is-final')
      if (/BED DESTRUCTION/.test(c.text)) l.classList.add('is-bed')
      return l
    })
  }

  // --- Clock ---
  let now = 0
  let playing = false
  let speed = 1
  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]
  const playBtn = $('rpPlay')
  function play (on) {
    playing = on
    if (playing && now >= tl.duration) seek(0)
    playBtn.innerHTML = playing ? ICON.pause : ICON.play
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    playBtn.setAttribute('aria-pressed', String(playing))
  }
  function seek (t) {
    now = Math.max(0, Math.min(tl.duration, t))
    world.seek(now)
  }
  function setSpeed (s) {
    speed = s
    $('rpSpeed').textContent = s + '×'
    for (const b of $('rpSpeedMenu').children) b.setAttribute('aria-checked', String(Number(b.dataset.speed) === s))
    toast(s + '× speed' + (s > 2 && settings.volume > 0 ? ' (no sound above 2×)' : ''))
  }
  playBtn.addEventListener('click', () => play(!playing))
  $('rpBack').addEventListener('click', () => seek(now - 10000))
  $('rpFwd').addEventListener('click', () => seek(now + 10000))
  const speedMenu = $('rpSpeedMenu')
  for (const s of SPEEDS) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.dataset.speed = String(s); b.textContent = s + '×'
    b.addEventListener('click', () => { setSpeed(s); speedMenu.hidden = true; $('rpSpeed').setAttribute('aria-expanded', 'false') })
    speedMenu.appendChild(b)
  }
  $('rpSpeed').addEventListener('click', (e) => { e.stopPropagation(); speedMenu.hidden = !speedMenu.hidden; $('rpSpeed').setAttribute('aria-expanded', String(!speedMenu.hidden)) })
  $('rpSound').addEventListener('click', () => {
    if (settings.volume > 0) { settings.lastVolume = settings.volume; settings.volume = 0 } else settings.volume = settings.lastVolume || 0.7
    saveSettings(); applySettings()
    toast(settings.volume > 0 ? 'Sound on' : 'Sound off')
  })
  $('rpSettingsBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('rpSettings'); p.hidden = !p.hidden; $('rpSettingsBtn').setAttribute('aria-pressed', String(!p.hidden)) })
  $('rpSettings').addEventListener('click', (e) => e.stopPropagation())
  document.addEventListener('click', () => {
    speedMenu.hidden = true; $('rpSpeed').setAttribute('aria-expanded', 'false')
    $('rpSettings').hidden = true; $('rpSettingsBtn').setAttribute('aria-pressed', 'false')
  })
  const help = $('rpHelp')
  $('rpHelpBtn').addEventListener('click', (e) => { e.stopPropagation(); help.hidden = !help.hidden })
  $('rpHelpBtn').addEventListener('click', () => { if (!help.hidden) renderBindings($('rpKeys'), binds) })
  help.addEventListener('click', () => { help.hidden = true })
  help.querySelector('.rp-help-box').addEventListener('click', (e) => e.stopPropagation())
  $('rpFullBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {})
  })

  // --- Timeline (drag to scrub, hover to preview) ---
  const timeline = $('rpTimeline')
  timeline.setAttribute('aria-valuemax', String(Math.round(tl.duration / 1000)))
  const hover = $('rpHover')
  const tAt = (x) => { const b = timeline.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - b.left) / b.width)) * tl.duration }
  let scrubbing = false; let wasPlaying = false
  timeline.addEventListener('pointerdown', (e) => {
    scrubbing = true; wasPlaying = playing; play(false)
    timeline.setPointerCapture(e.pointerId); timeline.classList.add('is-dragging')
    seek(tAt(e.clientX))
  })
  timeline.addEventListener('pointermove', (e) => {
    const t = tAt(e.clientX)
    if (scrubbing) seek(t)
    const b = timeline.getBoundingClientRect()
    hover.style.left = Math.max(60, Math.min(b.width - 60, e.clientX - b.left)) + 'px'
    // The nearest marker, if the pointer is close to one.
    let near = null
    for (const g of markerGroups) if (Math.abs(g.t - t) / tl.duration * b.width < 8) near = g
    hover.innerHTML = '<b></b><span></span>'
    hover.firstChild.textContent = fmt(near ? near.t : t)
    hover.lastChild.textContent = !near ? '' : near.items.length > 1 ? near.items.length + ' moments: ' + near.items.map(m => m.text.split(' ')[0]).join(', ') : near.items[0].text
  })
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; timeline.classList.remove('is-dragging'); if (wasPlaying) play(true) }
  timeline.addEventListener('pointerup', (e) => {
    // A click right on a marker jumps to just before it.
    const t = tAt(e.clientX); const b = timeline.getBoundingClientRect()
    const mk = markerGroups.find(g => Math.abs(g.t - t) / tl.duration * b.width < 6)
    if (mk && !wasPlaying) { jump(Math.max(0, mk.t - 5000)) }
    endScrub()
  })
  timeline.addEventListener('pointercancel', endScrub)

  // --- Keyboard ---
  const cyclePlayer = (dir) => {
    const live = rows.filter(r => r.all.some(x => x.present))
    if (!live.length) return
    const cur = cam.model ? live.findIndex(r => r.all.includes(cam.model)) : -1
    const r = live[(cur + dir + live.length) % live.length]
    cam.setMode(cam.mode === 'eyes' ? 'eyes' : 'follow', currentModel(r))
  }
  const modeBtn = (m) => modeBtns.find(b => b.dataset.mode === m)
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (recorder.active) { if (e.code === 'Escape') recorder.cancel(); return }
    if (e.code === 'Escape') {
      e.preventDefault()
      if (!help.hidden) help.hidden = true
      else if (!$('rpChatLog').hidden) toggleChatLog(false)
      else if (tmap.mode === 'full') setMap('mini')
      else cam.setMode('free')
      return
    }
    // 1-9 and 0: jump to 10%...90% and the start, like a video.
    const digit = /^Digit(\d)$/.exec(e.code)
    if (digit && !e.shiftKey) { jump(tl.duration * Number(digit[1]) / 10); return }
    const a = binds.action(e.code)
    if (!a) return
    const big = e.shiftKey ? 30000 : 0
    switch (a) {
      case 'play': e.preventDefault(); play(!playing); break
      case 'back5': e.preventDefault(); seek(now - (big || 5000)); break
      case 'fwd5': e.preventDefault(); seek(now + (big || 5000)); break
      case 'back10': seek(now - (big || 10000)); break
      case 'fwd10': seek(now + (big || 10000)); break
      case 'slower': setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]); break
      case 'faster': setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]); break
      case 'prevMoment': stepMoment(-1); break
      case 'nextMoment': stepMoment(1); break
      case 'follow': modeBtn('follow').click(); break
      case 'eyes': modeBtn('eyes').click(); break
      case 'overview': modeBtn(cam.mode === 'overview' ? 'free' : 'overview').click(); break
      case 'next': cyclePlayer(1); break
      case 'prev': cyclePlayer(-1); break
      case 'map': cycleMap(); break
      case 'hitboxes': toggleHitboxes(); break
      case 'chat': e.preventDefault(); toggleChatLog(); break
      case 'perf': perf.hidden = !perf.hidden; break
      case 'share': copyShareLink(); break
      case 'clipStart': markClip('from'); break
      case 'clipEnd': markClip('to'); break
      case 'help': e.preventDefault(); help.hidden = !help.hidden; if (!help.hidden) renderBindings($('rpKeys'), binds); break
    }
  })
  function toggleHitboxes () {
    settings.hitboxes = !settings.hitboxes
    saveSettings(); applySettings()
    toast(settings.hitboxes ? 'Hitboxes and reach on' : 'Hitboxes off')
  }
  $('rpHitBtn').addEventListener('click', toggleHitboxes)
  $('rpKeysReset').addEventListener('click', (e) => { e.stopPropagation(); binds.reset(); renderBindings($('rpKeys'), binds) })
  binds.onChange = () => setMap(tmap.mode)

  // --- Performance stats (`) ---
  const perf = $('rpPerf')
  let perfFrames = 0; let perfAt = performance.now(); let perfMs = 0
  function updatePerf (ts, ms) {
    perfFrames++; perfMs += ms
    if (perf.hidden || ts - perfAt < 500) return
    const fps = perfFrames * 1000 / (ts - perfAt)
    const info = renderer.info.render
    perf.textContent = [
      Math.round(fps) + ' fps · ' + (perfMs / perfFrames).toFixed(1) + ' ms a frame',
      info.calls + ' draw calls · ' + Math.round(info.triangles / 1000) + 'k triangles',
      blocks.meshes.size + ' map pieces' + (blocks.left > 0 && blocks.left !== Infinity ? ' (' + blocks.left + ' to build)' : ''),
      renderer.domElement.width + '×' + renderer.domElement.height + ' px · view ' + settings.view + ' blocks'
    ].join('\n')
    perfFrames = 0; perfMs = 0; perfAt = ts
  }

  // --- Chat history (T): every line so far, click a time to go there ---
  const chatLog = $('rpChatLog')
  const chatLogList = $('rpChatLogList')
  let chatLogAt = -2
  let chatLogQuery = ''
  function toggleChatLog (on = chatLog.hidden) {
    chatLog.hidden = !on
    chatLogAt = -2
    if (on) { renderChatLog(true); setTimeout(() => $('rpChatSearch').focus({ preventScroll: true }), 0) }
  }
  function renderChatLog (force) {
    const i = lastIndex(tl.chat, now)
    if (!force && i === chatLogAt) return
    chatLogAt = i
    const q = chatLogQuery.toLowerCase()
    const stick = chatLogList.scrollHeight - chatLogList.scrollTop - chatLogList.clientHeight < 40
    chatLogList.textContent = ''
    const lines = []
    for (let k = i; k >= 0 && lines.length < 600; k--) if (!q || tl.chat[k].text.toLowerCase().includes(q)) lines.push(tl.chat[k])
    lines.reverse()
    for (const l of lines) {
      const row = document.createElement('div'); row.className = 'rp-log-line'
      const tb = document.createElement('button'); tb.type = 'button'; tb.textContent = fmt(l.t)
      tb.title = 'Go to ' + fmt(l.t)
      tb.addEventListener('click', () => { jump(Math.max(0, l.t - 3000)) })
      const text = lineEl(l); text.className = 'rp-log-text'
      row.append(tb, text)
      chatLogList.appendChild(row)
    }
    if (!lines.length) chatLogList.innerHTML = '<div class="rp-empty">No chat yet.</div>'
    if (force || stick) chatLogList.scrollTop = chatLogList.scrollHeight
  }
  $('rpChatSearch').addEventListener('input', (e) => { chatLogQuery = e.target.value.trim(); renderChatLog(true) })
  $('rpChatSearch').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggleChatLog(false) } })
  $('rpChatLogClose').addEventListener('click', () => toggleChatLog(false))
  $('rpChatBtn').addEventListener('click', () => toggleChatLog())

  // --- What each player is doing when they aren't drawn ---
  function statusOf (r) {
    if (r.all.some(x => x.present)) return [null, '']
    let d = null
    for (const x of r.deaths) if (x.t <= now) d = x
    if (d && d.final) return ['eliminated', 'eliminated']
    if (d && d.disconnected) return ['disconnected', 'left']
    if (d && now - d.t < 5500) return ['dead', 'respawn ' + Math.max(1, Math.ceil((d.t + 5000 - now) / 1000)) + 's']
    if (now < Math.min(...r.all.map(x => x.track.t[0]))) return ['far', 'not seen yet']
    return ['far', 'out of view']
  }
  function updateStatus () {
    for (const r of rows) {
      const [kind, text] = statusOf(r)
      if (kind !== r.kind || text !== r.text) {
        r.kind = kind; r.text = text
        r.status.hidden = !kind
        r.status.textContent = text
        if (kind) r.status.dataset.kind = kind
        r.btn.classList.toggle('is-gone', !!kind)
        r.btn.title = (r.m.track.name || 'Player') + (kind === 'far' ? ': alive, but too far from the recording player to be in the replay' : kind ? ': ' + text : '') + '. Click to follow.'
      }
      const m = currentModel(r)
      const h = m.track.health.at(now)
      const v = kind === 'eliminated' || kind === 'dead' ? 0 : h == null ? -2 : Math.max(0, Math.min(20, h))
      if (v !== r.hpv) {
        r.hpv = v
        if (v === -2) { r.hp.setAttribute('data-unknown', ''); r.hp.style.setProperty('--hp', '100%'); r.hp.title = 'Health not sent' } else { r.hp.removeAttribute('data-unknown'); r.hp.style.setProperty('--hp', (v / 20 * 100) + '%'); r.hp.title = 'Health ' + (Math.round(v) / 2) + ' hearts' }
      }
    }
    for (const t of teamRows) {
      const broken = t.bedT != null && now >= t.bedT
      t.bed.textContent = broken ? 'bed broken' : 'bed'
      t.bed.classList.toggle('is-broken', broken)
      const alive = t.rows.filter(r => r.kind !== 'eliminated' && r.kind !== 'disconnected').length
      t.alive.textContent = alive + '/' + t.rows.length
    }
    for (const e of evRows) e.b.classList.toggle('is-past', e.t < now)
    // The latest kill or bed, under the timeline.
    const i = lastIndex(tl.markers, now)
    $('rpNow').textContent = i >= 0 && now - tl.markers[i].t < 8000 ? tl.markers[i].text.replace(/\s*FINAL KILL!$/, ' · final kill') : ''
    if (followBox._note && cam.model) {
      const r = rowOf(cam.model)
      followBox._note.textContent = r && r.kind ? '· ' + r.text : ''
    }
  }

  // --- Death screen for the player being watched ---
  const deathBox = $('rpDeath')
  let deathKey = ''
  function updateDeath () {
    const r = (cam.mode === 'follow' || cam.mode === 'eyes') && cam.model ? rowOf(cam.model) : null
    let d = null
    if (r && (r.kind === 'dead' || r.kind === 'eliminated')) for (const x of r.deaths) if (x.t <= now) d = x
    const show = d && now - d.t < (d.final ? 6000 : 5000)
    deathBox.hidden = !show
    if (!show) { deathKey = ''; return }
    const left = Math.max(1, Math.ceil((d.t + 5000 - now) / 1000))
    const key = d.t + ':' + (d.final ? 'f' : left)
    if (key === deathKey) return
    deathKey = key
    const line = tl.chat.find(l => l.t === d.t && l.text.trim().startsWith(d.name))
    deathBox.innerHTML = '<h2></h2><p class="rp-death-why"></p><p class="rp-death-sub"></p>'
    deathBox.querySelector('h2').textContent = d.final ? 'Eliminated' : 'You died!'
    deathBox.querySelector('.rp-death-why').textContent = line ? line.text.trim().replace(/\s*FINAL KILL!$/, '') : (d.name + ' died')
    deathBox.querySelector('.rp-death-sub').textContent = d.final ? 'Final kill · ' + d.name + ' is out of the game' : 'Respawning in ' + left + '…'
    deathBox.classList.toggle('is-final', !!d.final)
  }

  // --- Share a moment: a link to this time, camera and player ---
  function shareLink () {
    const p = new URLSearchParams()
    p.set('t', (now / 1000).toFixed(1))
    if ((cam.mode === 'follow' || cam.mode === 'eyes') && cam.model && cam.model.track.name) { p.set('p', cam.model.track.name); p.set('m', cam.mode) } else {
      const c = camera.position
      p.set('m', cam.mode)
      p.set('c', [c.x, c.y, c.z].map(v => v.toFixed(1)).concat([cam.yaw.toFixed(3), cam.pitch.toFixed(3)]).join(','))
      if (cam.mode === 'overview') p.set('o', [cam.center.x, cam.center.y, cam.center.z, cam.dist].map(v => v.toFixed(1)).join(','))
    }
    return location.origin + location.pathname + location.search + '#' + p.toString()
  }
  async function copyShareLink () {
    const url = shareLink()
    history.replaceState(null, '', url)
    try { await navigator.clipboard.writeText(url); toast('Link to ' + fmt(now) + ' copied') } catch { toast('Link is in the address bar') }
  }
  $('rpShareBtn').addEventListener('click', copyShareLink)
  function applyShared () {
    const h = new URLSearchParams(location.hash.slice(1))
    if (!h.has('t')) return false
    const t = Number(h.get('t')) * 1000
    if (!isFinite(t)) return false
    seek(t)
    const name = (h.get('p') || '').toLowerCase()
    const mode = h.get('m')
    const r = name && rows.find(x => (x.m.track.name || '').toLowerCase() === name)
    if (r) {
      // Let the player list catch up with the jump, then follow them.
      for (const m of models) m.update(now)
      const m = currentModel(r)
      cam.tYaw = cam.yaw = -m.group.rotation.y + Math.PI; cam.tPitch = -0.35
      cam.setMode(mode === 'eyes' ? 'eyes' : 'follow', m)
    } else if (h.get('c')) {
      const [x, y, z, yaw, pitch] = h.get('c').split(',').map(Number)
      if ([x, y, z, yaw, pitch].every(isFinite)) {
        camera.position.set(x, y, z)
        cam.yaw = cam.tYaw = yaw; cam.pitch = cam.tPitch = pitch
        if (mode === 'overview' && h.get('o')) {
          const [cx, cy, cz, dist] = h.get('o').split(',').map(Number)
          if ([cx, cy, cz, dist].every(isFinite)) { cam.setMode('overview'); cam.center.set(cx, cy, cz); cam.dist = cam.tDist = dist; cam.yaw = cam.tYaw = yaw; cam.pitch = cam.tPitch = pitch }
        } else cam.setMode('free')
      }
    }
    return true
  }

  // --- Clips: mark a part, save it for everyone in it, or save it as a video ---
  const range = { from: null, to: null }
  const clipBand = $('rpClipBand')
  const followSel = $('rpClipFollow')
  followSel.textContent = ''
  for (const r of rows) {
    if (!r.m.track.name) continue
    const o = document.createElement('option'); o.value = r.m.track.name; o.textContent = r.m.track.name + (r.team ? ' (' + r.team.team.label + ')' : '')
    followSel.appendChild(o)
  }
  const watchedName = () => (cam.model && (cam.mode === 'follow' || cam.mode === 'eyes') && cam.model.track.name) || ((rows.find(r => r.m.track.self) || { m: { track: {} } }).m.track.name) || ''
  function markClip (which) {
    const t = Math.round(now)
    range[which] = t
    if (range.from != null && range.to != null && range.to < range.from) { const x = range.from; range.from = range.to; range.to = x }
    if (watchedName()) followSel.value = watchedName()
    drawRange()
    toast((which === 'from' ? 'Clip starts at ' : 'Clip ends at ') + fmt(t))
  }
  function drawRange () {
    const ok = range.from != null && range.to != null
    clipBand.hidden = range.from == null && range.to == null
    const a = range.from != null ? range.from : range.to
    const b = range.to != null ? range.to : range.from
    clipBand.style.left = (a / tl.duration * 100) + '%'
    clipBand.style.width = Math.max(0.3, (b - a) / tl.duration * 100) + '%'
    $('rpClipFrom').textContent = range.from != null ? fmt(range.from) : '–'
    $('rpClipTo').textContent = range.to != null ? fmt(range.to) : '–'
    const len = ok ? range.to - range.from : 0
    $('rpClipLen').textContent = ok ? Math.round(len / 1000) + ' s' : 'Mark a start and an end'
    const tooLong = len > 60000; const tooShort = ok && len < 2000
    $('rpClipLen').classList.toggle('is-bad', tooLong || tooShort)
    $('rpClipSave').disabled = !ok || tooLong || tooShort || !REPLAY_ID || !getKey()
    $('rpClipVideo').disabled = !ok || len > 180000 || len < 1000 || !recorder.supported
    $('rpClipNote').textContent = !REPLAY_ID ? 'Saving needs the whole game opened from the tracker. Videos work anywhere.'
      : tooLong ? 'A saved clip can be up to 60 seconds.' : tooShort ? 'A clip needs at least 2 seconds.'
        : !recorder.supported ? 'This browser can\'t record video. Try Chrome or Edge.' : ''
  }
  $('rpClipIn').addEventListener('click', () => markClip('from'))
  $('rpClipOut').addEventListener('click', () => markClip('to'))
  $('rpClipLast').addEventListener('click', () => { range.to = Math.round(now); range.from = Math.max(0, range.to - 20000); if (watchedName()) followSel.value = watchedName(); drawRange() })
  $('rpClipClear').addEventListener('click', () => { range.from = range.to = null; drawRange() })
  $('rpClipPlay').addEventListener('click', () => { if (range.from != null) { jump(range.from); play(true) } })
  $('rpClipSave').addEventListener('click', async () => {
    const btn = $('rpClipSave')
    btn.disabled = true; btn.textContent = 'Cutting the clip…'
    try {
      const res = await fetch(`${BACKEND}/replays/${encodeURIComponent(REPLAY_ID)}/site-clips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-key': getKey() },
        body: JSON.stringify({ from: range.from, to: range.to, title: $('rpClipTitle').value.trim(), follow: followSel.value || undefined })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Couldn\'t save the clip (' + res.status + ')')
      toast('Clip saved')
      $('rpClipTitle').value = ''
      loadClips()
    } catch (err) { $('rpClipNote').textContent = err.message } finally { btn.textContent = 'Save clip'; drawRange() }
  })

  // Clips already made from this game.
  async function loadClips () {
    const box = $('rpClipList')
    if (!REPLAY_ID || !getKey()) { box.innerHTML = '<li class="rp-empty">Open the game from the tracker to see its clips.</li>'; return }
    try {
      const res = await fetch(`${BACKEND}/replays/${encodeURIComponent(REPLAY_ID)}/clips`, { headers: { 'x-admin-key': getKey() } })
      if (!res.ok) throw new Error()
      const { clips = [] } = await res.json()
      box.textContent = ''
      if (!clips.length) box.innerHTML = '<li class="rp-empty">No clips from this game yet.</li>'
      for (const c of clips) {
        const start = Math.max(0, (c.at || 0) - (c.markAt || 0))
        const li = document.createElement('li'); li.className = 'rp-cliprow'
        const b = document.createElement('button'); b.type = 'button'; b.className = 'rp-event rp-event-' + (c.kind === 'bed' ? 'bed' : c.kind === 'manual' ? 'clip' : 'final')
        b.innerHTML = '<span class="rp-event-icon"></span><span class="rp-event-time"></span><span class="rp-event-text"></span>'
        b.querySelector('.rp-event-time').textContent = fmt(start)
        const what = c.title || (c.kind === 'bed' ? 'Bed break · ' + (c.victim || '') : c.kind === 'final' ? 'Final kill · ' + (c.victim || '') : 'Clip' + (c.people && c.people.length ? ' · ' + c.people.slice(0, 2).map(p => p.name).join(', ') : ''))
        b.querySelector('.rp-event-text').textContent = what + ' · ' + Math.round((c.durationMs || 0) / 1000) + ' s'
        b.title = 'Watch this part and mark it'
        b.addEventListener('click', () => { range.from = start; range.to = Math.min(tl.duration, start + (c.durationMs || 15000)); drawRange(); jump(start); play(true) })
        const open = document.createElement('a'); open.className = 'rp-clip-open'; open.href = 'replay.html?clip=' + encodeURIComponent(c.id); open.textContent = 'Open'; open.target = '_blank'; open.rel = 'noopener'
        li.append(b, open)
        box.appendChild(li)
      }
    } catch { box.innerHTML = '<li class="rp-empty">Couldn\'t load the clips.</li>' }
  }

  // Saving a video.
  const recBox = $('rpRec')
  recorder = new Recorder({
    renderer, camera, sounds, backend: BACKEND, key: getKey(),
    viewer: {
      seek, play: (on) => play(on), now: () => now, ready: () => mapReady && blocks.left === 0, resize,
      drawOverlay: (ctx, w, h) => drawOverlay(ctx, w, h)
    },
    onState: (text, p, done) => {
      recBox.hidden = !text
      if (text) { $('rpRecText').textContent = text; $('rpRecBar').style.setProperty('--p', Math.round((p || 0) * 100) + '%') }
      document.documentElement.classList.toggle('rp-recording', !!text)
      if (!text) { applySettings(); if (done) toast(done) }
    }
  })
  $('rpRecCancel').addEventListener('click', () => { recorder.cancel(); toast('Recording cancelled') })
  $('rpClipVideo').addEventListener('click', () => {
    if (range.from == null || range.to == null) return
    setSpeed(1)
    sounds.volume = settings.volume > 0 ? settings.volume : 0.7
    const title = $('rpClipTitle').value.trim() || [($('rpTitle').textContent || 'Replay').split(' · ')[0], fmt(range.from).replace(':', 'm') + 's'].join(' ')
    recorder.start({ from: range.from, to: range.to, name: title, audible: settings.volume > 0 })
  })

  // Chat and kill feed painted onto the video (the page's own are HTML).
  function drawOverlay (ctx, w, h) {
    const k = h / 1080
    const font = (px, bold) => (bold ? '700 ' : '') + Math.round(px * k) + 'px Consolas, Menlo, monospace'
    const paint = (l, x, y, align) => {
      let width = 0
      for (const seg of l.segs || [{ text: l.text }]) { ctx.font = font(26, seg.bold); width += ctx.measureText(seg.text).width }
      let cx = align === 'right' ? x - width : x
      for (const seg of l.segs || [{ text: l.text }]) {
        ctx.font = font(26, seg.bold)
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(seg.text, cx + 2 * k, y + 2 * k)
        ctx.fillStyle = seg.color || '#ffffff'; ctx.fillText(seg.text, cx, y)
        cx += ctx.measureText(seg.text).width
      }
      return width
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    if (settings.chat) {
      const i = lastIndex(tl.chat, now)
      const lines = []
      for (let j = i; j >= 0 && lines.length < 10 && now - tl.chat[j].t <= 9500; j--) lines.unshift(tl.chat[j])
      const lh = 36 * k
      let y = h - 90 * k - lines.length * lh
      for (const l of lines) {
        ctx.fillStyle = 'rgba(0,0,0,0.42)'
        ctx.font = font(26)
        const wd = Math.min(w * 0.55, (l.segs || [{ text: l.text }]).reduce((s2, seg) => s2 + ctx.measureText(seg.text).width, 0) + 20 * k)
        ctx.fillRect(24 * k, y, wd, lh)
        paint(l, 34 * k, y + lh / 2, 'left')
        y += lh
      }
    }
    if (settings.feed) {
      const j = lastIndex(feed, now)
      let y = 40 * k
      for (let q = Math.max(0, j - 4); q <= j; q++) {
        if (q < 0 || now - feed[q].t > 6000) continue
        ctx.font = font(26)
        const wd = (feed[q].segs || [{ text: feed[q].text }]).reduce((s2, seg) => s2 + ctx.measureText(seg.text).width, 0)
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(w - 40 * k - wd - 20 * k, y, wd + 20 * k, 40 * k)
        paint(feed[q], w - 50 * k, y + 20 * k, 'right')
        y += 46 * k
      }
    }
  }

  // Start just after the cages open, when there's something to see. A clip
  // starts at its start, following the player it's about, and plays.
  const startMark = !clip && tl.chat.find(l => /Protect your bed and destroy/.test(l.text))
  seek(startMark ? startMark.t : 0)
  play(false)
  if (clip) {
    const name = String(clip.follow || '').toLowerCase()
    const r = rows.find(x => (x.m.track.name || '').toLowerCase() === name) || defaultPlayer()
    if (r) { const m = currentModel(r); cam.tYaw = cam.yaw = -m.group.rotation.y + Math.PI; cam.tPitch = -0.35; cam.setMode('follow', m) }
    play(true)
  }
  setSpeed(1)
  $('rpToast').classList.remove('is-on')
  applySettings()
  drawMoments()
  drawRange()
  loadClips()
  if (!clip && applyShared()) play(false)
  window.addEventListener('hashchange', () => applyShared())

  const drawSize = new THREE.Vector2()
  let prevNow = now
  let lastStatus = 0
  let last = performance.now()
  let lastCamSent = 0
  function frame (ts) {
    requestAnimationFrame(frame)
    // Frame cap (not while recording a video).
    if (settings.fps > 0 && !(recorder && recorder.recording) && ts - last < 1000 / settings.fps - 2) return
    const started = performance.now()
    // While recording, game time follows the clock even on slow frames, so the video keeps its length.
    const dt = Math.min(recorder && recorder.recording ? 0.5 : 0.1, (ts - last) / 1000); last = ts
    if (playing && !scrubbing) {
      seek(now + dt * 1000 * speed)
      if (now >= tl.duration) {
        // Clips loop, after a short hold on the last frame.
        if (clip) { play(false); setTimeout(() => { if (!playing && now >= tl.duration) { seek(0); play(true) } }, 1200) } else play(false)
      }
    }
    for (const m of models) m.update(now)
    for (const v of views) v.update(now, camera)
    cam.update(dt)
    cracks.update(now)
    particles.update(now, camera, renderer.getDrawingBufferSize(drawSize).y)
    // Following someone: hear from where they are, not from the camera behind them.
    const ear = (cam.mode === 'follow' || cam.mode === 'eyes') && cam.focus ? cam.focus : camera.position
    // Sounds Hypixel played only to the recorder are heard only from their view.
    sounds.selfView = (cam.mode === 'follow' || cam.mode === 'eyes') && !!(cam.model && cam.model.track && cam.model.track.self)
    sounds.update(prevNow, now, playing, speed, ear)
    prevNow = now
    blocks.tick(ts / 1000)
    tickGlint(ts / 1000)
    if (ts - lastCamSent > 500) { blocks.setCamera(camera.position); lastCamSent = ts }
    hud.update(now, cam.mode === 'eyes' ? cam.model : null)
    renderer.render(scene, camera)
    // Their hand, in a pass of its own over the world (like the game).
    if (cam.mode === 'eyes' && settings.hand && cam.model && cam.model.present && hand.update(cam.model, now, camera.fov, camera.aspect, cam.roll)) {
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(hand.scene, hand.camera)
      renderer.autoClear = true
    }
    if (recorder) recorder.frame()
    tmap.update(now, cam)
    const f = (now / tl.duration * 100) + '%'
    $('rpFill').style.width = f
    $('rpKnob').style.left = f
    timeline.setAttribute('aria-valuenow', String(Math.round(now / 1000)))
    $('rpTime').innerHTML = '<b>' + fmt(now) + '</b> / ' + fmt(tl.duration)
    showChat(now)
    if (ts - lastStatus > 200) { lastStatus = ts; updateStatus(); updateDeath(); if (!chatLog.hidden) renderChatLog(false) }
    updatePerf(ts, performance.now() - started)
  }
  requestAnimationFrame(frame)
  window.__replay = { cracks, tl, seek, play, cam, models, views, particles, sounds, world, blocks, settings, tmap, hud, hand, recorder, binds, moments, shareLink, applyShared, get now () { return now }, ready: () => mapReady && blocks.left === 0 }
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 001.5.86l12-7.5a1 1 0 000-1.72l-12-7.5A1 1 0 007 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.2"/><rect x="14" y="4" width="5" height="16" rx="1.2"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>'
}

function pickFile () {
  const input = $('rpFile')
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0]
    if (!f) return
    $('rpPick').hidden = true
    try { await start(new Uint8Array(await f.arrayBuffer())) } catch (err) { fail(err) }
  })
}

function fail (err) {
  console.error(err)
  setStatus(err && err.message ? err.message : String(err), { error: true })
  $('rpPick').hidden = false
}

async function main () {
  pickFile()
  const params = new URLSearchParams(location.search)
  const id = params.get('id')
  const clipId = params.get('clip')
  const src = params.get('src')
  try {
    if (clipId) {
      const { bytes, details } = await loadFromBackend(clipId, 'clips')
      await start(bytes, details)
    } else if (id) {
      const { bytes, details } = await loadFromBackend(id)
      await start(bytes, details)
    } else if (src && /^[\w./-]+\.mcpr$/.test(src)) {
      // A replay file next to the page (for testing).
      const res = await fetch(src)
      if (!res.ok) throw new Error('Couldn\'t load ' + src)
      await start(await readWithProgress(res, (p) => setStatus('Downloading the replay…', { progress: p })))
    } else {
      setStatus('')
      $('rpPick').hidden = false
    }
  } catch (err) { fail(err) }
}

main()
