// Tracked player names for search suggestions. Only with a key: loaded the
// first time a search box or the jump menu is used, then kept a few minutes.
import { signal } from './signal.js';
import { get } from './api.js';
import { siteKey } from './key.js';

export const tracked = signal([]); // [{ name, uuid }]
let loadedFor = null, at = 0;

export function loadTracked() {
  const key = siteKey.value;
  if (!key) { if (tracked.value.length) tracked.value = []; loadedFor = null; return; }
  if (loadedFor === key && Date.now() - at < 5 * 60_000) return;
  loadedFor = key; at = Date.now();
  get('/sweats/names', { maxAge: 5 * 60_000 }).then(d => {
    if (siteKey.value !== key) return;
    tracked.value = ((d && d.names) || []).filter(n => n && /^[A-Za-z0-9_]{1,16}$/.test(n[0])).map(([name, uuid]) => ({ name, uuid }));
  }, () => { loadedFor = null; });
}

// Starts-with first, then contains; at most `max`.
export function matchTracked(list, q, max = 5, skip = new Set()) {
  if (q.length < 2) return [];
  const out = [];
  for (const p of list) {
    const k = p.name.toLowerCase();
    if (skip.has(k) || !k.includes(q)) continue;
    out.push({ ...p, s: k.startsWith(q) ? 2 : 1 });
  }
  return out.sort((a, b) => b.s - a.s || a.name.length - b.name.length).slice(0, max);
}
