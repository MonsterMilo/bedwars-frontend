// Turns 16x16x16 sections of 1.8 blocks into triangles, the way Minecraft
// 1.8 draws them: real block models, faces hidden against solid
// neighbours, corner shadows (ambient occlusion), per-side shading,
// grass/leaf/water colours, see-through water and glass in their own pass,
// and animated textures (water, lava, fire...) handled by the shader.
// Runs inside the mesh worker; pure data, so Node tests can use it too.

const DIRS = {
  down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0]
}
const DIR_NAMES = Object.keys(DIRS)
const SHADE = { down: 0.5, up: 1, north: 0.8, south: 0.8, west: 0.6, east: 0.6 }
const AO = [0.5, 0.68, 0.84, 1]

// Corners of each face, seen from outside: top-left, top-right,
// bottom-right, bottom-left (matching the texture's corners).
function faceCorners (dir, a, b) {
  const [x0, y0, z0] = a; const [x1, y1, z1] = b
  switch (dir) {
    case 'up': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    case 'down': return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]
    case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]
    case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
    case 'west': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]
    case 'east': return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]
  }
}
function defaultUv (dir, a, b) {
  const [x0, y0, z0] = a; const [x1, y1, z1] = b
  switch (dir) {
    case 'up': return [x0, z0, x1, z1]
    case 'down': return [x0, 16 - z1, x1, 16 - z0]
    case 'north': return [16 - x1, 16 - y1, 16 - x0, 16 - y0]
    case 'south': return [x0, 16 - y1, x1, 16 - y0]
    case 'west': return [z0, 16 - y1, z1, 16 - y0]
    case 'east': return [16 - z1, 16 - y1, 16 - z0, 16 - y0]
  }
}

const rotY = (p, deg) => { // clockwise seen from above, around the block centre (0-16 units)
  let [x, y, z] = p
  for (let k = 0; k < ((deg / 90) & 3); k++) { const nx = 16 - z; z = x; x = nx }
  return [x, y, z]
}
const rotX = (p, deg) => {
  let [x, y, z] = p
  for (let k = 0; k < ((deg / 90) & 3); k++) { const ny = 16 - z; z = y; y = ny }
  return [x, y, z]
}
const rotDir = (d, xr, yr) => {
  // Rotate a direction the same way as positions (as a vector from the centre).
  let v = DIRS[d].map(c => c * 8 + 8)
  v = rotY(rotX(v, xr), yr)
  const n = v.map(c => Math.round((c - 8) / 8))
  return DIR_NAMES.find(k => DIRS[k][0] === n[0] && DIRS[k][1] === n[1] && DIRS[k][2] === n[2])
}

function rotateElementPoint (p, rot) {
  if (!rot || !rot.angle) return p
  const a = rot.angle * Math.PI / 180; const c = Math.cos(a); const s = Math.sin(a)
  const o = rot.origin || [8, 8, 8]
  let [x, y, z] = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]
  const sc = rot.rescale ? 1 / Math.cos(a) : 1
  if (rot.axis === 'y') { const nx = x * c + z * s; const nz = -x * s + z * c; x = nx * sc; z = nz * sc }
  else if (rot.axis === 'x') { const ny = y * c - z * s; const nz = y * s + z * c; y = ny * sc; z = nz * sc }
  else { const nx = x * c - y * s; const ny = x * s + y * c; x = nx * sc; y = ny * sc }
  return [x + o[0], y + o[1], z + o[2]]
}

const TRANSLUCENT = /^(water|ice|slime_block|nether_portal)$|stained_glass/
const NOT_SOLID = /glass|leaves|^ice$|slime|spawner|beacon|^water$|^lava$|barrier/
const CULL_SAME = /glass|^ice$|^water$|^lava$/
const SPECIAL = { chest: 'chest', trapped_chest: 'chest', ender_chest: 'chest', water: 'fluid', lava: 'fluid' }

class Mesher {
  constructor (data) {
    this.d = data
    this.W = data.atlas.w; this.H = data.atlas.h
    this.info = new Map() // state id -> block info
    this.quads = new Map() // "name[props]" -> quads in block space
    this.cols = new Map() // "cx,cz" -> Array(16) of Uint16Array|null
  }

