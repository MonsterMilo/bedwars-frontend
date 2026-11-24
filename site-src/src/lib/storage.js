// localStorage that never throws (private windows, blocked storage).
export function read(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch { return fallback; }
}
export function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked: the setting just won't stick */ }
}
export function readJson(key, fallback) {
  try { const v = read(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function writeJson(key, value) { write(key, JSON.stringify(value)); }
