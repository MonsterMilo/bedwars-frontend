// Minecraft 1.8's fancy clouds (RenderGlobal.renderCloudsFancy): every
// white pixel of clouds.png is a 12x4x12 block slab at height 128, top
// faces full white, sides a little darker and the bottom darkest, 80%
// opaque, drifting west 0.6 blocks a second. Drawn depth first, then
// colour, so overlapping faces don't stack up darker (as the game does).
const THREE = require('three')

const CELL = 12
const THICK = 4
const HEIGHT = 128
const SIZE = 256 * CELL // one repeat of the picture, in blocks

class Clouds {
  constructor (scene, fog) {
    this.fog = fog // { color, near, far } uniforms shared with the blocks
    this.group = new THREE.Group()
    this.group.visible = false
    scene.add(this.group)
    this.ready = false
    const img = new Image()
    img.onload = () => this.build(img)
    img.src = 'replay/clouds.png'
  }

  build (img) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, 256, 256).data
    const on = (i, j) => px[((((j % 256) + 256) % 256) * 256 + (((i % 256) + 256) % 256)) * 4 + 3] > 128
    const pos = []; const col = []; const idx = []
    const face = (pts, shade) => {
      const b = pos.length / 3
      for (const p of pts) { pos.push(p[0], p[1], p[2]); col.push(shade, shade, shade) }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    for (let j = 0; j < 256; j++) {
      for (let i = 0; i < 256; i++) {
        if (!on(i, j)) continue
        const x0 = i * CELL; const x1 = x0 + CELL; const z0 = j * CELL; const z1 = z0 + CELL; const y0 = 0; const y1 = THICK
        face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1) // top
        face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.7) // bottom
        if (!on(i - 1, j)) face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.9)
        if (!on(i + 1, j)) face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.9)
        if (!on(i, j - 1)) face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.8)
        if (!on(i, j + 1)) face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.8)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const shader = (colorWrite) => new THREE.ShaderMaterial({
      uniforms: { fogColor: this.fog.color, fogNear: this.fog.near, fogFar: this.fog.far },
      vertexColors: true, transparent: true, side: THREE.DoubleSide, colorWrite, depthWrite: !colorWrite,
      vertexShader: `
        varying vec3 vCol; varying float vFog;
        void main () { vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        varying vec3 vCol; varying float vFog;
        void main () {
          float f = smoothstep(fogNear, fogFar * 1.6, vFog);
          if (f >= 1.0) discard;
          gl_FragColor = vec4(mix(vCol, fogColor, f), 0.8 * (1.0 - f));
        }`
    })
    const depth = shader(false); const color = shader(true)
    color.depthFunc = THREE.LessEqualDepth
    // A 2x2 of repeats around the camera, so there's never an edge in view.
    this.tiles = []
    for (let k = 0; k < 4; k++) {
      const a = new THREE.Mesh(g, depth); a.renderOrder = 5; a.frustumCulled = false
      const b = new THREE.Mesh(g, color); b.renderOrder = 6; b.frustumCulled = false
      const t = new THREE.Group(); t.add(a, b)
      this.group.add(t)
      this.tiles.push(t)
    }
    this.group.visible = true
    this.ready = true
  }

  /** seconds: replay time (the drift follows the replay). */
  update (camera, seconds) {
    if (!this.ready) return
    const drift = seconds * 0.6
    // Where the picture starts, west/north of the camera.
    const ox = Math.floor((camera.position.x + drift) / SIZE) * SIZE - drift
    const oz = Math.floor(camera.position.z / SIZE) * SIZE
    const fx = camera.position.x - ox > SIZE / 2 ? 1 : -1
    const fz = camera.position.z - oz > SIZE / 2 ? 1 : -1
    let k = 0
    for (const dx of [0, fx]) for (const dz of [0, fz]) this.tiles[k++].position.set(ox + dx * SIZE, HEIGHT + 0.33, oz + dz * SIZE)
  }
}

module.exports = { Clouds }
