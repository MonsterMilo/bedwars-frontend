// Service worker for the installable app.
//
// The rule that matters: the page itself (index.html) is ALWAYS fetched
// from the network first, revalidated past the browser's HTTP cache, so a
// new deploy shows up on the very next load. The saved copy is only used
// when the network fails (offline). Nothing here ever serves an old page
// to someone who is online.
//
// Also kept for offline use: Google Fonts and player skins (network first, so they stay
// current online). The backend API is never touched here: the page keeps
// its own saved copy of the sweat list (see saveSweatsForOffline in
// index.html), in a cache this worker leaves alone.
//
// Bump VERSION when this file's caching changes; old caches are dropped
// on activate.
const VERSION = "v1";
const PREFIX = "bst-sw-";
const PAGE_CACHE = `${PREFIX}page-${VERSION}`;
const FONT_CACHE = `${PREFIX}fonts-${VERSION}`;
const SKIN_CACHE = `${PREFIX}skins-${VERSION}`;
const SKIN_LIMIT = 150;

const SCOPE = new URL(self.registration.scope);
const PAGE_URL = new URL("./", SCOPE).href;
const SHELL = [
  "./",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
].map(path => new URL(path, SCOPE).href);
const SKIN_HOSTS = ["visage.surgeplay.com", "mc-heads.net", "crafatar.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PAGE_CACHE);
    // One failed file shouldn't stop the worker installing.
    await Promise.all(SHELL.map(url =>
      fetch(url, { cache: "no-cache" }).then(res => res.ok && cache.put(url, res)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [PAGE_CACHE, FONT_CACHE, SKIN_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(PREFIX) && !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === SCOPE.origin && url.href.startsWith(SCOPE.href)) {
    if (req.mode === "navigate") { event.respondWith(pageNetworkFirst(req)); return; }
    if (SHELL.includes(url.href.split("?")[0])) { event.respondWith(networkFirst(req, PAGE_CACHE)); return; }
    return;
  }
  // Font stylesheets can change; the font files at a given URL never do.
  if (url.hostname === "fonts.googleapis.com") { event.respondWith(staleWhileRevalidate(req, FONT_CACHE)); return; }
  if (url.hostname === "fonts.gstatic.com") { event.respondWith(cacheFirst(req, FONT_CACHE)); return; }
  if (req.destination === "image" && SKIN_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h))) {
    event.respondWith(networkFirst(req, SKIN_CACHE, SKIN_LIMIT));
  }
  // Everything else (the backend API, the denick datasets) goes straight
  // to the network as if this worker weren't here.
});

// The page: network first, never the HTTP cache's copy. Every URL of the
// page (?player=..., #anchors) shares one saved copy.
async function pageNetworkFirst(req) {
  try {
    // "manual" hands a redirect back to the browser to follow, which is the
    // only kind of redirect a page load may be answered with.
    const res = await fetch(req.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" });
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(PAGE_CACHE).then(cache => cache.put(PAGE_URL, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(PAGE_URL, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(req, cacheName, limit) {
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      const copy = res.clone();
      caches.open(cacheName).then(async cache => {
        await cache.put(req, copy);
        if (limit) trim(cache, limit);
      }).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req, { cacheName });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req, { cacheName });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then(cache => cache.put(req, copy)).catch(() => {});
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req, { cacheName });
  const update = fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(cacheName).then(cache => cache.put(req, copy)).catch(() => {});
    }
    return res;
  });
  if (cached) { update.catch(() => {}); return cached; }
  return update;
}

// Oldest entries go first (Cache Storage keeps insertion order).
async function trim(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}
