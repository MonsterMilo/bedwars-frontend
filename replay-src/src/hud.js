// Things drawn over the players in the 3D view:
//   - hitboxes the way Minecraft's F3+B draws them (the box, a red line at
//     eye height, a blue line where they look)
//   - reach on each hit: how far the hitter's eyes were from the edge of
//     the other player's hitbox when the hit landed
//   - potion timers over each head (effects.js)
const THREE = require('three')
const { effectIntervals, effectsAt, clock } = require('./effects')

const REACH_SHOW_MS = 1400

/** Every hit between two players: [{ t, by, on, reach }], by time. */
function findHits (models) {
  const hits = []
  for (const victim of models) {
    const tr = victim.track
    for (const t of tr.hurts) {
      const v = tr.stateAt(t - 50)
      if (!v) continue
      let best = null
      for (const a of models) {
        if (a === victim || (a.track.team && tr.team && a.track.team.label === tr.team.label)) continue
        // The swing that made the hit comes a little before the hurt.
        const sw = a.track.lastBefore(a.track.swings, t + 60)
        if (!(t + 60 - sw <= 250)) continue
        const s = a.track.stateAt(sw)
        if (!s) continue
        const reach = reachOf(s, v)
        // A melee hit faces the other player; anything further than this
        // was an arrow, a fireball or the void, not a sword.
        const yaw = s.head * Math.PI / 180
        const dx = v.x - s.x; const dz = v.z - s.z; const d = Math.hypot(dx, dz)
        const facing = d < 0.8 || (-Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d > 0.5
        if (reach < 4.5 && facing && (!best || reach < best.reach)) best = { t, by: a, on: victim, reach }
      }
      if (best) hits.push(best)
    }
  }
  return hits.sort((a, b) => a.t - b.t)
}

/** Eye of `a` to the nearest point of b's hitbox (0.6 wide, 1.8 tall, 0.1 border). */
function reachOf (a, b) {
  const ex = a.x; const ey = a.y + 1.62; const ez = a.z
  const h = 0.3 + 0.1
  const cx = Math.max(b.x - h, Math.min(b.x + h, ex))
  const cy = Math.max(b.y - 0.1, Math.min(b.y + 1.9, ey))
  const cz = Math.max(b.z - h, Math.min(b.z + h, ez))
  return Math.hypot(ex - cx, ey - cy, ez - cz)
}

/** A sprite whose canvas is redrawn when its lines change. */
function canvasSprite (w, h, scale) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.renderOrder = 11
  s.scale.set(w / h * scale, scale, 1)
  s.userData = { c, ctx: c.getContext('2d'), tex, key: '' }
  return s
}

