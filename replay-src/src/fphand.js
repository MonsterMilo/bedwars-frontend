// The followed player's hand in "their eyes" mode, the way Minecraft 1.8.9
// draws it (ItemRenderer.renderItemInFirstPerson): the held item, or the
// bare arm, in a pass of its own over the world, with the swing, the equip
// dip when the item changes, sword blocking, eating and drinking, and the
// bow being drawn. Every GlStateManager call of the original becomes a
// matrix here, multiplied in the same order, in eye space (which is the
// same in Minecraft and three.js: looking down -z, y up).
const THREE = require('three')
const { texBox } = require('./players')

const D = Math.PI / 180
const PX = 1 / 16
// Our player parts are built with y and z flipped from Minecraft's model space.
const FLIP = new THREE.Matrix4().makeScale(1, -1, -1)
const SWORDS = new Set([267, 268, 272, 276, 283])
const FOODS = new Set([260, 282, 297, 319, 320, 322, 335, 349, 350, 357, 360, 363, 364, 365, 366, 367, 373, 391, 392, 393, 394, 396, 400, 411, 412, 413, 423, 424])
// Item models' "firstperson" display (1.8): rotation, translation (pixels), scale.
// item/generated, item/handheld and the bow all use the same one; block
// models have none.
const FIRST_PERSON = [[0, -135, 25], [0, 4, 2], 1.7]

class Stack {
  constructor () { this.m = new THREE.Matrix4() }
  translate (x, y, z) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this }
  rotate (deg, x, y, z) { if (deg) this.m.multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(x, y, z), deg * D)); return this }
  scale (x, y, z) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this }
}

