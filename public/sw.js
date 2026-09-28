// Retire the former PWA worker for returning visitors. Keep this URL available
// so browsers with an existing registration can update and unregister it.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => name.startsWith('fruit-archive-') || name.startsWith('workbox-precache-v2-'))
      .map((name) => caches.delete(name)))
    await self.clients.claim()
    await self.registration.unregister()
  })())
})
