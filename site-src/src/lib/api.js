// Every call to the backend goes through here: the key header, a timeout,
// short-lived caching of answers, and one error shape for the pages.
import { siteKey } from './key.js';

export const BACKEND = 'https://bedwars-backend.onrender.com';
const cache = new Map(); // url -> { at, data }
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
  get rateLimited() { return this.status === 429; }
  get notFound() { return this.status === 404; }
}

function headers(extra = {}) {
  const h = { Accept: 'application/json', ...extra };
  if (siteKey.value) h['x-admin-key'] = siteKey.value;
  return h;
}

async function request(method, path, { body, timeout = 25_000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const onAbort = () => ctrl.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(BACKEND + path, {
      method,
      headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new ApiError((data && data.error) || `The server answered ${res.status}`, res.status, data);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal && signal.aborted) throw err;
    if (err && err.name === 'TimeoutError' || ctrl.signal.aborted) throw new ApiError('The server took too long. It may be waking up, so try again in a moment.', 0);
    throw new ApiError('Couldn\'t reach the server. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// GET with a small cache (per key, so a keyed answer isn't shown to a guest).
// A short tag for the key, so answers for one key are never served to another.
function keyTag() {
  const k = siteKey.value;
  if (!k) return 'g';
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return `k${h}`;
}
export function get(path, { maxAge = 60_000, signal } = {}) {
  const id = `${keyTag()}|${path}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < maxAge) return Promise.resolve(hit.data);
  if (!signal && inflight.has(id)) return inflight.get(id);
  const p = request('GET', path, { signal }).then(data => {
    cache.set(id, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return data;
  }).finally(() => inflight.delete(id));
  if (!signal) inflight.set(id, p);
  return p;
}
export const post = (path, body, opts) => request('POST', path, { body, ...opts });
export const enc = encodeURIComponent;
export const patch = (path, body, opts) => request('PATCH', path, { body, ...opts });
export const del = (path, opts) => request('DELETE', path, opts);
