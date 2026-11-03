// Web worker: keeps a copy of the world and builds section meshes, nearest
// to the camera first, so the page never stalls while the map is drawn.
const { Mesher } = require('./mesher')

let mesher = null
const dirty = new Set()
let cam = [0, 0, 0]
let scheduled = false

function markColumn (cx, cz) {
  for (let sy = 0; sy < 16; sy++) dirty.add(cx + ',' + sy + ',' + cz)
  // Neighbours' edge faces may now be hidden or shown.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mesher.cols.has((cx + dx) + ',' + (cz + dz))) for (let sy = 0; sy < 16; sy++) dirty.add((cx + dx) + ',' + sy + ',' + (cz + dz))
}
function markBlock (x, y, z) {
  const sx = x >> 4; const sy = y >> 4; const sz = z >> 4
  dirty.add(sx + ',' + sy + ',' + sz)
  const lx = x & 15; const ly = y & 15; const lz = z & 15
  if (lx === 0) dirty.add((sx - 1) + ',' + sy + ',' + sz)
  if (lx === 15) dirty.add((sx + 1) + ',' + sy + ',' + sz)
  if (ly === 0 && sy > 0) dirty.add(sx + ',' + (sy - 1) + ',' + sz)
  if (ly === 15 && sy < 15) dirty.add(sx + ',' + (sy + 1) + ',' + sz)
  if (lz === 0) dirty.add(sx + ',' + sy + ',' + (sz - 1))
  if (lz === 15) dirty.add(sx + ',' + sy + ',' + (sz + 1))
}

function schedule () {
  if (scheduled) return
  scheduled = true
  setTimeout(work, 0)
}

function work () {
  scheduled = false
  if (!dirty.size) { postMessage({ type: 'idle' }); return }
  // Nearest first.
  const list = [...dirty].map(k => { const [x, y, z] = k.split(',').map(Number); const d = (x * 16 + 8 - cam[0]) ** 2 + (y * 16 + 8 - cam[1]) ** 2 + (z * 16 + 8 - cam[2]) ** 2; return { k, x, y, z, d } })
  list.sort((a, b) => a.d - b.d)
  const start = Date.now()
  for (const s of list) {
    dirty.delete(s.k)
    const geo = mesher.meshSection(s.x, s.y, s.z)
    const transfer = []
    if (geo) for (const part of [geo.opaque, geo.trans]) if (part) transfer.push(part.pos.buffer, part.uv.buffer, part.col.buffer, part.anim.buffer, part.idx.buffer)
    postMessage({ type: 'section', key: s.k, x: s.x, y: s.y, z: s.z, geo }, transfer)
    if (Date.now() - start > 30) break
  }
  postMessage({ type: 'progress', left: dirty.size })
  schedule()
}

self.onmessage = ({ data: m }) => {
  if (m.type === 'init') { mesher = new Mesher(m.data); return }
  if (m.type === 'column') { mesher.setColumn(m.x, m.z, m.sections); markColumn(m.x, m.z) }
  if (m.type === 'blocks') {
    const b = m.blocks
    for (let i = 0; i < b.length; i += 4) { mesher.set(b[i], b[i + 1], b[i + 2], b[i + 3]); markBlock(b[i], b[i + 1], b[i + 2]) }
  }
  if (m.type === 'camera') { cam = m.pos; return }
  schedule()
}
