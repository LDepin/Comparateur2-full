// public/sw.js
const CACHE = "cmp2-static-v1";
const STATIC_ASSETS = [
  "/", "/favicon.ico", "/manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const isAPI = (url) => url.includes("/api/search") || url.includes("/api/calendar") || url.includes("/api/ping");

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (e.request.method !== "GET" || isAPI(url)) {
    return; // laisse passer réseau pour l'API
  }

  // Stale-while-revalidate pour statique
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((networkRes) => {
        caches.open(CACHE).then((cache) => {
          cache.put(e.request, networkRes.clone());
        });
        return networkRes;
      }).catch(() => cached); // offline → cache si dispo
      return cached || fetchPromise;
    })
  );
});