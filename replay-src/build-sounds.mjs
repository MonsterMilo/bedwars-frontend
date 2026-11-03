// Writes ../replay/sounds.json: each Minecraft 1.8 sound name (as the
// server sends it, e.g. "step.stone") -> the files Mojang's sound server
// holds for it. The page plays them straight from Mojang
// (resources.download.minecraft.net); no sound files are copied here.
// Needs network; run when the sound list should change (rarely).
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const INDEX = 'https://launchermeta.mojang.com/v1/packages/f6ad102bcaa53b1a58358f16e376d548d44933ec/1.8.json'
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r }
const index = (await (await get(INDEX)).json()).objects
const h = index['minecraft/sounds.json'].hash
const sounds = await (await get(`https://resources.download.minecraft.net/${h.slice(0, 2)}/${h}`)).json()
const out = {}
for (const [name, def] of Object.entries(sounds)) {
  const files = []
  for (const s of def.sounds || []) {
    const p = typeof s === 'string' ? s : s.name
    const o = index['minecraft/sounds/' + p + '.ogg']
    if (o) files.push(o.hash)
  }
  if (files.length) out[name] = files
}
fs.writeFileSync(path.join(here, '..', 'replay', 'sounds.json'), JSON.stringify(out))
console.log(Object.keys(out).length, 'sounds')
