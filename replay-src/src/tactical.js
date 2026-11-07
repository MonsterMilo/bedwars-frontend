// The tactical map: the game from straight above, as a small map in the
// corner or over the whole view. The ground is drawn once from the replay's
// world (the top block of every column, shaded by height, with team wool,
// clay and glass in full colour so bridges stand out) and kept in step with
// every block placed or broken. On top: each base tinted in its team's
// colour, beds (crossed out once broken), players as their skin's face with
// where they look and where they just walked, and recent deaths.
//
//   mini   a square in the top-left corner that moves with the camera
//   full   the whole map over the view: wheel to zoom, drag to move,
//          click a player to follow them, click the ground to fly there,
//          double-click to fit the map again
const TEAM_HEX = { Red: '#ff5555', Blue: '#5555ff', Green: '#55ff55', Yellow: '#ffff55', Aqua: '#55ffff', White: '#ffffff', Pink: '#ff55ff', Gray: '#555555' }
// Blocks the map looks through (plants, torches, signs, barriers).
const CLEAR = new Set([0, 6, 31, 32, 37, 38, 39, 40, 50, 51, 55, 59, 63, 65, 66, 68, 69, 75, 76, 77, 83, 90, 93, 94, 104, 105, 106, 111, 115, 131, 132, 140, 141, 142, 143, 144, 149, 150, 157, 166, 171, 175, 176, 177])
// Building blocks: shown at full colour (bridges, defences, toppers aside).
const BUILT = new Set([35, 159, 95, 160, 49, 121, 5, 24, 172, 20, 65])
const TRAIL_MS = 3000
const DEATH_MS = 7000
const FOV = 70 * Math.PI / 180

