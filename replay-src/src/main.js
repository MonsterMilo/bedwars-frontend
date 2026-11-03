// Prism replay viewer: plays a recorded Bed Wars game in 3D in the browser.
// The page (replay.html) holds the controls; this file loads the replay,
// builds the timeline and runs the 3D view.
global.THREE = require('three')
const THREE = global.THREE
const { Viewer } = require('prismarine-viewer/viewer/lib/viewer')
const { readMcpr, buildTimeline } = require('./model')
const { ReplayWorld } = require('./world')
const { PlayerModel, skinUrl } = require('./players')
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
  runViewer(tl, details)
}

function runViewer (tl, details) {
  setStatus('Drawing the map…', { progress: 0 })
  const stage = $('rpStage')
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  stage.appendChild(renderer.domElement)
  const viewer = new Viewer(renderer)
  viewer.setVersion('1.8.8')
  viewer.scene.background = new THREE.Color('#9ec9f5')
  viewer.scene.fog = new THREE.Fog('#9ec9f5', 140, 260)
  viewer.camera.far = 600
  const resize = () => {
    const w = stage.clientWidth; const h = stage.clientHeight
    renderer.setSize(w, h)
    viewer.camera.aspect = w / h
    viewer.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  const world = new ReplayWorld(viewer, tl)
  world.loadAll()
  const sectionsTotal = viewer.world.sectionsOutstanding.size || 1
  // Only the first build of the map shows progress; later jumps redraw
  // in the background.
  const waitMap = setInterval(() => {
    const left = viewer.world.sectionsOutstanding.size
    if (left === 0) { clearInterval(waitMap); setStatus(''); mapReady = true } else setStatus('Drawing the map…', { progress: 1 - left / sectionsTotal })
  }, 150)
  let mapReady = false

  // Players
  const models = []
  for (const tr of tl.tracks.values()) {
    const m = new PlayerModel(tr)
    viewer.scene.add(m.group)
    models.push(m)
  }

  const cam = new ReplayCamera(viewer.camera, renderer.domElement)
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
    teams.get(label).members.push(m)
  }
  const order = ['Red', 'Blue', 'Green', 'Yellow', 'Aqua', 'White', 'Pink', 'Gray']
  const rows = []
  for (const [label, team] of [...teams].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99)) {
    const h = document.createElement('li')
    h.className = 'rp-team'
    h.style.setProperty('--team', team.color)
    h.textContent = label
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
      btn.title = 'Follow ' + (m.track.name || 'this player')
      btn.addEventListener('click', () => {
        const same = cam.follow && cam.follow.model === m
        if (same && cam.follow.mode === 'behind') cam.setFollow(m, 'eyes')
        else if (same) cam.setFollow(null)
        else { cam.yaw = -m.group.rotation.y + Math.PI; cam.pitch = -0.35; cam.setFollow(m, 'behind') }
      })
      li.appendChild(btn)
      list.appendChild(li)
      rows.push({ m, btn })
    }
  }
  if (!tl.tracks.size) list.innerHTML = '<li class="rp-empty">No players in this recording.</li>'
  const followNote = $('rpFollow')
  cam.onFollowChange = (f) => {
    for (const r of rows) r.btn.classList.toggle('is-following', !!f && f.model === r.m)
    followNote.hidden = !f
    if (f) followNote.textContent = (f.mode === 'eyes' ? 'Through the eyes of ' : 'Following ') + (f.model.track.name || '?') + (f.mode === 'eyes' ? ' · click the name again to stop' : ' · click the name again for their view, WASD to fly free')
  }
  if (!tl.self.id || !tl.tracks.has(tl.self.id)) $('rpNoSelf').hidden = false

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
    if (i === chatShown) return
    chatShown = i
    chatBox.textContent = ''
    for (let k = Math.max(0, i - 7); k <= i; k++) {
      const line = document.createElement('div')
      line.className = 'rp-chat-line'
      if (/FINAL KILL!/.test(tl.chat[k].text)) line.classList.add('is-final')
      if (/BED DESTRUCTION/.test(tl.chat[k].text)) line.classList.add('is-bed')
      line.textContent = tl.chat[k].text
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

  let last = performance.now()
  function frame (ts) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts
    if (playing) {
      seek(now + dt * 1000 * speed)
      if (now >= tl.duration) play(false)
    }
    for (const m of models) m.update(now)
    cam.update(dt)
    viewer.update()
    renderer.render(viewer.scene, viewer.camera)
    if (document.activeElement !== scrub) scrub.value = String(Math.round(now))
    $('rpTime').textContent = fmt(now) + ' / ' + fmt(tl.duration)
    showChat(now)
    for (const r of rows) r.btn.classList.toggle('is-dead', !r.m.group.visible && !(cam.follow && cam.follow.model === r.m && cam.follow.mode === 'eyes'))
  }
  requestAnimationFrame(frame)
  window.__replay = { tl, seek, play, cam, models, viewer, get now () { return now }, ready: () => mapReady && viewer.world.sectionsOutstanding.size === 0 }
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
