// The enchantment shimmer, done the way Minecraft 1.8 draws it: the glint
// texture is drawn twice over the item, each layer turned and sliding its own
// way, added on top of the colours (GL_SRC_COLOR, GL_ONE) and only where the
// item itself has pixels. Items use colour 0x8040CC with large stripes;
// armour uses a dimmer colour with the texture tiled three times.
const THREE = require('three')

let tex = null
const mats = []
const cache = new Map() // one glint material per base material and kind
const clock = { value: 0 }

const vert = `
varying vec2 vUv; varying vec2 vLocal;
void main () {
  vUv = uv; vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = `
uniform sampler2D glint; uniform sampler2D base; uniform float hasBase;
uniform vec3 color; uniform float time; uniform float armor;
varying vec2 vUv; varying vec2 vLocal;
vec2 turn (vec2 p, float deg) { float a = radians(deg); return mat2(cos(a), sin(a), -sin(a), cos(a)) * p; }
void main () {
  float a = hasBase > 0.5 ? texture2D(base, vUv).a : 1.0;
  if (a < 0.1) discard;
  vec3 c;
  if (armor > 0.5) {
    // LayerArmorBase: two passes, scale 1/3, turned 30 and -30 degrees.
    vec2 p = vUv * 0.33333;
    c = texture2D(glint, turn(p, 30.0) + vec2(0.0, time * 0.02)).rgb
      + texture2D(glint, turn(p, -30.0) + vec2(0.0, time * 0.08)).rgb;
  } else {
    // RenderItem.renderEffect: scale 8 on a 16px icon in the atlas, turned
    // -50 and 10 degrees, sliding over 3 s and 4.873 s.
    vec2 p = (vLocal + 0.5) * 0.25;
    c = texture2D(glint, turn(p, -50.0) + vec2(fract(time / 3.0) / 8.0, 0.0)).rgb
      + texture2D(glint, turn(p, 10.0) - vec2(fract(time / 4.873) / 8.0, 0.0)).rgb;
  }
  c *= color;
  gl_FragColor = vec4(c, 1.0);
}`

/**
 * A glint layer to draw over `baseMat` (its texture decides where the item
 * has pixels). kind: 'item' or 'armor'.
 */
function glintMaterial (baseMat, kind = 'item') {
  if (!tex) {
    tex = new THREE.TextureLoader().load('replay/entity/glint.png')
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
  }
  const key = kind
  let byKind = cache.get(baseMat)
  if (!byKind) { byKind = {}; cache.set(baseMat, byKind) }
  if (byKind[key]) return byKind[key]
  const armor = kind === 'armor'
  const m = new THREE.ShaderMaterial({
    uniforms: {
      glint: { value: tex },
      base: { value: null },
      hasBase: { value: 0 },
      color: { value: armor ? new THREE.Color(0.38, 0.19, 0.608) : new THREE.Color(0.5, 0.25, 0.8) },
      time: clock,
      armor: { value: armor ? 1 : 0 }
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcColorFactor,
    blendDst: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
  m.userData.baseMat = baseMat
  mats.push(m)
  byKind[key] = m
  return m
}

/** Move every shimmer along, and pick up base textures that finished loading. */
function tickGlint (seconds) {
  clock.value = seconds
  for (const m of mats) {
    const b = m.userData.baseMat && m.userData.baseMat.map
    if (b && m.uniforms.base.value !== b) { m.uniforms.base.value = b; m.uniforms.hasBase.value = 1 }
  }
}

module.exports = { glintMaterial, tickGlint }
