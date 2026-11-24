// Denick search: every source we have, merged so the newest sighting wins.
//   Nick -> Owners: who has been seen using a nick.
//   Player -> Nicks used: every nick a player has been seen with.
import { BACKEND, enc, get, post } from '../lib/api.js';
import { siteKey } from '../lib/key.js';

// Public, keyless gists the scrapers keep up to date.
const GISTS = [
  { name: 'Diamond Dome', url: 'https://gist.githubusercontent.com/MonsterMilo/169045d75d17d68a41d051bae056106d/raw/diamond-dome-nicks.json' },
  { name: 'Tricktracker', url: 'https://gist.githubusercontent.com/MonsterMilo/f599b8b81224056ea42a436ece0be5ed/raw/tricktracker-nicks.json' },
  { name: 'Bedlify', url: 'https://gist.githubusercontent.com/MonsterMilo/74fc374c134c5e09d5d79590fc7ed70f/raw/observer-nicks.json' }
];
const gistData = new Map(); // name -> { byNick, byPlayer }
const gistLoading = new Map();

function parseGist(data) {
  const byNick = new Map(); const byPlayer = new Map();
  for (const item of (Array.isArray(data && data.nicks) ? data.nicks : [])) {
    if (!Array.isArray(item)) continue;
    const [nick, raw] = item;
    if (typeof nick !== 'string' || !Array.isArray(raw)) continue;
    const owners = raw.filter(o => Array.isArray(o) && typeof o[0] === 'string')
      .map(([player, count, first, last, game]) => ({ player, count: count || 1, first: (first || 0) * 1000, last: (last || 0) * 1000, game: game || 'Unknown' }))
      .sort((a, b) => b.last - a.last);
    if (!owners.length) continue;
    byNick.set(nick.toLowerCase(), { nick, owners });
    for (const o of owners) {
      const k = o.player.toLowerCase();
      if (!byPlayer.has(k)) byPlayer.set(k, []);
      byPlayer.get(k).push({ nick, ...o });
    }
  }
  for (const l of byPlayer.values()) l.sort((a, b) => b.last - a.last);
  return { byNick, byPlayer };
}
function loadGist(g) {
  if (gistData.has(g.name)) return Promise.resolve(gistData.get(g.name));
  if (gistLoading.has(g.name)) return gistLoading.get(g.name);
  const p = fetch(g.url, { referrerPolicy: 'no-referrer', credentials: 'omit' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(d => { const parsed = parseGist(d); gistData.set(g.name, parsed); return parsed; })
    .finally(() => gistLoading.delete(g.name));
  gistLoading.set(g.name, p);
  return p;
}
const loadGists = () => Promise.allSettled(GISTS.map(loadGist));

function gistEntries(mode, value) {
  const k = String(value).toLowerCase();
  return GISTS.flatMap(g => {
    const d = gistData.get(g.name);
    if (!d) return [];
    if (mode === 'nick') {
      const r = d.byNick.get(k);
      return r ? r.owners.map(o => ({ username: o.player, nick: r.nick, updated: o.last, source: g.name, sighting: o })) : [];
    }
    return (d.byPlayer.get(k) || []).map(n => ({ username: n.player, nick: n.nick, updated: n.last, source: g.name, sighting: n }));
  });
}

// Backend calls that answer { entries } or an error flag, never throw.
async function raw(path) {
  const res = await fetch(BACKEND + path, { headers: { Accept: 'application/json', 'x-admin-key': siteKey.value || '' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, data };
}
const toMs = u => (typeof u === 'number' ? (u > 0 && u < 1e11 ? u * 1000 : u) : (Date.parse(u) || 0));
async function denicker(path) {
  try {
    const { data } = await raw(path);
    if (data.noKey) return { entries: [] };
    return { entries: (data.success && data.nicks ? data.nicks : []).map(n => ({ username: n.username, nick: n.nick, updated: toMs(n.updated), source: 'Denicker API' })) };
  } catch (e) { return { entries: [], error: e.message }; }
}
async function bedlify(kind, value) {
  try {
    const { ok, status, data } = await raw(`/bedlify/${kind}/${enc(value)}`);
    if (data.noKey) return { entries: [] };
    if (!ok) return { entries: [], error: data.error || `HTTP ${status}` };
    return { entries: (Array.isArray(data.sightings) ? data.sightings : []).map(s => ({ username: s.player, nick: s.nick, updated: s.last, source: 'Bedlify', sighting: s })) };
  } catch (e) { return { entries: [], error: e.message }; }
}
async function entriesFrom(path) {
  try { const { ok, data } = await raw(path); return { entries: ok && Array.isArray(data.entries) ? data.entries : [] }; } catch { return { entries: [] }; }
}

export function merge(entries, keyField) {
  const by = new Map();
  for (const e of entries) {
    const k = String(e[keyField] || '').toLowerCase();
    if (!k) continue;
    const have = by.get(k);
    if (!have) { by.set(k, { ...e, alsoIn: new Set() }); continue; }
    const wins = (e.updated || 0) > (have.updated || 0);
    const keep = wins ? { ...e, alsoIn: have.alsoIn } : have;
    const other = wins ? have : e;
    if (other.source !== keep.source) keep.alsoIn.add(other.source);
    by.set(k, keep);
  }
  return [...by.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function subtitle(e) {
  const parts = [e.source];
  if (e.sighting) parts.push(`Seen ${e.sighting.count > 1 ? `${e.sighting.count}×` : 'once'} in ${e.sighting.game}`);
  const also = [...(e.alsoIn || [])].filter(s => s !== e.source);
  if (also.length) parts.push(`also in ${also.join(', ')}`);
  return parts.join(' · ');
}

// Runs a search: { results, partial }.
export async function search(mode, query) {
  await loadGists();
  let sets;
  if (mode === 'nick') {
    sets = await Promise.all([
      denicker(`/denicker/nick/${enc(query)}`), bedlify('nick', query),
      entriesFrom(`/denick-requests/known/nick/${enc(query)}`), entriesFrom(`/resolved-nicks/search/nick/${enc(query)}`)
    ]);
  } else {
    let uuid = null;
    try { uuid = (await get(`/mojang/${enc(query)}`, { maxAge: 10 * 60_000 })).id; } catch { /* unknown name */ }
    sets = await Promise.all([
      uuid ? denicker(`/denicker/history/${uuid}?username=${enc(query)}`) : { entries: [] }, bedlify('player', query),
      entriesFrom(`/denick-requests/known/player/${enc(query)}`), entriesFrom(`/resolved-nicks/search/player/${enc(query)}`)
    ]);
  }
  const results = merge([...sets.flatMap(s => s.entries), ...gistEntries(mode, query)], mode === 'nick' ? 'username' : 'nick');
  const partial = !!(sets[0].error || sets[1].error);
  // The activity log keeps who searched what (top three answers only).
  post('/activity/denick', { mode, query, partial, count: results.length, results: results.slice(0, 3).map(e => ({ username: e.username, nick: e.nick, source: e.source })) }).catch(() => {});
  return { results, partial };
}

// ---- Ask Milo ----
export const REQUEST_LABELS = { open: 'Waiting', found: 'Found', possible: 'Possible', notfound: 'Not found' };
export async function myRequests() {
  const { ok, data } = await raw('/denick-requests/mine');
  if (!ok) return { requests: [], on: true };
  return { requests: Array.isArray(data.requests) ? data.requests : [], on: data.on !== false };
}
export const sendRequest = body => post('/denick-requests', body);
