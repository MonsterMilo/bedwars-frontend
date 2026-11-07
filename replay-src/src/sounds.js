// Game sounds: the replay holds every sound the server played (footsteps,
// hits, explosions, block breaks, pickups...). They're played from
// Mojang's own sound server, quieter the further they are from the camera,
// only while the replay is playing at up to 2x speed.
const BASE = 'https://resources.download.minecraft.net/'
const MAX_PLAYING = 24
// The recording player's own sounds, relative to everyone else's.
const SELF_LEVEL = 0.35

class Sounds {
  constructor (timeline) {
    this.list = timeline.sounds.filter(s => s.name)
    this.map = null
    this.on = true
    this.volume = 0.7
    this.range = 2 // hearing distance, times Minecraft's (spectating from further away)
    this.playing = new Set()
    this.cursor = 0
    this.selfView = false
    this.out = null // recording: { ctx, dest, buffers, speakers }
    fetch('replay/sounds.json').then(r => r.ok ? r.json() : null).then(m => { this.map = m }).catch(() => {})
  }

  setOn (on) { this.on = on; if (!on) for (const a of this.playing) if (a.pause) a.pause() }

  /** Play everything between the last frame's time and now. */
  update (prev, now, playing, speed, cam) {
    // Find the first sound after `prev`.
    if (now < prev || now - prev > 1000 || !playing) {
      let lo = 0; let hi = this.list.length
      while (lo < hi) { const m = (lo + hi) >> 1; if (this.list[m].t <= now) lo = m + 1; else hi = m }
      this.cursor = lo
      return
    }
    while (this.cursor < this.list.length && this.list[this.cursor].t <= now) {
      const s = this.list[this.cursor++]
      if ((this.on || this.out) && this.map && speed <= 2) this.play(s, cam, speed)
    }
  }

  play (s, cam, speed) {
    const files = this.map[s.name]
    if (!files || this.playing.size >= MAX_PLAYING) return
    // Played only to the recorder: silent unless watching from their view.
    if (s.pov && !this.selfView) return
    const dist = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z)
    // Minecraft: heard up to 16 blocks (more for loud sounds), fading out.
    // The replay stretches that by the hearing range setting.
    // The recorder's own sounds carry only as far as in the game (never
    // stretched by the hearing setting, never extra loud), so they're not
    // heard from across the map when watching someone else.
    const R = s.pov ? 8 : s.self ? 16 : 16 * this.range
    if (s.self) s = { ...s, volume: Math.min(1, s.volume) }
    const v = s.everywhere ? Math.min(1, s.volume) : s.volume > 1 ? Math.max(0, 1 - dist / (R * s.volume)) : s.volume * Math.max(0, 1 - dist / R)
    if (v <= 0.01) return
    const h = files[Math.floor(Math.random() * files.length)]
    const level = Math.min(1, v * this.volume * (s.self ? SELF_LEVEL : 1))
    const rate = Math.max(0.5, Math.min(4, (s.pitch || 1) * speed))
    // Recording a video: through WebAudio, into the recording.
    if (this.out) {
      const buf = this.out.buffers.get(h)
      if (!buf) return
      const { ctx, dest } = this.out
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate
      const gain = ctx.createGain(); gain.gain.value = level
      src.connect(gain); gain.connect(dest)
      if (this.out.speakers) gain.connect(ctx.destination)
      const token = {}
      this.playing.add(token)
      src.onended = () => this.playing.delete(token)
      src.start()
      return
    }
    const a = new Audio(BASE + h.slice(0, 2) + '/' + h)
    a.volume = level
    a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false
    a.playbackRate = rate
    const done = () => this.playing.delete(a)
    a.addEventListener('ended', done); a.addEventListener('error', done)
    this.playing.add(a)
    a.play().catch(done)
  }
}

module.exports = { Sounds }