  // --- World store ---
  setColumn (cx, cz, sections) { this.cols.set(cx + ',' + cz, sections) }
  get (x, y, z) {
    if (y < 0 || y > 255) return 0
    const c = this.cols.get((x >> 4) + ',' + (z >> 4)); if (!c) return 0
    const s = c[y >> 4]; return s ? s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0
  }

  set (x, y, z, v) {
    if (y < 0 || y > 255) return
    const c = this.cols.get((x >> 4) + ',' + (z >> 4)); if (!c) return
    let s = c[y >> 4]
    if (!s) { if (!v) return; s = c[y >> 4] = new Uint16Array(4096) }
    s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = v
  }

  // --- Block info ---
  blockInfo (id) {
    let b = this.info.get(id)
    if (b) return b
    let str = this.d.legacy[id]
    if (str === undefined) str = this.d.legacy[id & ~15] // unknown data value: the block's default
    if (str === undefined || id >> 4 === 0) str = 'air'
    const m = str.match(/^([^[]+)(?:\[(.*)\])?$/)
    const name = m[1]; const props = {}
    if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v }
    b = { id, name, props, air: name === 'air' || name === 'cave_air', special: SPECIAL[name] || null }
    b.translucent = TRANSLUCENT.test(name)
    b.cullSame = CULL_SAME.test(name)
    b.neighbourDependent = /_fence$|fence$|_pane$|iron_bars|_wall$|_stairs$|_door$|^(sunflower|lilac|tall_grass|large_fern|rose_bush|peony)$|^grass_block$|^fire$/.test(name)
    const q = b.air || b.special ? [] : this.modelQuads(name, props)
    b.solid = !b.air && !NOT_SOLID.test(name) && !b.special && q.length > 0 && isFullCube(q)
    b.ao = !b.air && !b.special && q.every(f => f.ao)
    this.info.set(id, b)
    return b
  }

  // --- Models ---
  modelQuads (name, props) {
    const key = name + '[' + Object.keys(props).sort().map(k => k + '=' + props[k]).join(',') + ']'
    let q = this.quads.get(key)
    if (q) return q
    q = []
    const st = this.d.states[name]
    const parts = []
    if (st && st.variants) {
      let best = null
      for (const [k, v] of Object.entries(st.variants)) {
        if (k === '' || k === 'normal' || k.split(',').every(kv => { const [a, b] = kv.split('='); return String(props[a]) === b })) { best = v; break }
      }
      if (!best) best = Object.values(st.variants)[0]
      if (best) parts.push(Array.isArray(best) ? best[0] : best)
    } else if (st && st.multipart) {
      for (const p of st.multipart) if (!p.when || matchWhen(p.when, props)) parts.push(Array.isArray(p.apply) ? p.apply[0] : p.apply)
    }
    for (const part of parts) {
      const modelName = part.model.startsWith('old/') ? part.model : part.model.replace(/^block\//, '')
      const model = this.d.models[modelName]
      if (!model) continue
      for (const el of model.elements) {
        for (const [dir, f] of Object.entries(el.faces)) {
          const tex = this.d.textures[f.texture]
          if (!tex) continue
          let corners = faceCorners(dir, el.from, el.to).map(p => rotateElementPoint(p, el.rotation))
          corners = corners.map(p => rotY(rotX(p, part.x || 0), part.y || 0))
          const uv = f.uv || defaultUv(dir, el.from, el.to)
          const uvc = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]
          const r = ((f.rotation || 0) / 90) & 3
          const uvs = [0, 1, 2, 3].map(i => uvc[(i - r + 4) & 3])
          const ndir = rotDir(dir, part.x || 0, part.y || 0)
          q.push({
            pos: corners.map(p => [p[0] / 16, p[1] / 16, p[2] / 16]),
            uv: uvs,
            tex,
            dir: ndir,
            cull: f.cullface ? rotDir(f.cullface === 'bottom' ? 'down' : f.cullface, part.x || 0, part.y || 0) : null,
            tint: f.tintindex != null && f.tintindex >= 0,
            shade: el.shade !== false,
            ao: model.ao !== false
          })
        }
      }
    }
    this.quads.set(key, q)
    return q
  }