function hexRgb (hex) { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

class TacticalMap {
  /**
   * opts: { tl, world, colorOf(state) -> [r,g,b] 0..1, models, headOf(model)
   * -> canvas, onPickModel(model), onPickPoint({ x, y, z }), parent }
   */
  constructor (opts) {
    Object.assign(this, opts)
    this.mode = 'off'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'rp-tmap'
    this.canvas.hidden = true
    this.parent.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')
    this.bounds()
    this.base = document.createElement('canvas')
    this.base.width = this.W; this.base.height = this.H
    this.bctx = this.base.getContext('2d')
    this.img = this.bctx.createImageData(this.W, this.H)
    this.tops = new Int16Array(this.W * this.H).fill(-1)
    this.dirty = new Set()
    this.full = true
    this.view = null // full mode: { cx, cz, scale }
    this.lastDraw = 0
    this.findBeds()
    this.bindPointer()
  }

  // --- The ground ---

  bounds () {
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity
    // Only columns with blocks in them (the game also sends empty void chunks).
    for (const c of this.world.cur.values()) {
      if (!c.sections.some(sec => sec && sec.some(v => v !== 0 && !CLEAR.has(v >> 4)))) continue
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z)
    }
    if (!isFinite(x0)) { x0 = x1 = z0 = z1 = 0 }
    this.x0 = x0 * 16; this.z0 = z0 * 16
    this.W = Math.min(1024, (x1 - x0 + 1) * 16); this.H = Math.min(1024, (z1 - z0 + 1) * 16)
  }

  /** The highest block the map shows at (x, z), as [y, state] or null. */
  top (x, z) {
    const col = this.world.cur.get((x >> 4) + ',' + (z >> 4))
    if (!col) return null
    const lx = x & 15; const lz = z & 15
    for (let sy = 15; sy >= 0; sy--) {
      const s = col.sections[sy]
      if (!s) continue
      for (let y = 15; y >= 0; y--) {
        const v = s[(y << 8) | (lz << 4) | lx]
        if (v && !CLEAR.has(v >> 4)) return [sy * 16 + y, v]
      }
    }
    return null
  }

  /** Recolours one column's pixel (and the shading of its neighbours). */
  paint (px, pz) {
    if (px < 0 || pz < 0 || px >= this.W || pz >= this.H) return
    const t = this.top(this.x0 + px, this.z0 + pz)
    const k = pz * this.W + px
    const d = this.img.data
    if (!t) { this.tops[k] = -1; d[k * 4 + 3] = 0; return }
    const [y, v] = t
    this.tops[k] = y
    let [r, g, b] = this.colorOf(v)
    const built = BUILT.has(v >> 4)
    if (!built) {
      // Terrain: a little towards a cool slate, so the built blocks pop.
      const grey = (r + g + b) / 3
      r = r * 0.72 + grey * 0.12 + 0.07; g = g * 0.72 + grey * 0.12 + 0.09; b = b * 0.72 + grey * 0.12 + 0.13
    }
    // Higher is lighter; a step down from the north-west is a shadow, a
    // drop to the void a bright rim.
    let f = 0.78 + Math.max(-0.25, Math.min(0.3, (y - this.refY) / 45))
    const n = pz > 0 ? this.tops[k - this.W] : -1
    const w = px > 0 ? this.tops[k - 1] : -1
    if (n < 0 || w < 0) f += 0.22
    else if (n > y || w > y) f -= 0.14
    else if (n < y || w < y) f += 0.08
    if (built) f = Math.max(f, 0.95)
    d[k * 4] = Math.min(255, r * f * 255)
    d[k * 4 + 1] = Math.min(255, g * f * 255)
    d[k * 4 + 2] = Math.min(255, b * f * 255)
    d[k * 4 + 3] = 255
  }

  paintAll () {
    // A reference height: the most common ground level.
    const counts = new Map()
    for (let pz = 0; pz < this.H; pz += 3) {
      for (let px = 0; px < this.W; px += 3) {
        const t = this.top(this.x0 + px, this.z0 + pz)
        if (t) counts.set(t[0], (counts.get(t[0]) || 0) + 1)
      }
    }
    this.refY = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 64
    for (let pz = 0; pz < this.H; pz++) for (let px = 0; px < this.W; px++) this.paint(px, pz)
    this.bctx.putImageData(this.img, 0, 0)
    this.full = false
    this.dirty.clear()
  }

  /** A block changed at (x, z): repaint it soon. */
  markDirty (x, z) {
    if (this.full) return
    if (this.dirty.size > 6000) { this.full = true; return }
    this.dirty.add((x - this.x0) + ',' + (z - this.z0))
  }

  flush () {
    if (this.full) { this.paintAll(); return }
    if (!this.dirty.size) return
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity
    for (const key of this.dirty) {
      const [px, pz] = key.split(',').map(Number)
      this.paint(px, pz); this.paint(px + 1, pz); this.paint(px, pz + 1)
      x0 = Math.min(x0, px); x1 = Math.max(x1, px + 1); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz + 1)
    }
    this.dirty.clear()
    x0 = Math.max(0, x0); z0 = Math.max(0, z0)
    if (x1 >= x0 && z1 >= z0) this.bctx.putImageData(this.img, 0, 0, x0, z0, Math.min(this.W, x1 + 1) - x0, Math.min(this.H, z1 + 1) - z0)
  }

  // --- Beds and bases ---

  findBeds () {
    // Bed heads (block 26 with the head bit) in the map as it first was.
    const heads = []
    for (const c of this.tl.columns.values()) {
      c.sections.forEach((s, sy) => {
        if (!s) return
        for (let k = 0; k < 4096; k++) {
          const v = s[k]
          if ((v >> 4) === 26 && (v & 8)) heads.push({ x: c.x * 16 + (k & 15) + 0.5, y: sy * 16 + (k >> 8), z: c.z * 16 + ((k >> 4) & 15) + 0.5 })
        }
      })
    }
    // Each team's bed: the one its players stand nearest a few seconds after the cages open.
    const start = (this.tl.chat.find(l => /Protect your bed and destroy/.test(l.text)) || {}).t ?? 0
    const near = new Map()
    for (const m of this.models) {
      const team = m.track.team && m.track.team.label
      if (!team) continue
      for (const dt of [1500, 4000, 8000]) {
        const s = m.track.stateAt(start + dt)
        if (!s) continue
        if (!near.has(team)) near.set(team, [])
        near.get(team).push(s)
        break
      }
    }
    this.beds = []
    const used = new Set()
    for (const [team, spots] of near) {
      const cx = spots.reduce((a, s) => a + s.x, 0) / spots.length
      const cz = spots.reduce((a, s) => a + s.z, 0) / spots.length
      let best = null; let bd = 40
      for (const h of heads) {
        if (used.has(h)) continue
        const d = Math.hypot(h.x - cx, h.z - cz)
        if (d < bd) { bd = d; best = h }
      }
      if (best) used.add(best)
      const at = best || { x: cx, y: 0, z: cz }
      const broke = this.tl.bedsBroken.find(b => b.team === team)
      this.beds.push({ team, color: TEAM_HEX[team] || '#bbbbbb', x: at.x, z: at.z, real: !!best, brokenAt: broke ? broke.t : null })
    }
  }

  // --- Showing it ---

  setMode (mode) {
    this.mode = mode
    this.canvas.hidden = mode === 'off'
    this.canvas.dataset.mode = mode
    if (mode !== 'off' && this.full) this.paintAll()
    if (mode === 'full' && !this.view) this.fit()
    this.lastDraw = 0
  }

  fit () {
    const r = this.parent.getBoundingClientRect()
    // Fit what's actually drawn, not the whole area the chunks cover.
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity
    for (let pz = 0; pz < this.H; pz++) {
      for (let px = 0; px < this.W; px++) {
        if (this.tops[pz * this.W + px] < 0) continue
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz
      }
    }
    if (!isFinite(x0)) { x0 = 0; x1 = this.W; z0 = 0; z1 = this.H }
    const w = x1 - x0 + 12; const h = z1 - z0 + 12
    const scale = Math.max(0.5, Math.min((r.width - 60) / w, (r.height - 200) / h))
    this.view = { cx: this.x0 + (x0 + x1) / 2, cz: this.z0 + (z0 + z1) / 2 - 20 / scale, scale }
  }

  resize () {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const r = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width * dpr)); const h = Math.max(1, Math.round(r.height * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    return { w: r.width, h: r.height, dpr }
  }

  /** Where the map is looking: centre (world x, z) and pixels per block. */
  frame (cam, w, h) {
    if (this.mode === 'full') return this.view
    const p = cam.focus || cam.camera.position
    return { cx: p.x, cz: p.z, scale: Math.max(1.4, Math.min(3, w / 90)) }
  }

  /** Draws the map for replay time `now` (called every frame; draws ~30 times a second). */
  update (now, cam) {
    if (this.mode === 'off') return
    const ts = performance.now()
    if (ts - this.lastDraw < 33) return
    this.lastDraw = ts
    this.flush()
    const { w, h, dpr } = this.resize()
    const ctx = this.ctx
    const f = this.frame(cam, w, h)
    this.current = { f, w, h }
    const sx = (x) => w / 2 + (x - f.cx) * f.scale
    const sz = (z) => h / 2 + (z - f.cz) * f.scale
    const full = this.mode === 'full'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (full) { ctx.fillStyle = 'rgba(6,8,14,0.94)'; ctx.fillRect(0, 0, w, h) } else { ctx.fillStyle = 'rgba(10,14,24,0.88)'; ctx.fillRect(0, 0, w, h) }

    // Base tints under the ground's own colour.
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.base, sx(this.x0), sz(this.z0), this.W * f.scale, this.H * f.scale)
    ctx.globalCompositeOperation = 'source-atop'
    for (const b of this.beds) {
      const g = ctx.createRadialGradient(sx(b.x), sz(b.z), 0, sx(b.x), sz(b.z), 22 * f.scale)
      const [r, gg, bb] = hexRgb(b.color)
      g.addColorStop(0, `rgba(${r},${gg},${bb},0.34)`); g.addColorStop(0.7, `rgba(${r},${gg},${bb},0.14)`); g.addColorStop(1, `rgba(${r},${gg},${bb},0)`)
      ctx.fillStyle = g
      ctx.fillRect(sx(b.x) - 22 * f.scale, sz(b.z) - 22 * f.scale, 44 * f.scale, 44 * f.scale)
    }
    ctx.globalCompositeOperation = 'source-over'

    // Beds.
    const bs = Math.max(7, 2.2 * f.scale)
    for (const b of this.beds) {
      if (!b.real) continue
      const gone = b.brokenAt != null && now >= b.brokenAt
      const x = sx(b.x); const y = sz(b.z)
      ctx.fillStyle = gone ? 'rgba(20,20,26,0.85)' : b.color
      ctx.strokeStyle = gone ? b.color : 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 1.5
      roundRect(ctx, x - bs, y - bs * 0.7, bs * 2, bs * 1.4, 3); ctx.fill(); ctx.stroke()
      if (gone) {
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x - bs * 0.6, y - bs * 0.45); ctx.lineTo(x + bs * 0.6, y + bs * 0.45); ctx.moveTo(x + bs * 0.6, y - bs * 0.45); ctx.lineTo(x - bs * 0.6, y + bs * 0.45); ctx.stroke()
      }
      if (full) label(ctx, b.team.toUpperCase() + (gone ? ' · NO BED' : ''), x, y - bs - 6, b.color, 10)
    }

    // Recent deaths, fading.
    for (const d of this.tl.deaths) {
      if (d.t > now || now - d.t > DEATH_MS || d.disconnected) continue
      const m = this.models.find(x => x.track.name === d.name)
      const s = m && (m.track.stateAt(d.t - 60) || m.track.stateAt(d.t - 400))
      if (!s) continue
      const a = 1 - (now - d.t) / DEATH_MS
      const x = sx(s.x); const y = sz(s.z); const r = d.final ? 6 : 4.5
      ctx.globalAlpha = a
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4
      cross(ctx, x, y, r)
      ctx.strokeStyle = d.final ? '#ff4d5e' : (m.track.team ? m.track.team.color : '#fff'); ctx.lineWidth = 2
      cross(ctx, x, y, r)
      ctx.globalAlpha = 1
    }

    // The free camera (mini map): where it is and where it looks.
    if (!full && cam.mode !== 'follow' && cam.mode !== 'eyes') {
      const p = cam.camera.position
      cone(ctx, sx(p.x), sz(p.z), Math.atan2(-Math.cos(cam.yaw), -Math.sin(cam.yaw)), 26, 'rgba(255,255,255,0.16)')
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), 3, 0, Math.PI * 2); ctx.fill()
    }

    // Players: trail, view cone, face.
    const followed = (cam.mode === 'follow' || cam.mode === 'eyes') ? cam.model : null
    const size = full ? Math.max(14, Math.min(22, f.scale * 3.4)) : 13
    this.hits = []
    const drawn = []
    for (const m of this.models) {
      if (!m.present || !m.state) continue
      const s = m.state
      const color = m.track.team ? m.track.team.color : '#dddddd'
      // Trail: where they were over the last few seconds.
      ctx.beginPath()
      let first = true
      for (let t = now - TRAIL_MS; t <= now; t += 150) {
        const q = m.track.stateAt(t)
        if (!q) { first = true; continue }
        if (first) ctx.moveTo(sx(q.x), sz(q.z)); else ctx.lineTo(sx(q.x), sz(q.z))
        first = false
      }
      ctx.lineTo(sx(s.x), sz(s.z))
      ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = full ? 2 : 1.5; ctx.stroke(); ctx.globalAlpha = 1
      // Where they look (Minecraft yaw: 0 = south, 90 = west).
      const ang = Math.atan2(Math.cos(s.head * Math.PI / 180), -Math.sin(s.head * Math.PI / 180))
      const [r, g, b] = hexRgb(color)
      cone(ctx, sx(s.x), sz(s.z), ang, Math.max(18, 9 * f.scale), `rgba(${r},${g},${b},${m === followed ? 0.34 : 0.2})`)
      drawn.push({ m, x: sx(s.x), y: sz(s.z), color })
    }
    // Faces on top of every cone, the followed player last.
    drawn.sort((a, b) => (a.m === followed) - (b.m === followed))
    for (const d of drawn) {
      const big = d.m === followed ? size * 1.3 : size
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(d.x - big / 2 - 3, d.y - big / 2 - 3, big + 6, big + 6)
      ctx.fillStyle = d.m === followed ? '#ffffff' : d.color
      ctx.fillRect(d.x - big / 2 - 2, d.y - big / 2 - 2, big + 4, big + 4)
      const head = this.headOf(d.m)
      if (head) ctx.drawImage(head, d.x - big / 2, d.y - big / 2, big, big)
      if (d.m.ghost) { ctx.fillStyle = 'rgba(200,184,255,0.55)'; ctx.fillRect(d.x - big / 2, d.y - big / 2, big, big) }
      if (full) label(ctx, d.m.track.name || '?', d.x, d.y + big / 2 + 12, d.color, 11)
      this.hits.push({ m: d.m, x: d.x, y: d.y, r: big / 2 + 5 })
    }

    if (!full) {
      // North marker.
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(w - 14, 14, 9, 0, Math.PI * 2); ctx.fill()
      label(ctx, 'N', w - 14, 18, '#fff', 10)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily
      ctx.textAlign = 'left'
      ctx.fillText('Scroll to zoom · drag to move · click a player to follow · click the ground to fly there · double-click to fit', 16, h - 132)
      label(ctx, 'N ↑', w - 26, 30, '#fff', 12)
    }
  }

  // --- Mouse ---

  bindPointer () {
    const c = this.canvas
    let drag = null
    const toWorld = (ex, ey) => {
      const r = c.getBoundingClientRect(); const cur = this.current
      if (!cur) return null
      return { x: cur.f.cx + (ex - r.left - cur.w / 2) / cur.f.scale, z: cur.f.cz + (ey - r.top - cur.h / 2) / cur.f.scale, sx: ex - r.left, sy: ey - r.top }
    }
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'full') return
      drag = { x: e.clientX, y: e.clientY, moved: false }
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointermove', (e) => {
      if (this.mode === 'full' && !drag) {
        const p = toWorld(e.clientX, e.clientY)
        c.classList.toggle('is-over-player', !!(p && this.playerAt(p.sx, p.sy)))
      }
      if (!drag) return
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      this.view.cx -= dx / this.view.scale; this.view.cz -= dy / this.view.scale
      drag.x = e.clientX; drag.y = e.clientY
      this.lastDraw = 0
    })
    c.addEventListener('pointerup', (e) => {
      if (this.mode === 'mini') { this.onExpand && this.onExpand(); return }
      const was = drag; drag = null
      if (!was || was.moved) return
      const p = toWorld(e.clientX, e.clientY)
      if (!p) return
      const hit = this.playerAt(p.sx, p.sy)
      if (hit) { this.onPickModel(hit); return }
      const t = this.top(Math.floor(p.x), Math.floor(p.z))
      this.onPickPoint({ x: p.x, y: t ? t[0] + 1 : this.refY, z: p.z })
    })
    c.addEventListener('dblclick', () => { if (this.mode === 'full') { this.fit(); this.lastDraw = 0 } })
    c.addEventListener('wheel', (e) => {
      if (this.mode !== 'full') return
      e.preventDefault()
      const p = toWorld(e.clientX, e.clientY)
      const k = e.deltaY > 0 ? 0.85 : 1.18
      const scale = Math.max(0.5, Math.min(14, this.view.scale * k))
      // Zoom around the pointer.
      if (p) { this.view.cx = p.x - (p.x - this.view.cx) * this.view.scale / scale; this.view.cz = p.z - (p.z - this.view.cz) * this.view.scale / scale }
      this.view.scale = scale
      this.lastDraw = 0
    }, { passive: false })
  }

  playerAt (x, y) {
    let best = null; let bd = Infinity
    for (const h of this.hits || []) {
      const d = Math.hypot(h.x - x, h.y - y)
      if (d <= h.r && d < bd) { bd = d; best = h.m }
    }
    return best
  }
}

function roundRect (ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function cross (ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke()
}
/** A wedge from (x, y) towards angle `ang` (screen radians), `len` px long. */
function cone (ctx, x, y, ang, len, fill) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, len)
  g.addColorStop(0, fill); g.addColorStop(1, fill.replace(/[\d.]+\)$/, '0)'))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, ang - FOV / 2, ang + FOV / 2); ctx.closePath(); ctx.fill()
}
function label (ctx, text, x, y, color, size) {
  ctx.font = `800 ${size}px ` + (getComputedStyle(document.body).fontFamily || 'sans-serif')
  ctx.textAlign = 'center'
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y)
  ctx.fillStyle = color; ctx.fillText(text, x, y)
}

module.exports = { TacticalMap }
