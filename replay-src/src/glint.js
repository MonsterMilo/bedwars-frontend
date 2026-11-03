// The enchantment shimmer: Minecraft's glint texture, purple, added on top
// of the item or armour and slowly sliding across it.
const THREE = require('three')

let tex = null
const mats = []

function glintMaterial (strength = 1) {
  if (!tex) {
    tex = new THREE.TextureLoader().load('replay/entity/glint.png')
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
  }
  const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0x8040cc).multiplyScalar(strength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthFunc: THREE.LessEqualDepth })
  mats.push(m)
  return m
}

/** Slide the shimmer (the texture is shared, so this moves all of them). */
function tickGlint (seconds) {
  if (!tex) return
  tex.offset.set((seconds * 0.12) % 1, (seconds * 0.05) % 1)
  tex.rotation = 0.35
}

module.exports = { glintMaterial, tickGlint }