  /** Props that depend on neighbours (fences, stairs, doors...). */
  withNeighbours (b, x, y, z) {
    const name = b.name; const props = { ...b.props }
    const at = (dx, dy, dz) => this.blockInfo(this.get(x + dx, y + dy, z + dz))
    const sides = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
    if (/fence$|_wall$/.test(name) && !/gate/.test(name)) {
      for (const [s, [dx, , dz]] of Object.entries(sides)) {
        const n = at(dx, 0, dz)
        props[s] = String(n.solid || (/_wall$/.test(name) ? /_wall$|fence_gate/.test(n.name) : /fence/.test(n.name)))
      }
      if (/_wall$/.test(name)) props.up = 'true'
    } else if (/_pane$|iron_bars/.test(name)) {
      for (const [s, [dx, , dz]] of Object.entries(sides)) {
        const n = at(dx, 0, dz)
        props[s] = String(n.solid || /_pane$|iron_bars|glass$/.test(n.name))
      }
    } else if (/_stairs$/.test(name)) {
      props.shape = this.stairShape(b, x, y, z)
    } else if (/_door$/.test(name)) {
      if (props.half === 'upper') { const lo = at(0, -1, 0); if (lo.name === name) { props.facing = lo.props.facing; props.open = lo.props.open } } else { const hi = at(0, 1, 0); if (hi.name === name) { props.hinge = hi.props.hinge } }
    } else if (props.half === 'upper') {
      const lo = at(0, -1, 0)
      if (lo.props.half === 'lower') return { name: lo.name, props: { ...lo.props, half: 'upper' } }
    } else if (name === 'grass_block') {
      const up = at(0, 1, 0).name; props.snowy = String(up === 'snow' || up === 'snow_block')
    }
    return { name, props }
  }

