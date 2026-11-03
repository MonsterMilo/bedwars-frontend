// Builds the replay viewer into ../replay/ (committed, since the site has
// no build step). Only Minecraft 1.8 data is bundled, to keep it small.
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, '..', 'replay')
const pv = path.join(here, 'node_modules', 'prismarine-viewer')

// minecraft-data normally bundles every version: swap in 1.8 only.
const mcdata = {
  name: 'mcdata-1.8',
  setup (b) {
    b.onResolve({ filter: /^\.\/data(\.js)?$/ }, a => a.importer.includes(`minecraft-data${path.sep}index.js`) ? { path: path.join(here, 'src', 'mcdata-1.8.js') } : undefined)
  }
}
// The renderer loads its worker and textures relative to the page; the
// page is /replay.html, the files live in /replay/.
const paths = {
  name: 'viewer-paths',
  setup (b) {
    b.onLoad({ filter: /prismarine-viewer[\\/]viewer[\\/]lib[\\/]worldrenderer\.js$/ }, async a => {
      let src = await fs.promises.readFile(a.path, 'utf8')
      src = src.replace("src = 'worker.js'", "src = 'replay/worker.js'")
        .replace('`textures/${this.version}.png`', '`replay/textures/${this.version}.png`')
        .replace('`blocksStates/${this.version}.json`', '`replay/blocksStates/${this.version}.json`')
      return { contents: src, loader: 'js' }
    })
    // Its own entity models aren't used (players.js draws players), and
    // they're most of the bundle's size.
    b.onLoad({ filter: /prismarine-viewer[\\/]viewer[\\/]lib[\\/]entities\.js$/ }, () => ({
      contents: 'class Entities { constructor () { this.entities = {} } clear () {} update () {} }\nmodule.exports = { Entities }', loader: 'js'
    }))
  }
}

const result = await esbuild.build({
  entryPoints: { app: path.join(here, 'src', 'main.js'), worker: path.join(pv, 'viewer', 'lib', 'worker.js') },
  bundle: true,
  outdir: out,
  minify: true,
  legalComments: 'none',
  target: 'es2019',
  define: {
    'process.env.NODE_DEBUG': 'false',
    'process.env.NODE_ENV': '"production"',
    'process.platform': '"browser"',
    global: 'globalThis',
    __dirname: '"/"'
  },
  inject: [path.join(here, 'src', 'inject.js')],
  plugins: [mcdata, paths],
  alias: {
    canvas: path.join(here, 'src', 'canvas-shim.js'),
    zlib: 'browserify-zlib',
    stream: 'stream-browserify',
    buffer: 'buffer/',
    events: 'events/',
    assert: 'assert/',
    fs: path.join(here, 'src', 'empty.js'),
    path: path.join(here, 'src', 'empty.js')
  },
  logLevel: 'warning',
  metafile: !!process.env.META
})
if (process.env.META) fs.writeFileSync(process.env.META, JSON.stringify(result.metafile))
if (result.errors.length) process.exit(1)

fs.mkdirSync(path.join(out, 'textures'), { recursive: true })
fs.mkdirSync(path.join(out, 'blocksStates'), { recursive: true })
fs.copyFileSync(path.join(pv, 'public', 'textures', '1.8.8.png'), path.join(out, 'textures', '1.8.8.png'))
fs.copyFileSync(path.join(pv, 'public', 'blocksStates', '1.8.8.json'), path.join(out, 'blocksStates', '1.8.8.json'))
fs.copyFileSync(path.join(pv, 'public', 'textures', '1.16.1', 'entity', 'steve.png'), path.join(out, 'steve.png'))
for (const f of fs.readdirSync(out, { recursive: true })) {
  const p = path.join(out, String(f))
  if (fs.statSync(p).isFile()) console.log(String(f).padEnd(28), (fs.statSync(p).size / 1024).toFixed(0) + ' KB')
}
