// Camera for the replay: a free camera (drag to look, WASD to fly, E and
// Q for up and down, Shift to go faster, wheel for speed) that can also follow a
// player from behind or through their eyes.
const THREE = require('three')

class ReplayCamera {
  constructor (camera, dom) {
    this.camera = camera
    this.dom = dom
    this.yaw = 0 // radians, three.js convention around +y
    this.pitch = -0.5
    this.speed = 12 // blocks per second
    this.keys = new Set()
    this.follow = null // { model, mode: 'behind' | 'eyes' }
    this.dist = 5
    camera.rotation.order = 'YXZ'

    let drag = null
    dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId) })
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y
      drag = { x: e.clientX, y: e.clientY }
      this.yaw -= dx * 0.005
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.005))
    })
    const end = () => { drag = null }
    dom.addEventListener('pointerup', end); dom.addEventListener('pointercancel', end)
    dom.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (this.follow && this.follow.mode === 'behind') this.dist = Math.max(2, Math.min(30, this.dist * (e.deltaY > 0 ? 1.15 : 0.87)))
      else this.speed = Math.max(2, Math.min(80, this.speed * (e.deltaY > 0 ? 0.85 : 1.18)))
    }, { passive: false })
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'shift', 'q', 'e'].includes(k)) {
        this.keys.add(k)
        // Moving the camera yourself stops following.
        if (this.follow && ['w', 'a', 's', 'd'].includes(k)) this.stopFollow()
      }
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    window.addEventListener('blur', () => this.keys.clear())
    this.onFollowChange = () => {}
  }

  lookAt (from, to) {
    this.camera.position.set(from.x, from.y, from.z)
    const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z
    this.yaw = Math.atan2(-dx, -dz)
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz))
  }

  setFollow (model, mode = 'behind') {
    this.follow = model ? { model, mode } : null
    this.onFollowChange(this.follow)
  }

  stopFollow () { if (this.follow) { this.follow = null; this.onFollowChange(null) } }

  update (dt) {
    const cam = this.camera
    if (this.follow) {
      const g = this.follow.model.group
      if (g.visible) {
        const p = g.position
        if (this.follow.mode === 'eyes') {
          const tr = this.follow.model
          cam.position.set(p.x, p.y + 1.62, p.z)
          cam.rotation.set(-tr.parts.head.rotation.x, g.rotation.y + Math.PI, 0)
          // The model itself would block the view.
          g.visible = false
          return
        }
        const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
        cam.position.set(p.x + dir.x * this.dist, p.y + 1.4 + dir.y * this.dist, p.z + dir.z * this.dist)
        cam.rotation.set(this.pitch, this.yaw, 0)
        return
      }
    }
    const k = this.keys
    const fwd = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0)
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
    const up = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0)
    const v = this.speed * dt * (k.has('shift') ? 3 : 1)
    const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw)
    cam.position.x += (-sin * fwd + cos * side) * v
    cam.position.z += (-cos * fwd - sin * side) * v
    cam.position.y += up * v
    cam.rotation.set(this.pitch, this.yaw, 0)
  }
}

module.exports = { ReplayCamera }
