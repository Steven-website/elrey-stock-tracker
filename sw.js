// =====================================================================
// sw.js — Service Worker · Inventario El Rey
// Estrategia: cache-first para archivos locales,
//             network-only para llamadas a Supabase
// =====================================================================

const CACHE = 'elrey-v32';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './state.js',
  './api.js',
  './auth.js',
  './mock.js',
  './modals.js',
  './scanner.js',
  './utils.js',
  './views.js',
  './queue.js',
  './audit.js',
  './githubBackend.js',
  './qrcode.min.js',
];

// Recursos opcionales pre-cacheados (best-effort) — si fallan no rompemos
// el install. Incluye la librería vendorizada local (puede no existir si la
// action aún no corrió) y los CDNs como respaldo.
const CDN_LIBS = [
  './html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.10/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      // CDN libs: best-effort, no rompemos el install si una falla
      await Promise.all(CDN_LIBS.map(u =>
        fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Network-only para datos en vivo (no queremos cachear respuestas Supabase)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('api.qrserver.com')
  ) return;

  // Cache-first con fallback a red para todo lo demás (incluye CDNs y fuentes)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res) return res;
        // Solo cacheamos respuestas exitosas u opaque (CDN no-cors). Nunca un 404.
        if (res.status === 200 || res.type === 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        }
        return res;
      }).catch(() => {
        // El fallback a index.html SOLO aplica a navegación. Para script/img/etc
        // dejamos que el error suba para que el llamador lo maneje (no servir HTML
        // como si fuera JS — eso rompía el escáner).
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
