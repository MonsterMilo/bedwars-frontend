// Tracker rules shared by every part of the page: the roster, the index and
// its tiers, identities, dates and who may change what.
import { keyOwner, keyInfo, siteKey } from '../lib/key.js';

// Roster ids match the backend's sweat fields; initials are unique.
export const ROSTER = {
  milo: { label: 'Milo', initials: 'M', color: '#5ee7ff' },
  potat: { label: 'Potat', initials: 'P', color: '#a98bff' },
  aballs: { label: 'ABoi', initials: 'A', color: '#ffc46b' },
  zoiv: { label: 'Zoiv', initials: 'Z', color: '#ff7ab6' },
  max: { label: 'Max', initials: 'Mx', color: '#5be39a' },
  sqoz: { label: 'Sqoz', initials: 'Sq', color: '#7aa8ff' },
  kermit: { label: 'Kermit', initials: 'Kr', color: '#b8e86a' },
  ssent: { label: 'Ssent', initials: 'Sn', color: '#ff9a62' },
  key: { label: 'Key', initials: 'Ky', color: '#f5dc5a' }
};
export const ROSTER_KEYS = Object.keys(ROSTER);
export const personLabel = id => (id === 'admin' ? 'Admin' : ROSTER[id] ? ROSTER[id].label : '');
export const personColor = id => (id === 'admin' ? 'var(--accent-3)' : ROSTER[id] ? ROSTER[id].color : 'var(--faint)');
export const personInitials = id => (id === 'admin' ? '★' : ROSTER[id] ? ROSTER[id].initials : '?');
export const beatenBy = s => ROSTER_KEYS.filter(k => s && s[k]);

// The site's own index: FKDR² × stars, placed on tiers.
export const TIERS = [
  { max: 5e3, name: 'Casual', key: 't1' },
  { max: 5e4, name: 'Tryhard', key: 't2' },
  { max: 5e5, name: 'Sweat', key: 't3' },
  { max: 5e6, name: 'Demon', key: 't4' },
  { max: Infinity, name: 'Final Boss', key: 't5' }
];
const n = v => Number(v) || 0;
export const indexOf = s => n(s.fkdr) * n(s.fkdr) * n(s.star);
export const tierIndex = index => TIERS.findIndex(t => index < t.max);
export const tierOf = index => TIERS[tierIndex(index)];
// 0..1 on a log scale (10^7 fills the gauge).
export const gaugeOf = index => Math.max(0.03, Math.min(1, Math.log10(Math.max(1, index)) / 7));

// A player's UUID is their identity; older entries without one go by name.
export const cleanUuid = u => String(u || '').replace(/-/g, '').toLowerCase();
export function identityKey(s) {
  const u = cleanUuid(s.uuid);
  return u ? `uuid:${u}` : `name:${String(s.username || '').toLowerCase()}`;
}

// "2026-10-01" is a calendar day: read it as local midnight, not UTC.
export function parseDay(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const out = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return Number.isNaN(out.getTime()) ? null : out;
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const notesOf = s => (Array.isArray(s && s.notes) ? s.notes.filter(x => x && x.text) : []);
export const noteMatches = (s, q) => !!q && notesOf(s).some(x => String(x.text).toLowerCase().includes(q));

// What the current key may do (the backend checks the same rules).
const fullAccess = () => !!keyInfo.value.admin;
const within = (createdAt, days) => days == null || Date.now() - (createdAt ? new Date(createdAt).getTime() : 0) <= days * 86400000;
export const canWrite = () => !!(siteKey.value && keyOwner.value);
export function canRemove(s) {
  if (!canWrite()) return false;
  if (fullAccess()) return true;
  if (!s.addedBy || s.addedBy !== keyOwner.value) return false;
  return within(s.createdAt, keyInfo.value.deleteWindowDays);
}
export function canEdit(s) {
  if (!canWrite()) return false;
  return fullAccess() || within(s.createdAt, keyInfo.value.editWindowDays);
}
export function canChangeNote(note, action) {
  if (!canWrite()) return false;
  const days = action === 'edit' ? keyInfo.value.editWindowDays : keyInfo.value.deleteWindowDays;
  if (fullAccess() || days == null) return true;
  if (action === 'edit' && (note.author || '') !== keyOwner.value) return false;
  return within(note.createdAt, days);
}
export const isAdminKey = () => keyOwner.value === 'admin';

// Live stats from the backend's /player answer, the way the tracker logs them.
export function statsFromPlayer(player) {
  const bw = (player && player.stats && player.stats.Bedwars) || {};
  const g = k => Number(bw[k]) || 0;
  const finals = g('final_kills_bedwars'); const finalDeaths = g('final_deaths_bedwars');
  const wins = g('wins_bedwars'); const losses = g('losses_bedwars');
  const beds = g('beds_broken_bedwars'); const bedsLost = g('beds_lost_bedwars');
  const kills = g('kills_bedwars'); const deaths = g('deaths_bedwars');
  return {
    star: (player && player.achievements && player.achievements.bedwars_level) || 0,
    fkdr: finals / (finalDeaths || 1), wlr: wins / (losses || 1), kdr: kills / (deaths || 1), bblr: bedsLost === 0 ? beds : beds / bedsLost,
    finals, finalDeaths, wins, losses, beds, bedsLost, kills, deaths
  };
}
