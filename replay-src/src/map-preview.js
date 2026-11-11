// Map drawings from above (top block per column, from the backend's
// /maps/previews), shared by the Atlas list and the Recordings page.
const { Mesher } = require('./mesher')

// --- Block colours (for the drawings from above) ---
let blockData = null
async function loadBlockData () {
  if (blockData) return blockData
  const res = await fetch('replay/blocks.json')
  if (!res.ok) throw new Error('Couldn\'t load the block data')
  const data = await res.json()
  const mesher = new Mesher(data)
  const texName = new Map(Object.entries(data.textures).map(([k, v]) => [v, k]))
  const cache = new Map()
  const colorOf = (state) => {
    let c = cache.get(state)
    if (c) return c
    c = null
    try {
      const b = mesher.blockInfo(state)
      const quads = b.air ? [] : mesher.modelQuads(b.name, b.props)
      const q = quads.find(q => q.dir === 'up') || quads[0]
      const avg = q && data.avgColors[texName.get(q.tex)]
      if (avg) {
        const tint = q.tint ? mesher.tintFor(b.name) : [255, 255, 255]
        c = avg.slice(0, 3).map((v, k) => v * tint[k] / 255)
      }
    } catch { /* unknown block */ }
    if (!c) c = [150, 150, 150]
    cache.set(state, c)
    return c
  }
  blockData = { data, mesher, colorOf }
  return blockData
}

/** Draws a preview (top block per column, from the backend) into a canvas. */
function drawPreview (canvas, raw, colorOf) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const w = dv.getUint16(0); const h = dv.getUint16(2)
  const states = 13; const heights = 13 + w * h * 2
  // Trim to where there's something.
  let x0 = w; let x1 = -1; let z0 = h; let z1 = -1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (raw[states + (j * w + i) * 2] | raw[states + (j * w + i) * 2 + 1]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < z0) z0 = j; if (j > z1) z1 = j }
  if (x1 < 0) return
  const pad = 2
  x0 = Math.max(0, x0 - pad); z0 = Math.max(0, z0 - pad); x1 = Math.min(w - 1, x1 + pad); z1 = Math.min(h - 1, z1 + pad)
  const size = Math.max(x1 - x0 + 1, z1 - z0 + 1)
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const ox = Math.floor((size - (x1 - x0 + 1)) / 2); const oz = Math.floor((size - (z1 - z0 + 1)) / 2)
  for (let j = z0; j <= z1; j++) {
    for (let i = x0; i <= x1; i++) {
      const k = j * w + i
      const st = raw[states + k * 2] | (raw[states + k * 2 + 1] << 8)
      if (!st) continue
      const y = raw[heights + k]
      // Lit from the north-west, like a relief map.
      const yN = j > 0 ? raw[heights + k - w] : y; const yW = i > 0 ? raw[heights + k - 1] : y
      const slope = Math.max(-3, Math.min(3, (y - yN) + (y - yW)))
      const light = Math.max(0.55, Math.min(1.25, 0.82 + (y - 64) / 120 + slope * 0.06))
      const c = colorOf(st)
      const o = ((j - z0 + oz) * size + (i - x0 + ox)) * 4
      img.data[o] = Math.min(255, c[0] * light); img.data[o + 1] = Math.min(255, c[1] * light); img.data[o + 2] = Math.min(255, c[2] * light); img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

module.exports = { loadBlockData, drawPreview }
