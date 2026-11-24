// The site key: the same one the tracker, recordings and atlas use
// (localStorage "bedwarsAdminKey"), so entering it once unlocks every page.
import { read, write } from './storage.js';
import { signal } from './signal.js';

const STORAGE = 'bedwarsAdminKey';
export const siteKey = signal(read(STORAGE, '') || '');
export const keyOwner = signal(null); // roster id / 'admin' once checked, null otherwise
// The rest of /whoami: { admin, editWindowDays, deleteWindowDays } once checked.
export const keyInfo = signal({});

export function setKey(value) {
  const clean = String(value || '').trim();
  write(STORAGE, clean || null);
  siteKey.value = clean;
  keyOwner.value = null;
  keyInfo.value = {};
}
export const hasKey = () => !!siteKey.value;
// Open the key dialog from anywhere (the dialog itself lives in the Shell).
export const keyDialog = signal(false);
