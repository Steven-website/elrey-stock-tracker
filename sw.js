// =====================================================================
// sw.js — No-op service worker.
// Reemplaza al SW viejo (que intercepetaba con cache obsoleto) por uno
// que no toca ninguna request. Combinado con la falta de registro nuevo
// en index.html, los SW existentes terminan inactivos y la app pasa a
// servirse 100% desde la red.
// =====================================================================

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', () => { /* deja pasar a la red */ });
