// Map pictures for the Recordings page (recordings.html): each game's
// thumbnail is its map drawn from above, the same picture as its card in
// the Prism Atlas. Exposes window.PrismMapThumbs.draw(canvas, mapName).
const { gunzipSync } = require('fflate')
const { loadBlockData, drawPreview } = require('./map-preview')

const BACKEND = 'https://bedwars-backend.onrender.com'
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
const getKey = () => { try { return localStorage.getItem('bedwarsAdminKey') || '' } catch { return '' } }

async function get (path) {
  const res = await fetch(BACKEND + path, { headers: { 'x-admin-key': getKey() } })
  if (!res.ok) throw new Error('The server answered ' + res.status)
  return res.json()
}

// map name (normalised) -> base64 gzip preview; loaded once per page.
let loading = null
function load () {
  if (!loading) {
    loading = (async () => {
      const maps = (await get('/maps')).maps || []
      // Same cache-busting address as the Atlas, so both pages share the browser's copy.
      const v = maps.map(m => m.slug + ':' + (m.builtAt || '')).join('|')
      let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0
      const [previews, bd] = await Promise.all([
        get('/maps/previews?v=' + (h >>> 0).toString(36)).then(j => j.previews || {}),
        loadBlockData()
      ])
      const byName = new Map()
      for (const m of maps) if (previews[m.slug]) byName.set(norm(m.name), previews[m.slug])
      return { byName, bd }
    })()
    loading.catch(() => { loading = null })
  }
  return loading
}

// Draws the map into the canvas; resolves true if there was a picture.
async function draw (canvas, mapName) {
  const { byName, bd } = await load()
  const p = byName.get(norm(mapName))
  if (!p) return false
  drawPreview(canvas, gunzipSync(Uint8Array.from(atob(p), ch => ch.charCodeAt(0))), bd.colorOf)
  return canvas.width > 0
}

globalThis.PrismMapThumbs = { draw, has: async (name) => (await load()).byName.has(norm(name)) }
