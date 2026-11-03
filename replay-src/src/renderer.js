// Main-thread side of the block renderer: owns the section meshes the mesh
// worker sends back, and the shader that draws them (atlas texture,
// animated water/lava/fire frames, corner shading, fog).
const THREE = require('three')

const VERT = `
attribute vec3 anim;
varying vec2 vUv;
varying vec3 vCol;
varying float vFog;
uniform float time;
void main () {
  vec2 uv0 = uv;
  if (anim.x > 1.0) {
    float frame = mod(floor(time * 20.0 / max(anim.y, 1.0)), anim.x);
    uv0.x += frame * anim.z;
  }
  vUv = uv0;
  vCol = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFog = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
uniform sampler2D map;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float alphaCut;
uniform float opacity;
varying vec2 vUv;
varying vec3 vCol;
varying float vFog;
void main () {
  vec4 t = texture2D(map, vUv);
  if (t.a < alphaCut) discard;
  vec3 c = t.rgb * vCol;
  float f = smoothstep(fogNear, fogFar, vFog);
  gl_FragColor = vec4(mix(c, fogColor, f), t.a * opacity);
}`

class BlockRenderer {
  constructor (scene, { workerUrl = 'replay/mesh.js', fog }) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)
    this.meshes = new Map()
    this.left = Infinity
    this.onProgress = () => {}
    this.worker = new Worker(workerUrl)
    this.worker.onmessage = ({ data }) => this.onMessage(data)
    this.uniforms = {
      map: { value: null }, time: { value: 0 },
      fogColor: { value: new THREE.Color(fog.color) }, fogNear: { value: fog.near }, fogFar: { value: fog.far }
    }
    const mat = (alphaCut, opacity, transparent) => new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, alphaCut: { value: alphaCut }, opacity: { value: opacity } },
      vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, transparent, depthWrite: !transparent, side: THREE.FrontSide
    })
    this.opaqueMat = mat(0.5, 1, false)
    this.transMat = mat(0.02, 1, true)
    // Both share the same uniform objects, so time/map updates reach both.
  }

  async load (base = 'replay/') {
    const [data, tex] = await Promise.all([
      fetch(base + 'blocks.json').then(r => { if (!r.ok) throw new Error('Couldn\'t load the block data'); return r.json() }),
      new Promise((resolve, reject) => new THREE.TextureLoader().load(base + 'blocks.png', resolve, undefined, () => reject(new Error('Couldn\'t load the block textures'))))
    ])
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.flipY = false
    this.uniforms.map.value = tex
    this.data = data
    this.tex = tex
    this.worker.postMessage({ type: 'init', data })
  }

  setColumn (x, z, sections) { this.worker.postMessage({ type: 'column', x, z, sections }) }
  setBlocks (flat) { if (flat.length) this.worker.postMessage({ type: 'blocks', blocks: flat }, [flat.buffer]) }
  setCamera (p) { this.worker.postMessage({ type: 'camera', pos: [p.x, p.y, p.z] }) }

  tick (seconds) { this.uniforms.time.value = seconds }

  onMessage (m) {
    if (m.type === 'progress' || m.type === 'idle') { this.left = m.type === 'idle' ? 0 : m.left; this.onProgress(this.left); return }
    if (m.type !== 'section') return
    const old = this.meshes.get(m.key)
    if (old) { for (const mesh of old) { this.group.remove(mesh); mesh.geometry.dispose() } this.meshes.delete(m.key) }
    if (!m.geo) return
    const meshes = []
    for (const [part, mat, order] of [[m.geo.opaque, this.opaqueMat, 0], [m.geo.trans, this.transMat, 1]]) {
      if (!part) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(part.uv, 2))
      g.setAttribute('color', new THREE.BufferAttribute(part.col, 3))
      g.setAttribute('anim', new THREE.BufferAttribute(part.anim, 3))
      g.setIndex(new THREE.BufferAttribute(part.idx, 1))
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, mat)
      mesh.position.set(m.x * 16, m.y * 16, m.z * 16)
      mesh.renderOrder = order
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      this.group.add(mesh)
      meshes.push(mesh)
    }
    this.meshes.set(m.key, meshes)
  }
}

module.exports = { BlockRenderer }