class Hud {
  constructor (scene, models) {
    this.scene = scene
    this.models = models
    this.hitboxes = false
    this.timers = true
    this.hits = findHits(models)
    this.per = new Map()
    for (const m of models) {
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 1.8, 0.6)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: true })
      )
      const eye = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 0.01, 0.6)), new THREE.LineBasicMaterial({ color: 0xff3030 }))
      const lookGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 2], 3))
      const look = new THREE.Line(lookGeo, new THREE.LineBasicMaterial({ color: 0x3060ff }))
      const g = new THREE.Group()
      g.add(box, eye, look)
      g.visible = false
      scene.add(g)
      const fx = canvasSprite(256, 128, 0.5)
      fx.visible = false
      m.group.add(fx)
      const reach = canvasSprite(192, 56, 0.28)
      reach.visible = false
      scene.add(reach)
      this.per.set(m, { g, box, eye, look, fx, reach, effects: effectIntervals(m.track) })
    }
  }

  update (now, viewer) {
    for (const m of this.models) {
      const p = this.per.get(m)
      const s = m.present && m.state
      const shown = s && m.group.visible
      // Hitbox.
      p.g.visible = !!(this.hitboxes && shown)
      if (p.g.visible) {
        const sneak = m.pose.position.y < 0
        const hgt = sneak ? 1.5 : 1.8
        p.g.position.copy(m.group.position)
        p.box.scale.y = hgt / 1.8
        p.box.position.y = hgt / 2
        p.eye.position.y = sneak ? 1.54 : 1.62
        const yaw = s.head * Math.PI / 180; const pitch = s.pitch * Math.PI / 180
        const pos = p.look.geometry.attributes.position
        const ey = p.eye.position.y
        pos.setXYZ(0, 0, ey, 0)
        pos.setXYZ(1, -Math.sin(yaw) * Math.cos(pitch) * 2, ey - Math.sin(pitch) * 2, Math.cos(yaw) * Math.cos(pitch) * 2)
        pos.needsUpdate = true
      }
      // Potion timers, above the name tag (not over the player we see through).
      const list = this.timers && shown && m !== viewer ? effectsAt(p.effects, now) : []
      p.fx.visible = list.length > 0
      if (p.fx.visible) {
        const lines = list.slice(0, 4)
        const key = lines.map(e => e.name + clock(e.left)).join('|')
        p.fx.position.y = (m.tag.position.y || 2.2) + 0.12 + lines.length * 0.11
        if (key !== p.fx.userData.key) {
          p.fx.userData.key = key
          drawEffects(p.fx, lines)
        }
      }
      p.reach.visible = false
    }
    // Reach numbers over whoever was just hit.
    if (this.hitboxes) {
      let i = lastIndexBy(this.hits, now)
      const seen = new Set()
      for (; i >= 0 && now - this.hits[i].t < REACH_SHOW_MS; i--) {
        const h = this.hits[i]
        if (seen.has(h.on)) continue
        seen.add(h.on)
        const p = this.per.get(h.on)
        if (!h.on.present || !h.on.group.visible) continue
        const key = h.t + ''
        if (p.reach.userData.key !== key) { p.reach.userData.key = key; drawReach(p.reach, h.reach) }
        const age = (now - h.t) / REACH_SHOW_MS
        p.reach.visible = true
        p.reach.material.opacity = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25
        p.reach.position.set(h.on.group.position.x, h.on.group.position.y + 1.1 + age * 0.5, h.on.group.position.z)
      }
    }
  }

  /** The latest hit `model` landed or took before t (for the follow bar). */
  lastHit (model, t) {
    for (let i = lastIndexBy(this.hits, t); i >= 0 && t - this.hits[i].t < 4000; i--) if (this.hits[i].by === model) return this.hits[i]
    return null
  }
}

function drawEffects (sprite, lines) {
  const { c, ctx, tex } = sprite.userData
  const lh = 30
  const h = lines.length * lh + 8
  ctx.clearRect(0, 0, c.width, c.height)
  const top = c.height - h
  ctx.font = '700 22px "Segoe UI", Arial, sans-serif'
  let w = 0
  for (const e of lines) w = Math.max(w, ctx.measureText(e.name + '  ' + clock(e.left)).width)
  w = Math.min(c.width, w + 30)
  const x0 = (c.width - w) / 2
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(x0, top, w, h)
  ctx.textBaseline = 'middle'
  lines.forEach((e, k) => {
    const y = top + 4 + lh * k + lh / 2
    ctx.fillStyle = e.color
    ctx.fillRect(x0 + 8, y - 6, 6, 12)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(e.name, x0 + 20, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = e.left < 5000 ? '#ff8080' : '#d6dbe6'
    ctx.fillText(clock(e.left), x0 + w - 8, y)
  })
  tex.needsUpdate = true
}

function drawReach (sprite, reach) {
  const { c, ctx, tex } = sprite.userData
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const text = reach.toFixed(2) + ' bl'
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(text, c.width / 2, c.height / 2)
  ctx.fillStyle = reach > 3.05 ? '#ff6b6b' : reach > 2.8 ? '#ffd166' : '#ffffff'
  ctx.fillText(text, c.width / 2, c.height / 2)
  tex.needsUpdate = true
}

function lastIndexBy (arr, t) { let lo = 0; let hi = arr.length - 1; let i = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { i = m; lo = m + 1 } else hi = m - 1 } return i }

module.exports = { Hud, findHits, reachOf }
