// Saving part of a replay as a video: the 3D view is drawn at 1920x1080,
// the chat and kill feed are painted on top, and the game sounds are mixed
// in, recorded live at 1x while it plays (so the camera can still be moved
// while it records). MP4 where the browser can make one, WebM otherwise.
const W = 1920
const H = 1080

function pickType () {
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  if (typeof MediaRecorder === 'undefined') return null
  return types.find(t => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || ''
}

/**
 * Loads every sound that plays between from and to into WebAudio buffers.
 * Mojang's sound server can't be read by pages, so they come through our
 * backend (/mc-sounds). Returns a Map hash -> AudioBuffer.
 */
async function loadSounds (ctx, sounds, from, to, { backend, key, onProgress }) {
  const out = new Map()
  if (!sounds.map || !key) return out
  const hashes = new Set()
  for (const s of sounds.list) {
    if (s.t < from || s.t > to) continue
    for (const h of sounds.map[s.name] || []) hashes.add(h)
  }
  const list = [...hashes]
  let done = 0
  const work = async () => {
    while (list.length) {
      const h = list.pop()
      try {
        const res = await fetch(`${backend}/mc-sounds/${h}`, { headers: { 'x-admin-key': key } })
        if (res.ok) out.set(h, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch { /* that sound is left out */ }
      done++
      onProgress(done / hashes.size)
    }
  }
  await Promise.all([1, 2, 3, 4, 5, 6].map(work))
  return out
}

class Recorder {
  /**
   * opts: { renderer, camera, sounds, backend, key, viewer: { seek, play, now(),
   * ready(), resize(), drawOverlay(ctx, w, h) }, onState(text, progress) }
   */
  constructor (opts) {
    Object.assign(this, opts)
    this.active = false
  }

  get supported () { return pickType() !== null && !!HTMLCanvasElement.prototype.captureStream }

  async start ({ from, to, name, audible }) {
    if (this.active) return
    this.active = true
    this.cancelled = false
    this.from = from; this.to = to; this.name = name
    const type = pickType()
    this.type = type
    this.onState('Getting the sounds ready…', 0)
    const AC = window.AudioContext || window.webkitAudioContext
    const actx = new AC()
    const dest = actx.createMediaStreamDestination()
    const buffers = await loadSounds(actx, this.sounds, from, to, { backend: this.backend, key: this.key, onProgress: (p) => this.onState('Getting the sounds ready…', p * 0.3) })
    if (this.cancelled) { actx.close(); return }
    this.sounds.out = { ctx: actx, dest, buffers, speakers: audible }
    this.actx = actx

    // Draw at 1080p for the length of the recording.
    this.canvas = document.createElement('canvas')
    this.canvas.width = W; this.canvas.height = H
    this.ctx = this.canvas.getContext('2d')
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(W, H, false)
    this.camera.aspect = W / H
    this.camera.updateProjectionMatrix()
    this.sizeLocked = true

    this.viewer.play(false)
    this.viewer.seek(from)
    // Let the map catch up after the jump before recording starts.
    const t0 = performance.now()
    while (!this.viewer.ready() && performance.now() - t0 < 8000) {
      if (this.cancelled) return this.finish()
      this.onState('Drawing the map…', 0.3)
      await new Promise(r => setTimeout(r, 100))
    }
    if (this.cancelled) return this.finish()

    const stream = this.canvas.captureStream(60)
    for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr)
    this.chunks = []
    this.rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 12e6, audioBitsPerSecond: 160e3 })
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data) }
    this.rec.onstop = () => this.save()
    this.rec.start(500)
    this.recording = true
    this.viewer.seek(from)
    this.viewer.play(true)
  }

  /** Called by the viewer right after each frame is rendered. */
  frame () {
    if (!this.recording) return
    const now = this.viewer.now()
    this.ctx.drawImage(this.renderer.domElement, 0, 0, W, H)
    this.viewer.drawOverlay(this.ctx, W, H)
    const p = Math.max(0, Math.min(1, (now - this.from) / (this.to - this.from)))
    this.onState('Recording ' + Math.round(p * 100) + '% · keep this tab open', 0.3 + p * 0.7)
    if (now >= this.to) { this.recording = false; this.viewer.play(false); this.rec.stop() }
  }

  cancel () {
    this.cancelled = true
    if (this.recording) { this.recording = false; this.chunks = []; try { this.rec.onstop = null; this.rec.stop() } catch { /* stopped */ } }
    this.finish()
  }

  save () {
    if (this.cancelled || !this.chunks.length) return this.finish()
    const mp4 = /mp4/.test(this.type)
    const blob = new Blob(this.chunks, { type: mp4 ? 'video/mp4' : 'video/webm' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (this.name || 'clip').replace(/[^\w .-]+/g, '').trim().slice(0, 60) + (mp4 ? '.mp4' : '.webm')
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
    this.finish(mp4 ? 'Saved the video' : 'Saved the video (WebM: this browser can\'t make MP4)')
  }

  finish (message) {
    this.recording = false
    this.active = false
    this.sounds.out = null
    if (this.actx) { this.actx.close().catch(() => {}); this.actx = null }
    if (this.sizeLocked) { this.sizeLocked = false; this.viewer.resize() }
    this.onState(null, null, message)
  }
}

module.exports = { Recorder }
