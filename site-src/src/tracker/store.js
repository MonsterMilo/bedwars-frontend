// The tracked list: loading it (with the saved copy for offline or a slow
// server), live updates from everyone else, and every change we make.
import { signal } from '../lib/signal.js';
import { BACKEND, ApiError, post, patch, del, enc } from '../lib/api.js';
import { siteKey } from '../lib/key.js';
import { toast } from '../lib/toast.js';
import { notesOf, ROSTER } from './model.js';
import { play } from '../lib/audio.js';

export const sweats = signal([]);
// { state: 'loading'|'ready'|'saved'|'error', savedAt, progress, error }
export const loadState = signal({ state: 'loading' });
// Ids that just arrived or changed live, for a short highlight.
export const liveIds = signal(new Set());

const SAVED_CACHE = 'bst-saved-list'; // shared with the old tracker page
const SAVED_KEY = 'saved-sweats.json';
const POLL_MS = 40_000;
let changedSince = null;
let localWriteAt = 0;

// Every call carries the key; a 401 means the key is gone or wrong.
async function getJson(path) {
  const res = await fetch(BACKEND + path, {
    headers: { Accept: 'application/json', 'x-admin-key': siteKey.value || '' },
    credentials: 'omit', referrerPolicy: 'no-referrer'
  });
  if (res.status === 401) { lockedOut(); throw new ApiError('Needs a key', 401); }
  if (!res.ok) throw new ApiError(`The server answered ${res.status}`, res.status);
  return res.json();
}
export function lockedOut() {
  location.replace(`unlock.html?bad=1&next=${enc(location.pathname.split('/').pop() + location.search + location.hash)}`);
}

async function fetchAll(onProgress) {
  const all = [];
  let cursor = null;
  do {
    const p = new URLSearchParams({ paged: '1', limit: '1000' });
    if (cursor) p.set('cursor', cursor);
    const data = await getJson(`/sweats?${p}`);
    if (Array.isArray(data)) return data;
    all.push(...data.sweats);
    cursor = data.nextCursor;
    if (cursor && onProgress) onProgress(all.length, data.total);
  } while (cursor);
  return all;
}

function save(list) {
  if (!('caches' in window)) return;
  const body = JSON.stringify({ savedAt: Date.now(), sweats: list });
  caches.open(SAVED_CACHE).then(c => c.put(SAVED_KEY, new Response(body, { headers: { 'Content-Type': 'application/json' } }))).catch(() => {});
}
async function readSaved() {
  try {
    if (!('caches' in window)) return null;
    const res = await (await caches.open(SAVED_CACHE)).match(SAVED_KEY);
    const data = res && await res.json();
    return data && Array.isArray(data.sweats) && data.sweats.length ? data : null;
  } catch { return null; }
}

function newest(list) {
  let max = 0;
  for (const s of list) { const t = Date.parse(s.updatedAt || s.createdAt || ''); if (t > max) max = t; }
  return max ? new Date(max).toISOString() : null;
}

// Loads the full list. A slow server shows the saved copy after a moment.
export async function load({ quiet = false } = {}) {
  if (!quiet) loadState.value = { state: 'loading' };
  let settled = false;
  const graceTimer = setTimeout(async () => {
    if (settled || sweats.value.length) return;
    const saved = await readSaved();
    if (saved && !settled) { sweats.value = saved.sweats; loadState.value = { state: 'saved', savedAt: saved.savedAt, waking: true }; }
  }, 700);
  try {
    const list = await fetchAll((have, total) => { if (!sweats.value.length) loadState.value = { state: 'loading', progress: [have, total] }; });
    settled = true;
    sweats.value = list;
    changedSince = newest(list);
    loadState.value = { state: 'ready' };
    save(list);
  } catch (error) {
    settled = true;
    if (error.status === 401) return;
    const saved = sweats.value.length ? { savedAt: loadState.value.savedAt } : await readSaved();
    if (saved && (saved.sweats || sweats.value.length)) {
      if (saved.sweats) sweats.value = saved.sweats;
      loadState.value = { state: 'saved', savedAt: saved.savedAt, error };
    } else loadState.value = { state: 'error', error };
  } finally { clearTimeout(graceTimer); }
}

function brief(s) { return `${s.username} (${Number(s.star) || 0}★, ${(Number(s.fkdr) || 0).toFixed(2)} FKDR)`; }
function editBrief(before, after) {
  const was = notesOf(before); const now = notesOf(after);
  if (now.length > was.length) {
    const t = String(now[now.length - 1].text || '');
    return `New note on ${after.username}: "${t.length > 70 ? `${t.slice(0, 70)}…` : t}"`;
  }
  if (now.length !== was.length || now.some((n, i) => n.text !== (was[i] && was[i].text))) return `Notes changed on ${after.username}`;
  const newly = Object.keys(ROSTER).filter(k => after[k] && !before[k]);
  if (newly.length) return `${after.username} marked beaten by ${newly.map(k => ROSTER[k].label).join(', ')}`;
  if (after.cheating && !before.cheating) return `${after.username} flagged as a cheater`;
  if (after.boosting && !before.boosting) return `${after.username} flagged as boosting`;
  return `${after.username} was just updated`;
}
function flash(ids) {
  if (!ids.size) return;
  liveIds.value = ids;
  setTimeout(() => { if (liveIds.value === ids) liveIds.value = new Set(); }, 2600);
}

