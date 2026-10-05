// Piper Bank — service worker volontairement simple.
// - Pages HTML : network-first (contenu toujours frais), repli cache hors-ligne.
// - Assets same-origin (css/js/fonts/images/vendor/tsv) : stale-while-revalidate.
// - Hugging Face, ONNX, échantillons audio : jamais interceptés (IndexedDB + HTTP).
const CACHE = 'piper-bank-v1';
const STATIC_RE = /\.(css|js|mjs|woff2?|png|svg|ico|webmanifest|tsv|json|wasm|data)$/;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }
  if (!STATIC_RE.test(new URL(req.url).pathname)) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    }),
  );
});
