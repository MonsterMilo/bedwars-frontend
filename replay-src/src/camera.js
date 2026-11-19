// The replay camera, with four modes:
//   free      fly anywhere: drag to look, WASD to move, E/Q up and down,
//             Shift faster, wheel for speed, double-click to glide somewhere
//   follow    circle a player: drag to go around them, wheel to zoom
//   eyes      see what a player saw
//   overview  the whole map from above: drag to turn, wheel to zoom,
//             WASD to slide across
// Looking, moving and zooming all ease in and out rather than jumping.
const THREE = require('three')

const DEG = Math.PI / 180

const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
const ease = (rate, dt) => 1 - Math.exp(-rate * dt)

class ReplayCamera {
  constructor (camera, dom) {
    this.camera = camera
    this.dom = dom
    camera.rotation.order = 'YXZ'
    this.bob = new THREE.Matrix4(); this.bobInv = new THREE.Matrix4(); this.bobbing = true
    this.armYaw = 0; this.armPitch = 0; this.swayX = 0; this.swayY = 0; this.fovMod = 1; this.lastNow = null; this.lastModel = null
    this.mode = 'free'
    this.model = null
    this.yaw = 0; this.pitch = -0.5 // what we show
    this.tYaw = 0; this.tPitch = -0.5 // where the mouse has asked to look
    this.speed = 12 // blocks per second when flying
    this.sensitivity = 1
    this.smooth = true
    this.vel = new THREE.Vector3()
    this.dist = 6; this.tDist = 6
    this.focus = null // smoothed point the follow camera circles
    this.center = new THREE.Vector3() // overview centre
    this.flyTo = null
    this.keys = new Set()
    this.binds = null // Keybinds
    this.smoothView = true // ease other players' aim in Eyes mode
    this.fov = 70
    this.onChange = () => {}
    this.onClick = () => {}
    this.onDoubleClick = () => {}
    this.onSpeed = () => {}

    let drag = null
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, mouse: e.pointerType === 'mouse' }
      dom.setPointerCapture(e.pointerId)
    })
    // Looking around with the mouse locks the cursor in place (like in
    // game) and lets it go where it was when the button comes up.
    const locked = () => document.pointerLockElement === dom
    const lock = () => {
      if (locked() || !dom.requestPointerLock) return
      try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}) } catch (err) { /* not allowed */ }
    }
    const unlock = () => { if (locked()) document.exitPointerLock() }
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return
      let dx = e.clientX - drag.x; let dy = e.clientY - drag.y
      if (locked()) { dx = e.movementX || 0; dy = e.movementY || 0 }
      drag.x = e.clientX; drag.y = e.clientY
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return
      if (!drag.moved && drag.mouse) lock()
      drag.moved = true
      if (this.mode === 'eyes') this.setMode('follow', this.model) // turning takes you out of their eyes
      const k = 0.0042 * this.sensitivity
      this.tYaw -= dx * k
      this.tPitch = Math.max(-1.55, Math.min(1.55, this.tPitch - dy * k))
      this.flyTo = null
    })
    const end = (e) => {
      if (drag && !drag.moved && e.type === 'pointerup') this.onClick(e.clientX, e.clientY)
      drag = null
      unlock()
    }
    dom.addEventListener('pointerup', end); dom.addEventListener('pointercancel', end)
    dom.addEventListener('dblclick', (e) => this.onDoubleClick(e.clientX, e.clientY))
    dom.addEventListener('wheel', (e) => {
      e.preventDefault()
      const out = e.deltaY > 0
      if (this.mode === 'follow' || this.mode === 'overview') {
        const max = this.mode === 'overview' ? 400 : 40
        this.tDist = Math.max(this.mode === 'overview' ? 20 : 1.5, Math.min(max, this.tDist * (out ? 1.15 : 0.87)))
      } else {
        this.speed = Math.max(2, Math.min(100, this.speed * (out ? 0.85 : 1.18)))
        this.onSpeed(this.speed)
      }
    }, { passive: false })
    // Movement keys go through the viewer's key bindings (keybinds.js).
    const MOVE = ['forward', 'backward', 'left', 'right', 'up', 'down']
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const a = this.binds ? this.binds.action(e.code) : null
      if (a === 'fast' || MOVE.includes(a)) {
        this.keys.add(a)
        this.flyTo = null
        // Moving yourself takes you out of following.
        if ((this.mode === 'follow' || this.mode === 'eyes') && MOVE.includes(a)) this.setMode('free')
      }
    })
    window.addEventListener('keyup', (e) => { const a = this.binds && this.binds.action(e.code); if (a) this.keys.delete(a) })
    window.addEventListener('blur', () => this.keys.clear())
  }

  /** Put the camera at `from`, looking at `to` (no easing). */
  lookAt (from, to) {
    this.camera.position.set(from.x, from.y, from.z)
    const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z
    this.yaw = this.tYaw = Math.atan2(-dx, -dz)
    this.pitch = this.tPitch = Math.atan2(dy, Math.hypot(dx, dz))
    this.vel.set(0, 0, 0)
  }

  /** Switch mode. follow/eyes need a player model. */
  setMode (mode, model = this.model) {
    if ((mode === 'follow' || mode === 'eyes') && !model) mode = 'free'
    const was = this.mode
    this.mode = mode
    this.model = model || null
    if (mode === 'follow' && was !== 'follow') {
      this.focus = null
      if (was === 'eyes' || was === 'free') this.tPitch = Math.max(this.tPitch, -0.6)
      this.tDist = this.dist = Math.max(3, Math.min(10, this.tDist))
    }
    if (mode === 'overview' && was !== 'overview') {
      this.tDist = 140; this.dist = Math.max(this.dist, 30)
      this.tPitch = -0.95
    }
    if (mode === 'free' && was === 'overview') this.tPitch = Math.max(this.tPitch, -0.9)
    this.vel.set(0, 0, 0)
    this.onChange(this)
  }

  /** Glide (in free mode) to look at a point from a few blocks away. */
  glideTo (point) {
    if (this.mode !== 'free') this.setMode('free')
    const back = new THREE.Vector3(Math.sin(this.tYaw), 0.6, Math.cos(this.tYaw)).normalize().multiplyScalar(7)
    this.flyTo = point.clone().add(back)
    const d = point.clone().sub(this.flyTo)
    this.tYaw = Math.atan2(-d.x, -d.z)
    this.tPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
  }

  /**
   * What seeing through their eyes adds, in Minecraft 1.8's own terms:
   * view bobbing (EntityRenderer.setupViewBobbing) for the camera and the
   * hand, the hand trailing behind turns (ItemRenderer.rotateWithPlayerRotations,
   * renderArmYaw/Pitch easing halfway each tick), and the field of view
   * widening while sprinting and narrowing while a bow is drawn
   * (EntityPlayerSP.getFovModifier, eased halfway each tick).
   */
  eyesExtras (st, view) {
    const model = this.model; const tr = model.track; const t = model.now
    // Replay time since the last frame (0 when paused, a snap after a seek).
    const dtr = this.lastNow == null || model !== this.lastModel ? Infinity : t - this.lastNow
    this.lastNow = t; this.lastModel = model
    const settle = (ms) => dtr < 0 || dtr > 400 ? 1 : 1 - Math.pow(0.5, dtr / ms)
    // Bobbing.
    const b = this.bobbing && tr.bobAt ? tr.bobAt(t) : null
    const B = this.bob.identity()
    if (b) {
      const f1 = -b.walk; const f2 = b.yaw; const f3 = b.pitch
      B.multiply(new THREE.Matrix4().makeTranslation(Math.sin(f1 * Math.PI) * f2 * 0.5, -Math.abs(Math.cos(f1 * Math.PI) * f2), 0))
      B.multiply(new THREE.Matrix4().makeRotationZ(Math.sin(f1 * Math.PI) * f2 * 3 * DEG))
      B.multiply(new THREE.Matrix4().makeRotationX(Math.abs(Math.cos(f1 * Math.PI - 0.2) * f2) * 5 * DEG))
      B.multiply(new THREE.Matrix4().makeRotationX(f3 * DEG))
    }
    this.bobInv.copy(B).invert()
    // Hand sway.
    const yaw = view ? view.head : st ? st.head : 0; const pitch = view ? view.pitch : st ? st.pitch : 0
    if (dtr === Infinity || dtr < 0 || dtr > 400) { this.armYaw = yaw; this.armPitch = pitch }
    const k = settle(50)
    this.armYaw += (((yaw - this.armYaw) % 360 + 540) % 360 - 180) * k
    this.armPitch += (pitch - this.armPitch) * k
    this.swayX = (pitch - this.armPitch) * 0.1
    this.swayY = (((yaw - this.armYaw) % 360 + 540) % 360 - 180) * 0.1
    // Field of view.
    let want = 1
    const flags = tr.flags.at(t) || 0
    if (flags & 0x08) want *= 1.15 // sprinting: (0.13 / 0.1 + 1) / 2
    const item = tr.equip[0].at(t)
    if ((flags & 0x10) && item && item.id === 261) {
      let f = (t - tr.flags.since(t)) / 50 / 20
      f = f > 1 ? 1 : f * f
      want *= 1 - f * 0.15
    }
    this.fovMod = dtr === Infinity ? want : this.fovMod + (want - this.fovMod) * settle(50)
  }

  update (dt) {
    const cam = this.camera
    const look = this.smooth ? ease(16, dt) : 1
    this.yaw += wrapPi(this.tYaw - this.yaw) * look
    this.pitch += (this.tPitch - this.pitch) * look
    this.dist += (this.tDist - this.dist) * ease(9, dt)
    const k = this.keys

    if ((this.mode === 'follow' || this.mode === 'eyes') && this.model) {
      const g = this.model.group
      const present = this.model.present
      if (this.mode === 'eyes' && present) {
        const st = this.model.state
        const p = g.position
        const sneak = this.model.pose.position.y < 0
        cam.position.set(p.x, p.y + (sneak ? 1.54 : 1.62), p.z)
        // Where their head points (not their body, which lags behind).
        // Smoothed between the server's look updates (Track.viewAt), unless turned off.
        const view = st && this.smoothView && this.model.track.viewAt ? this.model.track.viewAt(this.model.now) : null
        if (st) {
          this.tYaw = this.yaw = -(view ? view.head : st.head) * Math.PI / 180 + Math.PI
          this.tPitch = this.pitch = -(view ? view.pitch : st.pitch) * Math.PI / 180
        }
        // EntityRenderer.hurtCameraEffect: a quick tilt when they get hit.
        const ago = this.model.hurtAgo
        let roll = 0
        if (ago >= 0 && ago < 500) { const f = 1 - ago / 500; roll = -Math.sin(f * f * f * f * Math.PI) * 14 * Math.PI / 180 }
        this.roll = roll
        this.eyesExtras(st, view)
        // EntityRenderer.setupCameraTransform: the hurt tilt and view bobbing
        // move the world in eye space, so the camera gets the opposite.
        cam.rotation.set(this.pitch, this.yaw, 0)
        cam.updateMatrix()
        const m = cam.matrix.clone().multiply(this.bobInv).multiply(new THREE.Matrix4().makeRotationZ(roll))
        m.decompose(cam.position, cam.quaternion, cam.scale)
        g.visible = false // their own model would block the view
        return
      }
      if (present) {
        const target = new THREE.Vector3(g.position.x, g.position.y + 1.4 + (this.model.pose.position.y < 0 ? -0.3 : 0), g.position.z)
        if (!this.focus || this.focus.distanceTo(target) > 16) this.focus = target.clone()
        else this.focus.lerp(target, this.smooth ? ease(14, dt) : 1)
      }
      if (this.focus) {
        const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
        // Like Minecraft's third person: come in closer when a block is in the way.
        let dist = this.dist
        if (this.solidAt) {
          for (let d = 0.3; d <= this.dist; d += 0.1) {
            if (this.solidAt(this.focus.x + dir.x * d, this.focus.y + dir.y * d, this.focus.z + dir.z * d)) { dist = Math.max(0.3, d - 0.3); break }
          }
        }
        cam.position.set(this.focus.x + dir.x * dist, this.focus.y + dir.y * dist, this.focus.z + dir.z * dist)
        if (dist < 1 && present) g.visible = false
        cam.rotation.set(this.pitch, this.yaw, 0)
        return
      }
    }

    if (this.mode === 'overview') {
      const fwd = (k.has('forward') ? 1 : 0) - (k.has('backward') ? 1 : 0)
      const side = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0)
      const v = this.dist * 0.8 * dt * (k.has('fast') ? 3 : 1)
      const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw)
      this.center.x += (-sin * fwd + cos * side) * v
      this.center.z += (-cos * fwd - sin * side) * v
      this.tPitch = Math.min(this.tPitch, -0.2)
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
      cam.position.set(this.center.x + dir.x * this.dist, this.center.y + dir.y * this.dist, this.center.z + dir.z * this.dist)
      cam.rotation.set(this.pitch, this.yaw, 0)
      return
    }

    // Free flight, with a little acceleration and glide.
    const fwd = (k.has('forward') ? 1 : 0) - (k.has('backward') ? 1 : 0)
    const side = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0)
    const up = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0)
    const sp = this.speed * (k.has('fast') ? 3 : 1)
    const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw)
    const want = new THREE.Vector3((-sin * fwd + cos * side) * sp, up * sp, (-cos * fwd - sin * side) * sp)
    this.vel.lerp(want, this.smooth ? ease(7, dt) : 1)
    cam.position.addScaledVector(this.vel, dt)
    if (this.flyTo) {
      cam.position.lerp(this.flyTo, ease(4, dt))
      if (cam.position.distanceTo(this.flyTo) < 0.05) this.flyTo = null
    }
    cam.rotation.set(this.pitch, this.yaw, 0)
  }
}

module.exports = { ReplayCamera }
