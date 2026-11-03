// Prism replay viewer: plays a recorded Bed Wars game in 3D in the browser.
// The page (replay.html) holds the controls; this file loads the replay,
// builds the timeline and runs the 3D view.
global.THREE = require('three')
const THREE = global.THREE
const { BlockRenderer } = require('./renderer')
const { readMcpr, buildTimeline } = require('./model')
const { ReplayWorld } = require('./world')
const { PlayerModel, skinUrl } = require('./players')
const { Mesher } = require('./mesher')
const { ItemFactory } = require('./items')
const { EntityView } = require('./entities')
const { Particles } = require('./particles')
const { Sounds } = require('./sounds')
const { synthesize } = require('./soundsynth')
const { tickGlint } = require('./glint')
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
  for (const tr of tl.tracks.values()) tr.skinUrl = skinUrl(tl.skins.get(tr.uuid))
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
  const particles = new Particles(scene, tl, { colorOf })
  tl.sounds = synthesize(tl)
  const sounds = new Sounds(tl)
  const soundBtn = $('rpSound')
  soundBtn.addEventListener('click', () => {
    sounds.setOn(!sounds.on)
    soundBtn.textContent = sounds.on ? 'Sound on' : 'Sound off'
    soundBtn.setAttribute('aria-pressed', String(sounds.on))
  })

  const cam = new ReplayCamera(camera, renderer.domElement)
  cam.solidAt = (x, y, z) => {
    const v = world.get(Math.floor(x), Math.floor(y), Math.floor(z))
    return v !== 0 && mesher.blockInfo(v).solid
  }
  // Start looking at the middle of the map from above.
  const c = world.center()
  const startY = 95
  cam.lookAt({ x: c.x + 40, y: startY + 45, z: c.z + 40 }, { x: c.x, y: startY - 10, z: c.z })

  // --- Header ---
  const info = tl.info || {}
  const modeName = (info.mode || '').replace(/^BEDWARS_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
  const when = new Date(tl.meta.date || (details && details.playedAt) || Date.now())
  $('rpTitle').textContent = [info.map || (details && details.map), modeName || (details && details.mode)].filter(Boolean).join(' · ') || 'Replay'
  $('rpSub').textContent = when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + fmt(tl.duration)
  document.title = ($('rpTitle').textContent || 'Replay') + ' · Prism Replay'

  // --- Player list, grouped by team ---
  const list = $('rpPlayers')
  list.textContent = ''
  const teams = new Map()
  for (const m of models) {
    const label = m.track.team ? m.track.team.label : 'No team'
    if (!teams.has(label)) teams.set(label, { color: m.track.team ? m.track.team.color : '#bbbbbb', members: [] })
    // Someone who left and rejoined comes back as a new entity: one row each name.
    const members = teams.get(label).members
    const same = m.track.name && members.find(x => x.track.name === m.track.name)
    if (same) { same.others = same.others || []; same.others.push(m) } else members.push(m)
  }
  const order = ['Red', 'Blue', 'Green', 'Yellow', 'Aqua', 'White', 'Pink', 'Gray']
  const rows = []
  const teamBeds = []
  for (const [label, team] of [...teams].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99)) {
    const h = document.createElement('li')
    h.className = 'rp-team'
    h.style.setProperty('--team', team.color)
    h.textContent = label
    const bedT = (tl.bedsBroken.find(b => b.team === label) || {}).t
    const bedNote = document.createElement('span'); bedNote.className = 'rp-team-bed'; bedNote.textContent = 'bed broken'; bedNote.hidden = true
    h.appendChild(bedNote)
    if (bedT != null) teamBeds.push({ t: bedT, el: bedNote })
    list.appendChild(h)
    for (const m of team.members) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rp-player'
      btn.style.setProperty('--team', team.color)
      const name = document.createElement('span'); name.className = 'rp-player-name'; name.textContent = m.track.name || '?'
      btn.append(name)
      if (m.track.self) { const b = document.createElement('span'); b.className = 'rp-badge'; b.textContent = 'you'; btn.append(b) }
      if (m.track.nicked) { const b = document.createElement('span'); b.className = 'rp-badge'; b.textContent = 'nick'; b.title = 'Played under a nick'; btn.append(b) }
      const status = document.createElement('span'); status.className = 'rp-status'; status.hidden = true
      btn.append(status)
      btn.title = 'Follow ' + (m.track.name || 'this player')
      btn.addEventListener('click', () => {
        const all = [m, ...(m.others || [])]
        const target = all.find(x => x.present) || all.filter(x => x.track.t[0] <= now).pop() || m
        const same = cam.follow && all.includes(cam.follow.model)
        if (same && cam.follow.mode === 'behind') cam.setFollow(target, 'eyes')
        else if (same) cam.setFollow(null)
        else { cam.yaw = -target.group.rotation.y + Math.PI; cam.pitch = -0.35; cam.setFollow(target, 'behind') }
      })
      li.appendChild(btn)
      list.appendChild(li)
      rows.push({ m, all: [m, ...(m.others || [])], btn, status, deaths: tl.deaths.filter(d => d.name === m.track.name), kind: null, text: '' })
    }
  }
  if (!tl.tracks.size) list.innerHTML = '<li class="rp-empty">No players in this recording.</li>'
  const followNote = $('rpFollow')
  cam.onFollowChange = (f) => {
    for (const r of rows) r.btn.classList.toggle('is-following', !!f && r.all.includes(f.model))
    followNote.hidden = !f
    if (f) followNote.textContent = (f.mode === 'eyes' ? 'Through the eyes of ' : 'Following ') + (f.model.track.name || '?') + (f.mode === 'eyes' ? ' · click the name again to stop' : ' · click the name again for their view, WASD to fly free')
  }
  if (!tl.self.id || !tl.tracks.has(tl.self.id)) {
    $('rpNoSelf').hidden = false
    setTimeout(() => { $('rpNoSelf').hidden = true }, 12000)
  }

  // --- Timeline ---
  const scrub = $('rpScrub')
  scrub.max = String(tl.duration)
  const markerBox = $('rpMarkers')
  markerBox.textContent = ''
  for (const mk of tl.markers) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rp-marker rp-marker-' + mk.kind
    b.style.left = (mk.t / tl.duration * 100) + '%'
    b.title = fmt(mk.t) + '  ' + mk.text
    b.setAttribute('aria-label', b.title)
    b.addEventListener('click', () => { seek(Math.max(0, mk.t - 5000)); play(true) })
    markerBox.appendChild(b)
  }
  // Event list beside the timeline
  const evList = $('rpEvents')
  evList.textContent = ''
  for (const mk of tl.markers) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rp-event rp-event-' + mk.kind
    const tm = document.createElement('span'); tm.className = 'rp-event-time'; tm.textContent = fmt(mk.t)
    const tx = document.createElement('span'); tx.className = 'rp-event-text'; tx.textContent = mk.text.replace(/\s*FINAL KILL!$/, '')
    b.append(tm, tx)
    b.addEventListener('click', () => { seek(Math.max(0, mk.t - 5000)); play(true) })
    li.appendChild(b); evList.appendChild(li)
  }
  if (!tl.markers.length) evList.innerHTML = '<li class="rp-empty">No final kills or bed breaks.</li>'

  // --- Chat ---
  const chatBox = $('rpChat')
  let chatShown = -1
  const showChat = (t) => {
    let i = -1
    let lo = 0; let hi = tl.chat.length - 1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tl.chat[m].t <= t) { i = m; lo = m + 1 } else hi = m - 1 }
    // Redraw when a line arrives or once a second (for fading).
    const key = i * 1000 + Math.floor(t / 1000)
    if (key === chatShown) return
    chatShown = key
    chatBox.textContent = ''
    for (let k = Math.max(0, i - 9); k <= i; k++) {
      const line = document.createElement('div')
      line.className = 'rp-chat-line'
      // Fade out after 10 s, like the game's chat.
      if (t - tl.chat[k].t > 10000) continue
      for (const seg of tl.chat[k].segs || [{ text: tl.chat[k].text }]) {
        const span = document.createElement(seg.bold ? 'b' : 'span')
        span.textContent = seg.text
        if (seg.color) span.style.color = seg.color
        line.appendChild(span)
      }
      chatBox.appendChild(line)
    }
  }

  // --- Clock ---
  let now = 0
  let playing = false
  let speed = 1
  const playBtn = $('rpPlay')
  function play (on) {
    playing = on
    if (playing && now >= tl.duration) seek(0)
    playBtn.textContent = playing ? 'Pause' : 'Play'
    playBtn.setAttribute('aria-pressed', String(playing))
  }
  function seek (t) {
    now = Math.max(0, Math.min(tl.duration, t))
    world.seek(now)
  }
  playBtn.addEventListener('click', () => play(!playing))
  scrub.addEventListener('input', () => seek(Number(scrub.value)))
  $('rpSpeed').addEventListener('change', (e) => { speed = Number(e.target.value) || 1 })
  $('rpBack').addEventListener('click', () => seek(now - 10000))
  $('rpFwd').addEventListener('click', () => seek(now + 10000))
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) && e.key !== ' ') return
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); play(!playing) } else if (e.key === 'ArrowLeft' || e.key === 'j') seek(now - 5000)
    else if (e.key === 'ArrowRight' || e.key === 'l') seek(now + 5000)
    else if (e.key === 'Escape') cam.setFollow(null)
  })

  // Start just after the cages open, when there's something to see.
  const startMark = tl.chat.find(l => /Protect your bed and destroy/.test(l.text))
  seek(startMark ? startMark.t : 0)
  play(false)

  // What each player is doing when they aren't drawn.
  function statusOf (r) {
    if (r.all.some(x => x.present)) return [null, '']
    let d = null
    for (const x of r.deaths) if (x.t <= now) d = x
    if (d && d.final) return ['eliminated', 'eliminated']
    if (d && d.disconnected) return ['disconnected', 'disconnected']
    if (d && now - d.t < 5500) return ['dead', 'dead · respawn ' + Math.max(1, Math.ceil((d.t + 5000 - now) / 1000)) + 's']
    if (now < Math.min(...r.all.map(x => x.track.t[0]))) return ['far', 'not seen yet']
    return ['far', 'out of view']
  }
  function updateStatus () {
    for (const r of rows) {
      const [kind, text] = statusOf(r)
      if (kind === r.kind && text === r.text) continue
      r.kind = kind; r.text = text
      r.status.hidden = !kind
      r.status.textContent = text
      if (kind) r.status.dataset.kind = kind
      r.btn.classList.toggle('is-gone', !!kind)
      r.btn.title = (r.m.track.name || 'Player') + (kind === 'far' ? ': alive, but too far from the recording player to be in the replay' : kind ? ': ' + text : '') + '. Click to follow.'
    }
    for (const b of teamBeds) b.el.hidden = now < b.t
  }
  const drawSize = new THREE.Vector2()
  let prevNow = now
  let lastStatus = 0
  let last = performance.now()
  let lastCamSent = 0
  function frame (ts) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts
    if (playing) {
      seek(now + dt * 1000 * speed)
      if (now >= tl.duration) play(false)
    }
    for (const m of models) m.update(now)
    for (const v of views) v.update(now, camera)
    cam.update(dt)
    particles.update(now, camera, renderer.getDrawingBufferSize(drawSize).y)
    sounds.update(prevNow, now, playing, speed, camera.position)
    prevNow = now
    blocks.tick(ts / 1000)
    tickGlint(ts / 1000)
    if (ts - lastCamSent > 500) { blocks.setCamera(camera.position); lastCamSent = ts }
    renderer.render(scene, camera)
    if (document.activeElement !== scrub) scrub.value = String(Math.round(now))
    $('rpTime').textContent = fmt(now) + ' / ' + fmt(tl.duration)
    showChat(now)
    if (ts - lastStatus > 200) { lastStatus = ts; updateStatus() }
  }
  requestAnimationFrame(frame)
  window.__replay = { tl, seek, play, cam, models, views, particles, sounds, world, blocks, get now () { return now }, ready: () => mapReady && blocks.left === 0 }
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
