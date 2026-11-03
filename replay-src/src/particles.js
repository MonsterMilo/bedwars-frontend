// Particles: crits, bed and block breaks, explosions, smoke, flames,
// coloured dust and the rest, using Minecraft 1.8's particle sheet.
// Every particle is worked out from its start time (fixed random seeds),
// so scrubbing back and forth shows exactly the same thing.
const THREE = require('three')

const MAX = 6000
// Cells in particles.png (16x16 cells of 8 px).
const CELL = { crit: 65, magicCrit: 65, flame: 48, lava: 49, note: 64, heart: 80, angryVillager: 81, happyVillager: 82, bubble: 32, enchantmenttable: 225, dripWater: 112, dripLava: 113, splash: 19, droplet: 19, wake: 19, slime: 116, snowballpoof: 116, barrier: -1 }
const SMOKE = new Set(['smoke', 'largesmoke', 'reddust', 'cloud', 'snowshovel', 'explode', 'largeexplode', 'hugeexplosion', 'portal', 'townaura', 'suspended', 'depthsuspend', 'footstep', 'mobappearance', 'fireworksSpark'])
const SPELL = new Set(['spell', 'instantSpell', 'mobSpell', 'mobSpellAmbient', 'witchMagic'])

function rng (seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
const gauss = (r) => { const u = Math.max(1e-9, r()); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

class Particles {
  constructor (scene, timeline, { colorOf }) {
    this.list = this.expand(timeline, colorOf)
    this.list.sort((a, b) => a.t0 - b.t0)
    this.maxLife = this.list.reduce((m, p) => Math.max(m, p.life), 0)
    const g = new THREE.BufferGeometry()
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.cell = new Float32Array(MAX)
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('cell', new THREE.BufferAttribute(this.cell, 1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    this.geo = g
    const tex = new THREE.TextureLoader().load('replay/particles.png')
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.flipY = false
    this.uniforms = { map: { value: tex }, scale: { value: 400 } }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float size; attribute float cell;
        varying vec3 vCol; varying float vCell;
        uniform float scale;
        void main () {
          vCol = color; vCell = cell;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, size * scale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vCol; varying float vCell;
        void main () {
          if (vCell < 0.0) { gl_FragColor = vec4(vCol, 1.0); return; }
          vec2 uv = (vec2(mod(vCell, 16.0), floor(vCell / 16.0)) + gl_PointCoord) / 16.0;
          vec4 t = texture2D(map, uv);
          if (t.a < 0.4) discard;
          gl_FragColor = vec4(t.rgb * vCol, 1.0);
        }`
    })
    this.points = new THREE.Points(g, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  expand (tl, colorOf) {
    const out = []
    tl.effects.forEach((e, i) => {
      const r = rng(i * 2654435761)
      const add = (p) => out.push(p)
      if (e.kind === 'particle') {
        const n = e.count === 0 ? 1 : Math.min(e.count, 40)
        for (let k = 0; k < n; k++) {
          let x = e.x; let y = e.y; let z = e.z; let vx = 0; let vy = 0; let vz = 0
          if (e.count === 0) { vx = e.ox * e.speed * 20; vy = e.oy * e.speed * 20; vz = e.oz * e.speed * 20 } else {
            x += gauss(r) * e.ox; y += gauss(r) * e.oy; z += gauss(r) * e.oz
            vx = gauss(r) * e.speed * 20; vy = gauss(r) * e.speed * 20; vz = gauss(r) * e.speed * 20
          }
          const name = e.name
          let color = [1, 1, 1]; let size = 0.12; let life = 0.4 + r() * 0.6; let grav = 0; let cell = CELL[name] !== undefined ? CELL[name] : 0; let anim = 0
          if (name === 'reddust') {
            if (e.count === 0 && (e.ox || e.oy || e.oz)) color = [Math.max(e.ox, 0) || (e.ox === -1 ? 0 : 1), Math.max(e.oy, 0), Math.max(e.oz, 0)]
            else color = [1, 0.1, 0.1]
            const b = 0.6 + r() * 0.4; color = color.map(c => c * b)
            vx = vy = vz = 0; size = 0.1; life = 0.8 + r() * 0.4; anim = 1
          } else if (SMOKE.has(name)) {
            anim = 1
            if (/explo/.test(name)) { size = name === 'hugeexplosion' ? 1.6 : 0.8; color = [0.85, 0.85, 0.85]; life = 0.4 + r() * 0.4; vy += 0.5 }
            else if (name === 'portal') { color = [0.75, 0.3, 0.9]; size = 0.08 }
            else if (name === 'cloud' || name === 'snowshovel') { color = [1, 1, 1]; size = 0.15; vy += 0.3; grav = name === 'snowshovel' ? -5 : 0 }
            else { color = [0.25, 0.25, 0.25]; size = name === 'largesmoke' ? 0.35 : 0.18; vy += 1 }
          } else if (SPELL.has(name)) {
            cell = 128; anim = 2; color = name === 'witchMagic' ? [0.6, 0.2, 0.8] : [0.6, 0.6, 1]; vy += 1; size = 0.12
          } else if (name === 'crit' || name === 'magicCrit') {
            color = name === 'magicCrit' ? [0.4, 0.85, 1] : [0.9, 0.85, 0.7]; size = 0.12; grav = -6
          } else if (name === 'blockcrack' || name === 'blockdust' || name === 'iconcrack') {
            const st = e.data.length ? (name === 'iconcrack' ? 0 : ((e.data[0] & 0xfff) << 4) | ((e.data[0] >> 12) & 15)) : 0
            color = st ? colorOf(st) : [0.7, 0.7, 0.7]; cell = -1; size = 0.07; grav = -12; life = 0.5 + r() * 0.5
          } else if (name === 'flame' || name === 'lava') { size = 0.12; vy += name === 'lava' ? 3 : 0.2; grav = name === 'lava' ? -12 : 0 }
          else if (name === 'note') { color = [r(), r(), r()]; size = 0.2; vy += 1 }
          else if (name === 'heart' || /Villager/.test(name)) { size = 0.2; vy += 0.5 }
          add({ t0: e.t, life, x, y, z, vx, vy, vz, grav, color, size, cell, anim })
        }
      } else if (e.kind === 'break') {
        // Minecraft drops 4x4x4 pieces of the broken block.
        const c = colorOf(e.block)
        for (let k = 0; k < 48; k++) {
          const ox = (r() - 0.5); const oy = (r() - 0.5); const oz = (r() - 0.5)
          const b = 0.75 + r() * 0.25
          add({ t0: e.t, life: 0.4 + r() * 0.8, x: e.x + ox, y: e.y + oy, z: e.z + oz, vx: ox * 4, vy: oy * 4 + 2, vz: oz * 4, grav: -16, color: c.map(v => v * b), size: 0.1, cell: -1, anim: 0 })
        }
      } else if (e.kind === 'explosion') {
        for (let k = 0; k < 16; k++) {
          add({ t0: e.t + r() * 150, life: 0.5 + r() * 0.5, x: e.x + gauss(r) * 1.5, y: e.y + gauss(r), z: e.z + gauss(r) * 1.5, vx: 0, vy: 0.5, vz: 0, grav: 0, color: [0.9, 0.9, 0.9], size: 1.4 + r(), cell: 0, anim: 1 })
        }
      } else if (e.kind === 'crit') {
        const s = e.entity.stateAt(e.t)
        if (!s) return
        for (let k = 0; k < 14; k++) {
          const vx = gauss(r); const vy = gauss(r) + 0.5; const vz = gauss(r)
          add({ t0: e.t, life: 0.3 + r() * 0.4, x: s.x + vx * 0.3, y: s.y + 1 + vy * 0.3, z: s.z + vz * 0.3, vx: vx * 3, vy: vy * 3, vz: vz * 3, grav: -6, color: e.magic ? [0.4, 0.85, 1] : [0.9, 0.85, 0.7], size: 0.12, cell: 65, anim: 0 })
        }
      }
    })
    return out
  }

  update (t, camera, height) {
    this.uniforms.scale.value = height / (2 * Math.tan(camera.fov * Math.PI / 360))
    const list = this.list
    // First particle that could still be alive.
    let lo = 0; let hi = list.length
    const from = t - this.maxLife * 1000
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].t0 < from) lo = m + 1; else hi = m }
    let n = 0
    for (let i = lo; i < list.length && n < MAX; i++) {
      const p = list[i]
      if (p.t0 > t) break
      const age = (t - p.t0) / 1000
      if (age >= p.life) continue
      const k = n * 3
      this.pos[k] = p.x + p.vx * age
      this.pos[k + 1] = p.y + p.vy * age + 0.5 * p.grav * age * age
      this.pos[k + 2] = p.z + p.vz * age
      this.col[k] = p.color[0]; this.col[k + 1] = p.color[1]; this.col[k + 2] = p.color[2]
      this.size[n] = p.size
      // Smoke-like particles shrink through their 8 frames as they age.
      this.cell[n] = p.anim === 1 ? p.cell + 7 - Math.min(7, Math.floor(age / p.life * 8)) : p.anim === 2 ? p.cell + 7 - Math.min(7, Math.floor(age / p.life * 8)) : p.cell
      if (p.anim === 1 && p.cell === 0) this.cell[n] = 7 - Math.min(7, Math.floor(age / p.life * 8))
      n++
    }
    const g = this.geo
    g.setDrawRange(0, n)
    for (const a of ['position', 'color', 'size', 'cell']) g.attributes[a].needsUpdate = true
  }
}

module.exports = { Particles }
