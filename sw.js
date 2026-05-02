// =====================================================================
// sw.js — KILL SWITCH: unregistra el SW viejo y borra todos los caches.
// Ya no usamos Service Worker (la PWA siempre se sirve fresca desde red).
// =====================================================================

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const regs = await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.navigate(c.url));
  })());
});

self.addEventListener('fetch', () => { /* no-op: pasa todo a red */ });