  stairShape (b, x, y, z) {
    const F = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }
    const ccw = { north: 'west', west: 'south', south: 'east', east: 'north' }
    const opp = { north: 'south', south: 'north', west: 'east', east: 'west' }
    const axis = (d) => d === 'north' || d === 'south' ? 'z' : 'x'
    const f = b.props.facing; const half = b.props.half
    const nb = (d) => { const [dx, dz] = F[d]; return this.blockInfo(this.get(x + dx, y, z + dz)) }
    const isStairs = (n) => /_stairs$/.test(n.name)
    const canTake = (d) => { const n = nb(d); return !isStairs(n) || n.props.facing !== f || n.props.half !== half }
    const back = nb(f)
    if (isStairs(back) && back.props.half === half) {
      const d1 = back.props.facing
      if (axis(d1) !== axis(f) && canTake(opp[d1])) return d1 === ccw[f] ? 'outer_left' : 'outer_right'
    }
    const front = nb(opp[f])
    if (isStairs(front) && front.props.half === half) {
      const d2 = front.props.facing
      if (axis(d2) !== axis(f) && canTake(d2)) return d2 === ccw[f] ? 'inner_left' : 'inner_right'
    }
    return 'straight'
  }

  tintFor (name) {
    const t = this.d.tints
    if (name === 'water') return t.water
    if (/^(spruce)_leaves$/.test(name)) return [97, 153, 97]
    if (/^(birch)_leaves$/.test(name)) return [128, 167, 85]
    if (/leaves|vine/.test(name)) return t.foliage
    return t.grass
  }

  // --- Meshing ---
  /** Build the geometry of section (sx, sy, sz) (section coordinates). */
  meshSection (sx, sy, sz) {
    const out = { opaque: new Builder(this), trans: new Builder(this) }
    const bx = sx << 4; const by = sy << 4; const bz = sz << 4
    const col = this.cols.get(sx + ',' + sz)
    if (!col || !col[sy]) return null
    const sec = col[sy]
    for (let i = 0; i < 4096; i++) {
      const id = sec[i]
      if (!id) continue
      const b = this.blockInfo(id)
      if (b.air) continue
      const x = bx + (i & 15); const y = by + (i >> 8); const z = bz + ((i >> 4) & 15)
      const lx = i & 15; const ly = i >> 8; const lz = (i >> 4) & 15
      const target = b.translucent ? out.trans : out.opaque
      if (b.special === 'fluid') { this.fluid(target, b, x, y, z, lx, ly, lz); continue }
      if (b.special === 'chest') { this.chest(target, b, lx, ly, lz); continue }
      let quads
      if (b.neighbourDependent) { const s = this.withNeighbours(b, x, y, z); quads = this.modelQuads(s.name, s.props) } else quads = this.modelQuads(b.name, b.props)
      const tint = this.tintFor(b.name)
      for (const q of quads) {
        if (q.cull) {
          const [dx, dy, dz] = DIRS[q.cull]
          const n = this.blockInfo(this.get(x + dx, y + dy, z + dz))
          if (n.solid || (b.cullSame && n.name === b.name)) continue
        }
        const shade = q.shade ? SHADE[q.dir] || 1 : 1
        const col = q.tint ? tint : null
        const ao = q.ao && b.ao !== false ? this.faceAo(q, x, y, z) : null
        target.quad(q, lx, ly, lz, shade, col, ao)
      }
    }
    return { opaque: out.opaque.finish(), trans: out.trans.finish() }
  }

  /** Corner shadows for a face lying on the block's edge. */
  faceAo (q, x, y, z) {
    if (!q.dir) return null
    const n = DIRS[q.dir]
    // Only faces flush with the block boundary.
    const axis = n[0] ? 0 : n[1] ? 1 : 2
    const plane = n[axis] > 0 ? 1 : 0
    if (!q.pos.every(p => Math.abs(p[axis] - plane) < 1e-4)) return null
    const res = []
    for (const p of q.pos) {
      const off = [0, 0, 0]
      const t = []
      for (let a = 0; a < 3; a++) {
        if (a === axis) { off[a] = n[a]; continue }
        t.push([a, p[a] > 0.5 ? 1 : -1])
      }
      const solid = (d) => this.blockInfo(this.get(x + d[0], y + d[1], z + d[2])).solid ? 1 : 0
      const s1 = [...off]; s1[t[0][0]] += t[0][1]
      const s2 = [...off]; s2[t[1][0]] += t[1][1]
      const c = [...off]; c[t[0][0]] += t[0][1]; c[t[1][0]] += t[1][1]
      const a1 = solid(s1); const a2 = solid(s2)
      res.push(AO[a1 && a2 ? 0 : 3 - (a1 + a2 + solid(c))])
    }
    return res
  }

  fluid (out, b, x, y, z, lx, ly, lz) {
    const isWater = b.name === 'water'
    const same = (dx, dy, dz) => this.blockInfo(this.get(x + dx, y + dy, z + dz)).name === b.name
    const height = (dx, dz) => {
      const n = this.blockInfo(this.get(x + dx, y, z + dz))
      if (n.name !== b.name) return n.solid ? -1 : 0
      if (same(dx, 1, dz)) return 1
      const lvl = Number(n.props.level || 0)
      return lvl >= 8 ? 8 / 9 : 1 - (lvl + 1) / 9
    }
    const corner = (dx, dz) => {
      // Average of the four blocks around this corner.
      let sum = 0; let cnt = 0
      for (const [ax, az] of [[0, 0], [dx, 0], [0, dz], [dx, dz]]) {
        const h = height(ax, az)
        if (h >= 1) return 1
        if (h >= 0) { sum += h; cnt++ }
      }
      return cnt ? sum / cnt : 0
    }
    const up = same(0, 1, 0)
    const hNW = up ? 1 : corner(-1, -1); const hNE = up ? 1 : corner(1, -1)
    const hSE = up ? 1 : corner(1, 1); const hSW = up ? 1 : corner(-1, 1)
    const still = this.d.textures[isWater ? 'block/water_still' : 'block/lava_still']
    const tint = isWater ? this.d.tints.water : null
    const make = (dir, pos) => ({ pos, uv: [[0, 0], [16, 0], [16, 16], [0, 16]], tex: still, dir })
    if (!up) out.quad(make('up', [[0, hNW, 0], [1, hNE, 0], [1, hSE, 1], [0, hSW, 1]]), lx, ly, lz, 1, tint, null, true)
    const sideOpen = (dx, dy, dz) => { const n = this.blockInfo(this.get(x + dx, y + dy, z + dz)); return n.name !== b.name && !n.solid }
    if (sideOpen(0, -1, 0)) out.quad(make('down', [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]), lx, ly, lz, 0.5, tint, null, true)
    if (sideOpen(0, 0, -1)) out.quad(make('north', [[1, hNE, 0], [0, hNW, 0], [0, 0, 0], [1, 0, 0]]), lx, ly, lz, 0.8, tint, null, true)
    if (sideOpen(0, 0, 1)) out.quad(make('south', [[0, hSW, 1], [1, hSE, 1], [1, 0, 1], [0, 0, 1]]), lx, ly, lz, 0.8, tint, null, true)
    if (sideOpen(-1, 0, 0)) out.quad(make('west', [[0, hNW, 0], [0, hSW, 1], [0, 0, 1], [0, 0, 0]]), lx, ly, lz, 0.6, tint, null, true)
    if (sideOpen(1, 0, 0)) out.quad(make('east', [[1, hSE, 1], [1, hNE, 0], [1, 0, 0], [1, 0, 1]]), lx, ly, lz, 0.6, tint, null, true)
  }

  chest (out, b, lx, ly, lz) {
    const tex = this.d.textures[b.name === 'ender_chest' ? 'entity/chest/ender' : b.name === 'trapped_chest' ? 'entity/chest/trapped' : 'entity/chest/normal']
    if (!tex) return
    const yr = { north: 0, east: 90, south: 180, west: 270 }[b.props.facing] || 0
    // Box unwrap like Minecraft entity models; the texture is 64x64.
    const box = (from, to, u, v, w, h, d) => {
      const px = (a, bb) => [a / 4, bb / 4] // 64-px texture -> 0-16 units
      const R = {
        up: [u + d, v, w, d], down: [u + d + w, v, w, d],
        east: [u, v + d, d, h], north: [u + d, v + d, w, h], west: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h]
      }
      for (const dir of DIR_NAMES) {
        const [ru, rv, rw, rh] = R[dir]
        const corners = faceCorners(dir, from, to).map(p => rotY(p, yr)).map(p => [p[0] / 16, p[1] / 16, p[2] / 16])
        const uv = [px(ru, rv), px(ru + rw, rv), px(ru + rw, rv + rh), px(ru, rv + rh)]
        out.quad({ pos: corners, uv, tex, dir: rotDir(dir, 0, yr) }, lx, ly, lz, SHADE[rotDir(dir, 0, yr)], null, null)
      }
    }
    box([1, 0, 1], [15, 10, 15], 0, 19, 14, 10, 14)
    box([1, 9, 1], [15, 14, 15], 0, 0, 14, 5, 14)
    box([7, 7, 0], [9, 11, 1], 0, 0, 2, 4, 1)
  }
}

