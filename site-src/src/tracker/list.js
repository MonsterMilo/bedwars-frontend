// Turning the tracked list into what a view shows: filters, sort, dupes,
// rivals, the summary strip, the sweat of the day and CSV export.
import { ROSTER, ROSTER_KEYS, indexOf, tierOf, identityKey, parseDay, notesOf, noteMatches, beatenBy } from './model.js';

export const PAGE_SIZE = 32;
export const DEFAULT_FILTERS = { q: '', stars: '', fkdr: '', index: '', date: '', dupes: false, cheaters: false, boosters: false };
export const SORTS = [
  ['dateAdded', 'Date'], ['star', 'Stars'], ['fkdr', 'FKDR'], ['index', 'Index'], ['wlr', 'WLR'], ['cheating', 'Cheating'], ['boosting', 'Boosting']
];
const num = v => Number(v) || 0;

export function activeFilterCount(f) {
  return ['stars', 'fkdr', 'index', 'date'].filter(k => String(f[k]).trim() !== '').length + ['dupes', 'cheaters', 'boosters'].filter(k => f[k]).length;
}

// { list, counts } where counts[identity] = how many times we beat them.
export function process(all, f, sort) {
  const q = f.q.trim().toLowerCase();
  let list = q ? all.filter(s => String(s.username || '').toLowerCase().includes(q) || noteMatches(s, q)) : all.slice();
  const minF = f.fkdr !== '' ? parseFloat(f.fkdr) : null;
  const minI = f.index !== '' ? parseFloat(f.index) : null;
  const minS = f.stars !== '' ? parseInt(f.stars, 10) : null;
  const since = f.date ? parseDay(f.date) : null;
  if (minF != null || minI != null || minS != null || since) {
    list = list.filter(s => {
      if (minF != null && num(s.fkdr) < minF) return false;
      if (minI != null && indexOf(s) < minI) return false;
      if (minS != null && num(s.star) < minS) return false;
      if (since && !(parseDay(s.dateAdded) >= since)) return false;
      return true;
    });
  }
  if (f.cheaters || f.boosters) list = list.filter(s => (f.cheaters && s.cheating) || (f.boosters && s.boosting));
  const counts = {};
  const keys = new Map();
  for (const s of list) { const k = identityKey(s); keys.set(s, k); counts[k] = (counts[k] || 0) + 1; }
  if (f.dupes) {
    const seen = new Set();
    list = list.filter(s => { const k = keys.get(s); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (sort && sort.field) {
    const val = s => (sort.field === 'index' ? indexOf(s)
      : sort.field === 'dateAdded' ? (parseDay(s.dateAdded) || 0) - 0 + (Date.parse(s.createdAt || '') || 0) / 1e13
        : sort.field === 'cheating' || sort.field === 'boosting' ? (s[sort.field] ? 1 : 0)
          : num(s[sort.field]));
    list.sort((a, b) => { const x = val(a); const y = val(b); return x < y ? (sort.asc ? -1 : 1) : x > y ? (sort.asc ? 1 : -1) : 0; });
  }
  return { list, counts };
}

export function paginate(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  return { items: list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, pages };
}

// Rivals: anyone we've beaten in 2+ games, with who beat them how often.
export function rivalMap(all) {
  const map = new Map();
  for (const s of all) {
    const k = identityKey(s);
    let r = map.get(k);
    if (!r) map.set(k, r = { games: 0, by: {} });
    r.games++;
    for (const p of ROSTER_KEYS) if (s[p]) r.by[p] = (r.by[p] || 0) + 1;
  }
  return map;
}
export function rivalFor(map, s) {
  const r = map.get(identityKey(s));
  if (!r || r.games < 2) return null;
  const who = ROSTER_KEYS.filter(k => r.by[k]).sort((a, b) => r.by[b] - r.by[a]).map(k => ({ key: k, n: r.by[k] }));
  return { games: r.games, who };
}
export function roman(n) {
  let out = '';
  for (const [v, d] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (n >= v) { out += d; n -= v; }
  }
  return out;
}
export const rivalSummary = r => `Beaten in ${r.games} games${r.who.length ? ` (${r.who.map(w => ROSTER[w.key].label + (w.n > 1 ? ` ×${w.n}` : '')).join(', ')})` : ''}`;

// Leaderboard: how many each roster person has beaten, ties share a place.
export function rosterCounts(list) {
  const counts = Object.fromEntries(ROSTER_KEYS.map(k => [k, 0]));
  for (const s of list) for (const k of ROSTER_KEYS) if (s[k]) counts[k]++;
  const ranked = [...ROSTER_KEYS].sort((a, b) => counts[b] - counts[a]);
  return ranked.map(k => ({ key: k, n: counts[k], place: 1 + ranked.filter(o => counts[o] > counts[k]).length }));
}

// Summary strip for a list.
export function summary(list) {
  if (!list.length) return null;
  const best = pick => list.reduce((a, b) => (pick(b) > pick(a) ? b : a));
  const monthAgo = Date.now() - 30 * 86400000;
  const recent = list.filter(s => { const d = parseDay(s.dateAdded); return d && d.getTime() >= monthAgo; }).length;
  const cheats = list.filter(s => s.cheating).length;
  const boosts = list.filter(s => s.boosting).length;
  return {
    total: list.length, recent,
    topStar: best(s => num(s.star)), topFkdr: best(s => num(s.fkdr)), topIndex: best(indexOf),
    cheats, boosts, flagged: list.filter(s => s.cheating || s.boosting).length
  };
}

// ---- Sweat of the day ----
// Same pick for everyone on a day (US Eastern). Lowest hash of day|identity
// wins among real sweats (index ≥ 100k), never a cheater, never yesterday's.
const SOTD_TZ = 'America/New_York';
export const sotdDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: SOTD_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function players(all) {
  const by = new Map();
  for (const s of all) {
    if (!s || !s.username) continue;
    const k = identityKey(s);
    let p = by.get(k);
    if (!p) by.set(k, p = { key: k, records: [] });
    p.records.push(s);
  }
  return [...by.values()].map(p => {
    p.records.sort((a, b) => (Date.parse(a.dateAdded) || 0) - (Date.parse(b.dateAdded) || 0));
    p.latest = p.records[p.records.length - 1];
    p.cheating = p.records.some(r => r.cheating);
    return p;
  });
}
function pickFor(day, pool) {
  let best = null; let score = Infinity;
  for (const p of pool) { const h = hash(`${day}|${p.key}`); if (h < score) { score = h; best = p; } }
  return best;
}
export function sweatOfTheDay(all) {
  const ps = players(all);
  const pool = ps.filter(p => !p.cheating && indexOf(p.latest) >= 100000);
  if (!pool.length) return null;
  const y = pool.length > 1 ? pickFor(sotdDay(new Date(Date.now() - 86400000)), pool) : null;
  const pick = pickFor(sotdDay(), y ? pool.filter(p => p !== y) : pool);
  const pct = value => {
    const vals = ps.map(p => value(p.latest)).filter(Number.isFinite);
    const v = value(pick.latest);
    return vals.length && Number.isFinite(v) ? Math.round(vals.filter(x => x <= v).length / vals.length * 100) : 0;
  };
  const s = pick.latest;
  const n = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? NaN : Number(v));
  return {
    sweat: s, times: pick.records.length, first: pick.records[0].dateAdded,
    by: ROSTER_KEYS.filter(k => pick.records.some(r => r[k])),
    note: ([...pick.records].reverse().map(r => notesOf(r)).find(x => x.length) || []).slice(-1)[0] || null,
    stats: [
      ['FKDR', n(s.fkdr), pct(r => n(r.fkdr)), 2],
      ['WLR', n(s.wlr), pct(r => n(r.wlr)), 2],
      ['Finals', n(s.finals), pct(r => n(r.finals)), 0],
      ['Index', indexOf(s), pct(r => indexOf(r)), 0]
    ]
  };
}
// Time until midnight Eastern.
export function sotdLeft() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: SOTD_TZ, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date()).map(p => [p.type, Number(p.value)]));
  const left = 86400 - ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second);
  const h = Math.floor(left / 3600); const m = Math.floor((left % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

// ---- CSV ----
const COLUMNS = [
  ['Username', s => s.username], ['UUID', s => s.uuid || ''], ['Date added', s => s.dateAdded || ''],
  ['Stars', s => num(s.star)], ['FKDR', s => num(s.fkdr)], ['WLR', s => num(s.wlr)], ['BBLR', s => num(s.bblr)], ['KDR', s => num(s.kdr)],
  ['Finals', s => num(s.finals)], ['Final deaths', s => num(s.finalDeaths)], ['Beds', s => num(s.beds)], ['Beds lost', s => num(s.bedsLost)],
  ['Kills', s => num(s.kills)], ['Deaths', s => num(s.deaths)], ['Index', s => Math.round(indexOf(s))], ['Tier', s => tierOf(indexOf(s)).name],
  ['Cheating', s => (s.cheating ? 'yes' : '')], ['Boosting', s => (s.boosting ? 'yes' : '')],
  ['Beaten by', s => beatenBy(s).map(k => ROSTER[k].label).join('; ')],
  ['Notes', s => notesOf(s).length], ['Latest note', s => { const n = notesOf(s); return n.length ? n[n.length - 1].text : ''; }]
];
export function csvCell(v) {
  if (typeof v === 'number') return String(v);
  let str = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`; // never a spreadsheet formula
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
export function toCsv(list) {
  return [COLUMNS.map(c => csvCell(c[0])).join(','), ...list.map(s => COLUMNS.map(c => csvCell(c[1](s))).join(','))].join('\r\n');
}
export function downloadCsv(list) {
  const blob = new Blob([`﻿${toCsv(list)}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bedwars-players-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
