// Builds the replay viewer into ../replay/ (committed, since the site has
// no build step): app.js (the page), atlas.js (the Atlas page, atlas.html),
// mapthumbs.js (map pictures on recordings.html),
// mesh.js (the block-meshing worker),
// and the block data/texture atlas from build-assets.mjs.
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, '..', 'replay')

// Old files from the first version (prismarine-viewer).
for (const f of ['worker.js', 'textures', 'blocksStates']) fs.rmSync(path.join(out, f), { recursive: true, force: true })

const result = await esbuild.build({
  entryPoints: { app: path.join(here, 'src', 'main.js'), atlas: path.join(here, 'src', 'atlas.js'), mapthumbs: path.join(here, 'src', 'mapthumbs.js'), mesh: path.join(here, 'src', 'mesh-worker.js') },
  bundle: true,
  outdir: out,
  minify: true,
  legalComments: 'none',
  target: 'es2019',
  define: { global: 'globalThis' },
  logLevel: 'warning',
  metafile: !!process.env.META
})
if (result.errors.length) process.exit(1)
if (process.env.META) fs.writeFileSync(process.env.META, JSON.stringify(result.metafile))

execFileSync(process.execPath, [path.join(here, 'build-assets.mjs')], { stdio: 'inherit' })
fs.copyFileSync(path.join(here, 'node_modules', 'minecraft-assets', 'minecraft-assets', 'data', '1.13.2', 'entity', 'steve.png'), path.join(out, 'steve.png'))

for (const f of fs.readdirSync(out, { recursive: true })) {
  const p = path.join(out, String(f))
  if (fs.statSync(p).isFile()) console.log(String(f).padEnd(28), (fs.statSync(p).size / 1024).toFixed(0) + ' KB')
}
