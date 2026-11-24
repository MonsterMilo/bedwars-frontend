// The tracker keeps its filters, view, page and open player in the URL, so
// a link reopens exactly what you were looking at (same names as before).
import { DEFAULT_FILTERS } from './list.js';

export function readUrl() {
  const p = new URLSearchParams(location.search);
  const f = { ...DEFAULT_FILTERS };
  for (const k of ['q', 'stars', 'fkdr', 'index', 'date']) if (p.get(k)) f[k] = p.get(k);
  for (const k of ['dupes', 'cheaters', 'boosters']) f[k] = p.get(k) === '1';
  // Old links: ?query=Name searched for a name.
  if (!f.q && p.get('query')) f.q = p.get('query');
  const view = ['grid', 'table', 'leaderboard'].includes(p.get('view')) ? p.get('view') : 'grid';
  return {
    filters: f,
    sort: p.get('sort') ? { field: p.get('sort'), asc: p.get('dir') !== 'desc' } : null,
    view,
    lb: (p.get('lb') || '').split(',').filter(Boolean),
    page: Math.max(1, parseInt(p.get('page'), 10) || 1),
    player: p.get('player') || '',
    denick: p.get('denick') || '',
    denickMode: p.get('denickMode') === 'player' ? 'player' : 'nick'
  };
}

// Merge changes into the URL (replaceState: Back isn't filled with steps).
export function writeUrl(changes) {
  const p = new URLSearchParams(location.search);
  p.delete('query');
  const set = (k, v) => { if (v === '' || v == null || v === false) p.delete(k); else p.set(k, v === true ? '1' : String(v)); };
  if (changes.filters) for (const [k, v] of Object.entries(changes.filters)) set(k, typeof v === 'string' ? v.trim() : v);
  if ('sort' in changes) { set('sort', changes.sort && changes.sort.field); set('dir', changes.sort && !changes.sort.asc ? 'desc' : ''); }
  if ('view' in changes) set('view', changes.view === 'grid' ? '' : changes.view);
  if ('lb' in changes) set('lb', changes.lb && changes.lb.length ? changes.lb.join(',') : '');
  if ('page' in changes) set('page', changes.page > 1 ? changes.page : '');
  if ('player' in changes) set('player', changes.player);
  if ('denick' in changes) set('denick', changes.denick);
  if ('denickMode' in changes) set('denickMode', changes.denickMode === 'player' ? 'player' : '');
  const qs = p.toString();
  const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
}