let busy = false;
async function poll() {
  if (document.hidden || busy || !sweats.value.length) return;
  busy = true;
  try {
    if (loadState.value.state === 'saved') { await load({ quiet: true }); return; }
    const p = new URLSearchParams({ paged: '1', limit: '25' });
    if (changedSince) p.set('changedSince', changedSince);
    const data = await getJson(`/sweats?${p}`);
    if (!data || !Array.isArray(data.sweats)) return;
    if (data.changedAt) changedSince = data.changedAt;
    let list = sweats.value;
    const known = new Set(list.map(s => s._id));
    const fresh = data.sweats.filter(s => s && s._id && !known.has(s._id));
    let changed = fresh.length > 0;
    if (changed) list = [...fresh, ...list];
    if (Array.isArray(data.removed) && data.removed.length) {
      const gone = new Set(data.removed);
      const n = list.length;
      list = list.filter(s => !gone.has(s._id));
      if (list.length !== n) changed = true;
    }
    const edits = [];
    if (Array.isArray(data.changed)) {
      list = list.map(s => {
        const doc = data.changed.find(d => d && d._id === s._id);
        if (!doc || doc.updatedAt === s.updatedAt) return s;
        edits.push({ before: s, after: doc });
        return doc;
      });
    }
    if (data.changedTruncated || (typeof data.total === 'number' && data.total !== list.length)) {
      list = await fetchAll();
      changed = true;
    }
    if (!changed && !edits.length) return;
    sweats.value = list;
    save(list);
    const quiet = Date.now() - localWriteAt < 20_000;
    if (fresh.length && !quiet) {
      play('arrive');
      toast(fresh.length === 1 ? `New sweat: ${brief(fresh[0])}` : `${fresh.length} new sweats: ${fresh.slice(0, 3).map(brief).join(', ')}${fresh.length > 3 ? '…' : ''}`, 6000);
    } else if (edits.length && !quiet) {
      toast(edits.length === 1 ? editBrief(edits[0].before, edits[0].after) : `${edits.length} sweats were just updated`, 5000);
    }
    flash(new Set([...fresh, ...edits.map(e => e.after)].map(s => s._id)));
  } catch { /* try again next time */ } finally { busy = false; }
}

let pollTimer = null;
export function startLive() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('online', () => { if (loadState.value.state === 'saved') load({ quiet: true }); });
}

// ---- Changes ----
function replace(doc) {
  if (!doc || !doc._id) return;
  sweats.value = sweats.value.map(s => (s._id === doc._id ? doc : s));
  save(sweats.value);
}
function wrote() { localWriteAt = Date.now(); }
function guard(err) { play('error'); if (err && err.status === 401) lockedOut(); throw err; }
const ok = (sound, v) => { play(sound); return v; };

// Adds a sweat. Resolves { duplicate } when someone already has them and
// confirm wasn't given; otherwise the saved entry.
export async function addSweat(body, { confirm = false } = {}) {
  wrote();
  try {
    const doc = await post('/sweats', { ...body, warnDuplicate: true, confirmDuplicate: confirm || undefined });
    if (doc && doc._id) { sweats.value = [doc, ...sweats.value.filter(s => s._id !== doc._id)]; save(sweats.value); flash(new Set([doc._id])); }
    return doc;
  } catch (err) {
    if (err.status === 409 && err.data && err.data.duplicate) return { duplicate: err.data.duplicate };
    return guard(err);
  }
}
export async function updateSweat(id, changes) {
  wrote();
  try { const doc = await patch(`/sweats/${enc(id)}`, changes); replace(doc); return ok('save', doc); } catch (e) { return guard(e); }
}
export async function removeSweat(id) {
  wrote();
  try {
    await del(`/sweats/${enc(id)}`);
    sweats.value = sweats.value.filter(s => s._id !== id);
    save(sweats.value);
    play('delete');
  } catch (e) { guard(e); }
}
export async function restoreSweat(id) {
  wrote();
  try { const doc = await post(`/sweats/${enc(id)}/restore`, {}); if (doc && doc._id) { sweats.value = [doc, ...sweats.value]; save(sweats.value); } return ok('success', doc); } catch (e) { return guard(e); }
}
export async function addNote(id, text) {
  wrote();
  try { const doc = await post(`/sweats/${enc(id)}/notes`, { text }); replace(doc); return ok('save', doc); } catch (e) { return guard(e); }
}
export async function editNote(id, noteId, text) {
  wrote();
  try { const doc = await patch(`/sweats/${enc(id)}/notes/${enc(noteId)}`, { text }); replace(doc); return ok('save', doc); } catch (e) { return guard(e); }
}
export async function deleteNote(id, noteId) {
  wrote();
  try { const doc = await del(`/sweats/${enc(id)}/notes/${enc(noteId)}`); replace(doc); return ok('delete', doc); } catch (e) { return guard(e); }
}
