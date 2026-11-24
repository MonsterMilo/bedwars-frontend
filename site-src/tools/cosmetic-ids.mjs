// Builds src/data/cosmetics.json for the Nick Finder: every cosmetic in the
// Cosmetics Library (cosmetics.html ITEMS) with the Hypixel id Aurora and
// TrickAPI search by, plus any id seen on real players that the library
// doesn't have yet.
//   data/seen-cosmetic-ids.json     active* ids read from ~660 leaderboard players (Bordic cache)
//   data/backend-cosmetic-ids.json  the backend's known toppers, figurines and kill messages
// Run after the library gains items: npm run cosmetic-ids
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CATS = {
  final: { field: 'activekilleffect', hypixel: 'activeKillEffect', prefix: 'killeffect_', label: 'Final kill effect' },
  dance: { field: 'activevictorydance', hypixel: 'activeVictoryDance', prefix: 'victorydance_', label: 'Victory dance' },
  msg: { field: 'activekillmessages', hypixel: 'activeKillMessages', prefix: 'killmessages_', label: 'Kill messages' },
  topper: { field: 'activeislandtopper', hypixel: 'activeIslandTopper', prefix: 'islandtopper_', label: 'Island topper' },
  trail: { field: 'activeprojectiletrail', hypixel: 'activeProjectileTrail', prefix: 'projectileTrail_', label: 'Projectile trail' },
  bed: { field: 'activebeddestroy', hypixel: 'activeBedDestroy', prefix: 'beddestroy_', label: 'Bed destroy' },
  cry: { field: 'activedeathcry', hypixel: 'activeDeathCry', prefix: 'deathcry_', label: 'Death cry' },
  spray: { field: 'activesprays', hypixel: 'activeSprays', prefix: 'sprays_', label: 'Spray' },
  glyph: { field: 'activeglyph', hypixel: 'activeGlyph', prefix: 'glyph_', label: 'Glyph' },
  shop: { field: 'activenpcskin', hypixel: 'activeNPCSkin', prefix: 'npcskin_', label: 'Shopkeeper skin' },
  wood: { field: 'activewoodtype', hypixel: 'activeWoodType', prefix: 'woodSkin_', label: 'Wood skin' },
  figurine: { field: 'active_figurine', hypixel: 'active_figurine', prefix: 'figurine_', label: 'Figurine' }
};
const norm = s => String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]/g, '');
const pretty = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const html = readFileSync(join(root, 'cosmetics.html'), 'utf8');
// Each library card: id, category, name, rarity, and (kill messages) the first line.
const items = [...html.matchAll(/\{\s*id:\s*"([^"]+)",\s*cat:\s*"([a-z]+)",\s*name:\s*"([^"]+)"(?:,\s*rar:\s*"([a-z]+)")?([\s\S]*?)(?=\n\s*\{\s*id:|\n\];)/g)].map(m => {
  const line = /lines:\s*km\(\["((?:[^"\\]|\\.)*)"/.exec(m[5]);
  return { lib: m[1], cat: m[2], name: m[3], rar: m[4] || null, line: line ? line[1] : null };
});
const seen = JSON.parse(readFileSync(join(here, '..', 'data/seen-cosmetic-ids.json'), 'utf8'));
const backend = JSON.parse(readFileSync(join(here, '..', 'data/backend-cosmetic-ids.json'), 'utf8'));

const out = {};
let matched = 0;
for (const [cat, c] of Object.entries(CATS)) {
  const known = new Set([...Object.keys(seen[c.hypixel] || {}), ...(backend[c.field] || [])]
    .filter(id => id.toLowerCase().startsWith(c.prefix.toLowerCase()) && !/_none$/i.test(id)));
  const byNorm = new Map([...known].map(id => [norm(id.slice(c.prefix.length)), id]));
  const used = new Set();
  const list = [];
  for (const it of items.filter(i => i.cat === cat)) {
    const id = byNorm.get(norm(it.name)) || byNorm.get(norm(it.lib));
    if (id) { used.add(id); matched++; }
    list.push({
      id: id || c.prefix + it.name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name: it.name, lib: it.lib, thumb: existsSync(join(root, 'cosmetics/thumbs', `${it.lib}.webp`)), verified: !!id,
      ...(it.rar ? { rar: it.rar } : {}), ...(it.line ? { line: it.line } : {})
    });
  }
  for (const id of known) {
    if (used.has(id)) continue;
    list.push({ id, name: pretty(id.slice(c.prefix.length)), lib: null, thumb: false, verified: true });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  out[cat] = { field: c.field, label: c.label, items: list };
}
writeFileSync(join(here, '..', 'src/data/cosmetics.json'), JSON.stringify(out));
const total = Object.values(out).reduce((n, c) => n + c.items.length, 0);
console.log(`${total} cosmetics, ${matched} library items matched to a real id`);
for (const [cat, c] of Object.entries(out)) console.log(cat.padEnd(9), c.items.length, 'unverified:', c.items.filter(i => !i.verified).length);
