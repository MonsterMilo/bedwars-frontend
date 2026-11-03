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

async function loadFromBackend (id) {
  const key = getKey()
  if (!key) throw new Error('This replay needs your tracker key. Open the tracker site, enter your key there, then come back to this page.')
  const headers = { 'x-admin-key': key }
  setStatus('Waking up the server…', { progress: 0 })
  const infoRes = await fetch(`${BACKEND}/replays/${encodeURIComponent(id)}`, { headers })
  if (!infoRes.ok) throw new Error((await infoRes.json().catch(() => ({}))).error || `Couldn't find this replay (${infoRes.status}).`)
  const details = await infoRes.json()
  setStatus('Downloading the replay…', { progress: 0 })
  const res = await fetch(`${BACKEND}/replays/${encodeURIComponent(id)}/file`, { headers })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't download the replay (${res.status}).`)
  const bytes = await readWithProgress(res, (p) => setStatus('Downloading the replay…', { progress: p }))
  return { bytes, details }
}

const tick = () => new Promise(r => setTimeout(r, 0))

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
  const resize = () => {
    const w = stage.clientWidth; const h = stage.clientHeight
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
  const settings = { chat: true, feed: true, names: true, invis: true, particles: true, smooth: true, sensitivity: 1, volume: 0.7, panel: window.innerWidth > 860 }
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) } catch { /* private window */ }
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ } }

  const cam = new ReplayCamera(camera, renderer.domElement)
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
    sounds.setOn(settings.volume > 0)
    $('rp').classList.toggle('is-collapsed', !settings.panel)
    $('rpPanelBtn').setAttribute('aria-pressed', String(settings.panel))
    $('rpSound').innerHTML = settings.volume > 0 ? ICON.sound : ICON.mute
    $('rpSound').setAttribute('aria-pressed', String(settings.volume > 0))
    for (const el of document.querySelectorAll('[data-set]')) {
      const k = el.dataset.set
      if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = String(settings[k])
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
      if (m.track.nicked) { const b = document.createElement('span'); b.className = 'rp-badge'; b.textContent = 'nick'; b.title = 'Played under a nick'; tags.append(b) }
      const status = document.createElement('span'); status.className = 'rp-status'; status.hidden = true
      tags.append(status)
      const hp = document.createElement('span'); hp.className = 'rp-hp'; hp.innerHTML = '<i></i>'
      btn.append(head, name, tags, hp)
      btn.addEventListener('click', () => pickPlayer(row))
      li.appendChild(btn)
      list.appendChild(li)
      const row = { m, all: [m, ...(m.others || [])], btn, status, hp, head, team: tr, deaths: tl.deaths.filter(d => d.name === m.track.name), kind: undefined, text: '', hpv: -1 }
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

  // --- Side panel ---
  $('rpPanelBtn').addEventListener('click', () => { settings.panel = !settings.panel; saveSettings(); applySettings() })
  const tabs = [[$('rpTabPlayers'), $('rpPanePlayers')], [$('rpTabEvents'), $('rpPaneEvents')]]
  for (const [tab, pane] of tabs) {
    tab.addEventListener('click', () => { for (const [t2, p2] of tabs) { t2.setAttribute('aria-selected', String(t2 === tab)); p2.hidden = p2 !== pane } })
  }

  // --- Events list and timeline markers ---
  const evList = $('rpEvents')
  evList.textContent = ''
  const evRows = []
  for (const mk of tl.markers) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rp-event rp-event-' + mk.kind
    b.innerHTML = '<span class="rp-event-icon"></span><span class="rp-event-time"></span><span class="rp-event-text"></span>'
    b.querySelector('.rp-event-time').textContent = fmt(mk.t)
    b.querySelector('.rp-event-text').textContent = mk.text.replace(/\s*FINAL KILL!$/, '')
    b.addEventListener('click', () => { seek(Math.max(0, mk.t - 5000)); play(true) })
    li.appendChild(b); evList.appendChild(li)
    evRows.push({ t: mk.t, b })
  }
  if (!tl.markers.length) evList.innerHTML = '<li class="rp-empty">No final kills or bed breaks.</li>'
  const markerBox = $('rpMarkers')
  for (const mk of tl.markers) {
    const d = document.createElement('div')
    d.className = 'rp-marker rp-marker-' + mk.kind
    d.style.left = (mk.t / tl.duration * 100) + '%'
    markerBox.appendChild(d)
  }

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
  help.addEventListener('click', () => { help.hidden = true })
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
    for (const mk of tl.markers) if (Math.abs(mk.t - t) / tl.duration * b.width < 8) near = mk
    hover.innerHTML = '<b></b><span></span>'
    hover.firstChild.textContent = fmt(near ? near.t : t)
    hover.lastChild.textContent = near ? near.text.replace(/\s*FINAL KILL!$/, ' (final)') : ''
  })
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; timeline.classList.remove('is-dragging'); if (wasPlaying) play(true) }
  timeline.addEventListener('pointerup', (e) => {
    // A click right on a marker jumps to just before it.
    const t = tAt(e.clientX); const b = timeline.getBoundingClientRect()
    const mk = tl.markers.find(m => Math.abs(m.t - t) / tl.duration * b.width < 6)
    if (mk && !wasPlaying) { seek(Math.max(0, mk.t - 5000)) }
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
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key
    if (k === ' ' || k === 'k') { e.preventDefault(); play(!playing) } else if (k === 'ArrowLeft') { e.preventDefault(); seek(now - 5000) } else if (k === 'ArrowRight') { e.preventDefault(); seek(now + 5000) } else if (k === 'j') seek(now - 10000)
    else if (k === 'l') seek(now + 10000)
    else if (k === ',' || k === '<') setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)])
    else if (k === '.' || k === '>') setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)])
    else if (k === 'f') modeBtns.find(b => b.dataset.mode === 'follow').click()
    else if (k === 'v') modeBtns.find(b => b.dataset.mode === 'eyes').click()
    else if (k === 'm') modeBtns.find(b => b.dataset.mode === (cam.mode === 'overview' ? 'free' : 'overview')).click()
    else if (k === 'n') cyclePlayer(1)
    else if (k === 'p') cyclePlayer(-1)
    else if (k === '?' || k === 'h') help.hidden = !help.hidden
    else if (k === 'Escape') { if (!help.hidden) help.hidden = true; else cam.setMode('free') }
  })

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

  // Start just after the cages open, when there's something to see.
  const startMark = tl.chat.find(l => /Protect your bed and destroy/.test(l.text))
  seek(startMark ? startMark.t : 0)
  play(false)
  setSpeed(1)
  $('rpToast').classList.remove('is-on')
  applySettings()

  const drawSize = new THREE.Vector2()
  let prevNow = now
  let lastStatus = 0
  let last = performance.now()
  let lastCamSent = 0
  function frame (ts) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts
    if (playing && !scrubbing) {
      seek(now + dt * 1000 * speed)
      if (now >= tl.duration) play(false)
    }
    for (const m of models) m.update(now)
    for (const v of views) v.update(now, camera)
    cam.update(dt)
    cracks.update(now)
    particles.update(now, camera, renderer.getDrawingBufferSize(drawSize).y)
    sounds.update(prevNow, now, playing, speed, camera.position)
    prevNow = now
    blocks.tick(ts / 1000)
    tickGlint(ts / 1000)
    if (ts - lastCamSent > 500) { blocks.setCamera(camera.position); lastCamSent = ts }
    renderer.render(scene, camera)
    const f = (now / tl.duration * 100) + '%'
    $('rpFill').style.width = f
    $('rpKnob').style.left = f
    timeline.setAttribute('aria-valuenow', String(Math.round(now / 1000)))
    $('rpTime').innerHTML = '<b>' + fmt(now) + '</b> / ' + fmt(tl.duration)
    showChat(now)
    if (ts - lastStatus > 200) { lastStatus = ts; updateStatus() }
  }
  requestAnimationFrame(frame)
  window.__replay = { cracks, tl, seek, play, cam, models, views, particles, sounds, world, blocks, settings, get now () { return now }, ready: () => mapReady && blocks.left === 0 }
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
  const src = params.get('src')
  try {
    if (id) {
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
