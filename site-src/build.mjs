// Builds the rebuilt website pages.
//   src/pages/<page>.jsx  -> ../app/<page>-<hash>.js (+ shared chunks, + .css)
//   html/<page>.html      -> ../<page>.html with {{js}} / {{css}} filled in
// Every script and stylesheet is a separate file, so the pages run under a
// Content-Security-Policy with no inline scripts at all.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'app');
const pages = readdirSync(join(here, 'src/pages')).filter(f => f.endsWith('.jsx')).map(f => basename(f, '.jsx'));
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: Object.fromEntries(pages.map(p => [p, join(here, 'src/pages', `${p}.jsx`)])),
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir: out,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  minify: !watch,
  sourcemap: false,
  target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.png': 'file', '.svg': 'file', '.woff2': 'file' },
  metafile: true,
  legalComments: 'none',
  logLevel: 'info'
};

function writeHtml(meta) {
  const byPage = {};
  for (const [file, info] of Object.entries(meta.outputs)) {
    if (!info.entryPoint) continue;
    const page = basename(info.entryPoint, '.jsx');
    byPage[page] = { js: file.replace(/^.*?app\//, 'app/'), css: info.cssBundle ? info.cssBundle.replace(/^.*?app\//, 'app/') : null };
  }
  for (const page of pages) {
    const tpl = readFileSync(join(here, 'html', `${page}.html`), 'utf8');
    const b = byPage[page];
    if (!b) throw new Error(`no build output for ${page}`);
    const html = tpl
      .replace('{{css}}', b.css ? `<link rel="stylesheet" href="${b.css}">` : '')
      .replace('{{js}}', `<script type="module" src="${b.js}"></script>`)
      .replace('{{head}}', readFileSync(join(here, 'html', '_head.html'), 'utf8').trim());
    writeFileSync(join(root, `${page}.html`), html);
  }
}

if (watch) {
  const ctx = await esbuild.context({ ...options, plugins: [{ name: 'html', setup(b) { b.onEnd(r => r.metafile && writeHtml(r.metafile)); } }] });
  await ctx.watch();
} else {
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out, { recursive: true });
  const result = await esbuild.build(options);
  writeHtml(result.metafile);
  const sizes = Object.entries(result.metafile.outputs).filter(([, o]) => o.entryPoint).map(([f, o]) => `${basename(f)} ${(o.bytes / 1024).toFixed(1)} KB`);
  console.log(sizes.join('\n'));
}
