/* Wijaya Express service worker (hand-written, Phase 5 task 17).
 * App shell cached so the app opens from the home screen; navigations are
 * network-first with a clear offline message when there is no connection.
 * Never caches API calls (Supabase) or POSTs — only same-origin GETs. */

const CACHE_NAME = "wijaya-express-v1";
const APP_SHELL = [
  "/",
  "/pesan",
  "/driver",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const OFFLINE_HTML = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline — Wijaya Express</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center"><h1>Wijaya Express</h1><p><strong>Kamu sedang offline.</strong></p><p>Periksa koneksi internetmu, lalu coba lagi. Pesanan butuh koneksi untuk dikirim ke driver.</p><p><a href="/">Kembali ke beranda</a></p></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin (maps, Supabase)

  if (request.mode === "navigate") {
    // Network first so orders/prices are never stale; fall back to the
    // cached page, then to a clear offline message.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(OFFLINE_HTML, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              }),
          ),
        ),
    );
    return;
  }

  // Static same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? network;
    }),
  );
});
