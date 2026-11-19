// Lights entities, items and the hand by the light where they are, like
// the game does (the lightmap colour at their position): darker in tunnels
// and under roofs, warm next to torches. Each Lambert material is
// multiplied by a colour; a material shared between several things (held
// items, arrows) gets a copy per thing, so each is lit on its own.
const THREE = require('three')

const owner = new WeakMap() // material -> the root it lights

function patch (material) {
  const u = { value: new THREE.Color(1, 1, 1) }
  material.userData.lightU = u
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uEntLight = u
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uEntLight;\nvoid main() {')
      .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'gl_FragColor = vec4( outgoingLight * uEntLight, diffuseColor.a );')
  }
  material.customProgramCacheKey = () => 'entlight'
  material.needsUpdate = true
}

/** Light everything under root with this colour (anything with r, g, b). */
function setEntityLight (root, color) {
  root.traverse(o => {
    if (!o.isMesh) return
    let m = o.material
    if (!m || !m.isMeshLambertMaterial) return
    const own = owner.get(m)
    if (own === undefined) owner.set(m, root)
    else if (own !== root) {
      const orig = m
      m = o.material = m.clone()
      m.userData = {}
      o.userData.origMat = orig
      owner.set(m, root)
    }
    const orig = o.userData.origMat
    if (orig && orig.map !== m.map) { m.map = orig.map; m.needsUpdate = true } // loaded later
    if (!m.userData.lightU) patch(m)
    m.userData.lightU.value.setRGB(color.r, color.g, color.b)
  })
}

module.exports = { setEntityLight }
