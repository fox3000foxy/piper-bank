// Piper Bank : service worker volontairement simple.
// - Pages HTML : network-first (contenu toujours frais), repli cache hors-ligne.
// - CSS hache (nom site.<hash8>.css) : immuable, donc cache-first.
// - Autres assets same-origin (js/fonts/images/vendor/tsv) : network-first,
//   repli cache hors-ligne (jamais de contenu perime).
// - Hugging Face, ONNX, echantillons audio : jamais interceptes (IndexedDB + HTTP).
const CACHE = 'piper-bank-v3';
const STATIC_RE = /\.(css|js|mjs|woff2?|png|svg|ico|webmanifest|tsv|json|wasm|data)$/;
// CSS a hash de contenu (8 hex) : cache-first, le nom change a chaque edition.
const HASHED_CSS_RE = /(?:-|\.)[0-9a-f]{8}\.css$/;

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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

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

  // CSS hache : cache-first (le nom encode le contenu, donc jamais perime).
  if (HASHED_CSS_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      }),
    );
    return;
  }

  if (!STATIC_RE.test(url.pathname)) return;
  // Tous les autres assets : network-first avec repli cache hors-ligne.
  // (stale-while-revalidate servait l'ancien CSS/JS au premier chargement
  // suivant un deploiement, pendant que le HTML etait deja frais.)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
