// ponytail: hand-rolled SW; next-pwa not worth a dependency for 50 lines.
// ponytail: cache-first for static, network-first for pages; upgrade path:
// precache hashes / route handlers if offline needs to go deeper.
const CACHE = "retrofit-shell-v2";
const PRECACHE = ["/", "/log", "/scan", "/weight", "/settings", "/manifest.webmanifest", "/RF logo.png", "/fonts/material-symbols.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (!res.ok) return res;
          const copy = res.clone();
          return caches.open(CACHE).then((c) => c.put(request, copy)).then(() => res);
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
