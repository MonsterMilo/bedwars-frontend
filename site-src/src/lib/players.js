// Recent searches and favourite players, kept per browser.
import { readJson, writeJson } from './storage.js';
import { signal } from './signal.js';

const RECENT = 'prismRecentPlayers';
const FAVS = 'prismFavouritePlayers';
const clean = list => (Array.isArray(list) ? list : []).filter(p => p && /^[A-Za-z0-9_]{1,16}$/.test(p.name)).slice(0, 30);
export const recent = signal(clean(readJson(RECENT, [])));
export const favourites = signal(clean(readJson(FAVS, [])));

export function addRecent(name, uuid) {
  const list = [{ name, uuid, at: Date.now() }, ...recent.value.filter(p => p.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
  recent.value = list;
  writeJson(RECENT, list);
}
export function clearRecent() { recent.value = []; writeJson(RECENT, []); }
export const isFavourite = name => favourites.value.some(p => p.name.toLowerCase() === String(name).toLowerCase());
export function toggleFavourite(name, uuid) {
  const list = isFavourite(name)
    ? favourites.value.filter(p => p.name.toLowerCase() !== name.toLowerCase())
    : [{ name, uuid, at: Date.now() }, ...favourites.value].slice(0, 30);
  favourites.value = list;
  writeJson(FAVS, list);
}
export const playerUrl = name => `player.html?name=${encodeURIComponent(name)}`;
