// =====================================================================
// sw.js — Service Worker · Inventario El Rey
// Estrategia: cache-first para archivos locales,
//             network-only para llamadas a Supabase
// =====================================================================

const CACHE = 'elrey-v4';

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
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
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

  // Network-only: Supabase, CDN, Google Fonts
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) return;

  // Cache-first para archivos locales de la app
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