function matchWhen (when, props) {
  if (when.OR) return when.OR.some(w => matchWhen(w, props))
  return Object.entries(when).every(([k, v]) => String(v).split('|').includes(String(props[k] === undefined ? 'false' : props[k])))
}

function isFullCube (quads) {
  const dirs = new Set()
  for (const q of quads) {
    if (!q.cull) return false
    dirs.add(q.cull)
    for (const p of q.pos) for (const c of p) if (c > 1e-4 && c < 1 - 1e-4) return false
  }
  return dirs.size === 6
}

/** Collects quads into typed arrays. */
class Builder {
  constructor (m) { this.m = m; this.pos = []; this.uv = []; this.col = []; this.anim = []; this.n = 0 }
  quad (q, lx, ly, lz, shade, tint, ao, fluid) {
    const t = q.tex; const W = this.m.W; const H = this.m.H
    const r = tint ? tint[0] / 255 : 1; const g = tint ? tint[1] / 255 : 1; const bl = tint ? tint[2] / 255 : 1
    for (let k = 0; k < 4; k++) {
      const p = q.pos[k]
      this.pos.push(lx + p[0], ly + p[1], lz + p[2])
      const u = q.uv[k]
      // 0-16 texture units -> atlas pixels, kept a hair inside the tile.
      const uu = Math.min(Math.max(u[0], 0.02), 15.98); const vv = Math.min(Math.max(u[1], 0.02), 15.98)
      this.uv.push((t.x + uu / 16 * t.w) / W, (t.y + vv / 16 * t.h) / H)
      const a = ao ? ao[k] : 1
      const s = shade * a
      this.col.push(r * s, g * s, bl * s)
      this.anim.push(t.n, t.ft, t.stride / W)
    }
    this.n++
  }

  finish () {
    if (!this.n) return null
    const idx = new Uint32Array(this.n * 6)
    for (let i = 0; i < this.n; i++) {
      const b = i * 4
      idx.set([b, b + 2, b + 1, b, b + 3, b + 2], i * 6)
    }
    return { pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), col: new Float32Array(this.col), anim: new Float32Array(this.anim), idx }
  }
}

module.exports = { Mesher }