class FirstPersonHand {
  constructor (items) {
    this.items = items
    this.scene = new THREE.Scene()
    // RenderHelper.enableStandardItemLighting, roughly: a soft ambient
    // light and a key light from above and in front.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62))
    const key = new THREE.DirectionalLight(0xffffff, 0.5)
    key.position.set(0.2, 1, 0.7)
    this.scene.add(key)
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 10)
    this.holder = new THREE.Group()
    this.holder.matrixAutoUpdate = false
    this.scene.add(this.holder)
    this.model = null
    this.itemKey = null
    this.itemMesh = null
    this.arm = null
    this.armFor = null
  }

  /** The arm of this player's skin (and its sleeve), built once per player. */
  armOf (model) {
    if (this.armFor === model && this.arm) return this.arm
    if (this.arm) this.holder.remove(this.arm)
    const g = new THREE.Group()
    const legacy = model.tex && model.tex.image && model.tex.image.height === 32
    const texH = legacy ? 32 : 64
    const slim = model.slim && !legacy
    const aw = slim ? 3 : 4
    const mat = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    const sleeveMat = mat.clone()
    const base = new THREE.Mesh(texBox(aw, 12, 4, 40, 16, 64, texH), mat)
    g.add(base)
    if (!legacy) { const sleeve = new THREE.Mesh(texBox(aw, 12, 4, 40, 32, 64, texH, 0.25), sleeveMat); g.add(sleeve); g.userData.sleeve = sleeve }
    g.userData.mats = [mat, sleeveMat]
    g.userData.slim = slim
    g.userData.tex = null
    g.matrixAutoUpdate = false
    this.arm = g; this.armFor = model
    this.holder.add(g)
    return g
  }

  /**
   * Places the hand for `model` at replay time t. Returns false when there's
   * nothing to draw (invisible, a spectator, no player).
   */
  update (model, t, fov, aspect, roll) {
    this.camera.fov = fov; this.camera.aspect = aspect; this.camera.updateProjectionMatrix()
    this.camera.rotation.set(0, 0, roll || 0)
    if (!model || !model.present || model.ghost) { this.holder.visible = false; return false }
    this.holder.visible = true
    const tr = model.track
    const flags = tr.flags.at(t) || 0
    // The equip dip: the old item goes down 0.4 a tick, the new one comes up.
    const hand = tr.equip[0]
    const i = hand.t.length ? lastIndex(hand.t, t) : -1
    let item = i >= 0 ? hand.v[i] : hand.initial
    let equip = 1
    if (i >= 0) {
      const prev = i > 0 ? hand.v[i - 1] : hand.initial
      const ticks = (t - hand.t[i]) / 50
      if (!same(prev, item) && ticks < 5) {
        if (ticks < 2.5) { item = prev; equip = 1 - ticks * 0.4 } else equip = Math.min(1, (ticks - 2.5) * 0.4)
      }
    }
    const f = 1 - equip
    // Swing progress, as for the third-person model.
    if (!tr.swingStarts) {
      tr.swingStarts = []
      let start = -Infinity
      for (const w of tr.swings) if (w - start >= 150) { start = w; tr.swingStarts.push(w) }
    }
    const sw = tr.lastBefore(tr.swingStarts, t)
    const swing = t - sw < 300 ? (t - sw) / 300 : 0
    const using = !!(flags & 0x10) && !!item
    const usedMs = using ? t - tr.flags.since(t) : 0

    const s = new Stack()
    let showArm = false
    if (item) {
      if (using && SWORDS.has(item.id)) {
        transformFirstPersonItem(s, f, 0)
        s.translate(-0.5, 0.2, 0).rotate(30, 0, 1, 0).rotate(-80, 1, 0, 0).rotate(60, 0, 1, 0)
      } else if (using && FOODS.has(item.id)) {
        // ItemRenderer.performDrinking: itemInUseCount counts down from 32.
        const left = Math.max(0, 32 - usedMs / 50)
        const f1 = left / 32
        let f2 = Math.abs(Math.cos(left / 4 * Math.PI) * 0.1)
        if (f1 >= 0.8) f2 = 0
        s.translate(0, f2, 0)
        const f3 = 1 - Math.pow(f1, 27)
        s.translate(f3 * 0.6, f3 * -0.5, 0).rotate(f3 * 90, 0, 1, 0).rotate(f3 * 10, 1, 0, 0).rotate(f3 * 30, 0, 0, 1)
        transformFirstPersonItem(s, f, 0)
      } else if (using && item.id === 261) {
        transformFirstPersonItem(s, f, 0)
        // ItemRenderer.doBowTransformations.
        s.rotate(-18, 0, 0, 1).rotate(-12, 0, 1, 0).rotate(-8, 1, 0, 0).translate(-0.9, 0.2, 0)
        const ticks = usedMs / 50 + 1
        let f1 = ticks / 20
        f1 = (f1 * f1 + f1 * 2) / 3
        if (f1 > 1) f1 = 1
        if (f1 > 0.1) s.translate(0, Math.sin((ticks - 0.1) * 1.3) * (f1 - 0.1) * 0.01, 0)
        s.translate(0, 0, f1 * 0.1).scale(1, 1, 1 + f1 * 0.2)
      } else {
        // doItemUsedTransformations, then transformFirstPersonItem with the swing.
        s.translate(-0.4 * Math.sin(Math.sqrt(swing) * Math.PI), 0.2 * Math.sin(Math.sqrt(swing) * Math.PI * 2), -0.2 * Math.sin(swing * Math.PI))
        transformFirstPersonItem(s, f, swing)
      }
      // ItemRenderer.renderItem doubles 3D (block) items, RenderItem.preTransform
      // doubles flat ones: both end up twice the size.
      s.scale(2, 2, 2)
      const flat = !this.items.isBlock(item)
      if (flat) {
        const [rot, tr2, sc] = FIRST_PERSON
        s.translate(tr2[0] * PX, tr2[1] * PX, tr2[2] * PX).rotate(rot[1], 0, 1, 0).rotate(rot[0], 1, 0, 0).rotate(rot[2], 0, 0, 1).scale(sc, sc, sc)
      }
      // RenderItem.renderItem: scale 0.5 around the model's centre (our meshes are centred).
      s.scale(0.5, 0.5, 0.5)
      let texture = null
      if (item.id === 261 && using) {
        const held = usedMs / 50
        texture = held >= 18 ? 'bow_pulling_2' : held > 13 ? 'bow_pulling_1' : 'bow_pulling_0'
        if (!this.items.d.items.textures[texture]) texture = null
      }
      const key = item.id + ':' + item.damage + (item.glint ? '*' : '') + (item.color != null ? item.color : '') + (texture || '')
      if (key !== this.itemKey) {
        if (this.itemMesh) this.holder.remove(this.itemMesh)
        this.itemMesh = this.items.mesh(item, { texture })
        this.itemKey = key
        if (this.itemMesh) { this.itemMesh.matrixAutoUpdate = false; this.holder.add(this.itemMesh) }
      }
      if (this.itemMesh) { this.itemMesh.matrix.copy(s.m); this.itemMesh.visible = true } else showArm = true
    } else showArm = true
    if (!item && this.itemMesh) this.itemMesh.visible = false

    const arm = this.armOf(model)
    arm.visible = showArm
    if (showArm) {
      if (this.itemMesh) this.itemMesh.visible = false
      if (arm.userData.tex !== model.tex && model.tex) {
        for (const m of arm.userData.mats) { m.map = model.tex; m.needsUpdate = true }
        arm.userData.tex = model.tex
      }
      if (arm.userData.sleeve) arm.userData.sleeve.visible = !!((tr.skinParts.at(t) ?? 0x7f) & 0x08)
      // ItemRenderer.renderPlayerArm.
      const a = new Stack()
      a.translate(-0.3 * Math.sin(Math.sqrt(swing) * Math.PI), 0.4 * Math.sin(Math.sqrt(swing) * Math.PI * 2), -0.4 * Math.sin(swing * Math.PI))
      a.translate(0.64000005, -0.6, -0.71999997).translate(0, f * -0.6, 0).rotate(45, 0, 1, 0)
      a.rotate(Math.sin(Math.sqrt(swing) * Math.PI) * 70, 0, 1, 0).rotate(Math.sin(swing * swing * Math.PI) * -20, 0, 0, 1)
      a.translate(-1, 3.6, 3.5).rotate(120, 0, 0, 1).rotate(200, 1, 0, 0).rotate(-135, 0, 1, 0).translate(5.6, 0, 0)
      // RenderPlayer.renderRightArm: bipedRightArm at its rotation point,
      // turned 0.1 rad about z (ModelBiped's idle sway at age 0), in model
      // pixels (scale 0.0625).
      const slim = arm.userData.slim
      a.translate(-5 * PX, (slim ? 2.5 : 2) * PX, 0).rotate(0.1 / D, 0, 0, 1)
      a.translate((slim ? -0.5 : -1) * PX, 4 * PX, 0)
      a.m.multiply(FLIP)
      arm.matrix.copy(a.m)
    }
    this.holder.matrix.identity()
    return true
  }
}

/** ItemRenderer.transformFirstPersonItem(equipProgress, swingProgress). */
function transformFirstPersonItem (s, equip, swing) {
  s.translate(0.56, -0.52, -0.71999997).translate(0, equip * -0.6, 0).rotate(45, 0, 1, 0)
  const f = Math.sin(swing * swing * Math.PI); const f1 = Math.sin(Math.sqrt(swing) * Math.PI)
  s.rotate(f * -20, 0, 1, 0).rotate(f1 * -20, 0, 0, 1).rotate(f1 * -80, 1, 0, 0).scale(0.4, 0.4, 0.4)
}

function same (a, b) { return (!a && !b) || (!!a && !!b && a.id === b.id && a.damage === b.damage) }
function lastIndex (arr, t) { let lo = 0; let hi = arr.length - 1; let i = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { i = m; lo = m + 1 } else hi = m - 1 } return i }

module.exports = { FirstPersonHand }
