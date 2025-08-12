// sw.js – robust update + network-first for app shell

const SW_VERSION = "2025-08-12-02"; // bump on every deploy
const CACHE_STATIC = `melopoiia-static-${SW_VERSION}`;
const CACHE_DYNAMIC = `melopoiia-dynamic-${SW_VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./chapters.json",

  // JS modules
  "./js/main.js",
  "./js/state.js",
  "./js/engine.js",
  "./js/audio-engine.js",
  "./js/dom.js",
  "./js/navigation.js",
  "./js/tiles.js",
  "./js/story.js",
  "./js/solfege.js",
  "./js/manifest.js",
];

// Helper: detect app shell files (html/js/json/css)
function isAppShell(req) {
  const url = new URL(req.url);
  return (
    url.origin === self.location.origin &&
    (url.pathname.endsWith("/") ||
     url.pathname.endsWith(".html") ||
     url.pathname.endsWith(".js") ||
     url.pathname.endsWith(".css") ||
     url.pathname.endsWith(".json"))
  );
}

self.addEventListener("install", (evt) => {
  evt.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await Promise.allSettled(
      CORE.map(async (url) => {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) await cache.put(url, res.clone());
          else console.warn("[SW] CORE 404:", url);
        } catch (err) {
          console.warn("[SW] CORE fetch failed:", url, err);
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => ![CACHE_STATIC, CACHE_DYNAMIC].includes(k))
        .map(k => caches.delete(k))
    ))
      .then(() => self.clients.claim())
  );
});

// Routing:
// - App shell (html/js/css/json): network-first (so neue Deploys sofort kommen)
// - /assets/* (Audio/Bilder): cache-first (Offline freundlich)
self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cache-bust nur optisch: ignoriert ?v=… beim Cache-Key
  const cacheKey = url.origin + url.pathname;

  if (isAppShell(req)) {
    evt.respondWith(networkFirst(cacheKey, req));
  } else if (url.pathname.includes("/assets/")) {
    evt.respondWith(cacheFirst(cacheKey, req));
  }
});

async function networkFirst(cacheKey, req) {
  const dyn = await caches.open(CACHE_DYNAMIC);
  try {
    const fresh = await fetch(req, { cache: "no-store" });
    dyn.put(cacheKey, fresh.clone());
    return fresh;
  } catch {
    const cached = await dyn.match(cacheKey) || await caches.match(req);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(cacheKey, req) {
  const dyn = await caches.open(CACHE_DYNAMIC);
  const cached = await dyn.match(cacheKey) || await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  dyn.put(cacheKey, res.clone());
  return res;
}

// Optional: messages for future hooks
self.addEventListener("message", async (evt) => {
  const data = evt.data || {};
  if (data.type === "CACHE_ASSETS" && Array.isArray(data.assets)) {
    const c = await caches.open(CACHE_DYNAMIC);
    await Promise.allSettled(
      data.assets.map(p =>
        fetch(p, { cache: "no-store" }).then(r => c.put(p, r.clone()))
      )
    );
  }
});