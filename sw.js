// Minimal service worker: makes the app installable and opens it offline.
// Data always comes live from Supabase; only the app shell is cached.
const CACHE = 'home-v10';
const WORKER = 'https://fridge-mcp.yevhenheviuk.workers.dev';
// App shell for offline start. Feature files are cached on first load (network-first below).
const SHELL = ['./', './index.html', './app/base.css', './app/main.js', './app/core.js', './app/db.js', './app/people.js', './app/registry.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first for the app itself (so updates arrive), cache as fallback offline.
// cache: 'no-cache' = always revalidate with the server (cheap 304s). Without it the
// browser's HTTP cache (GitHub Pages: max-age=600) can mix files from two versions.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// Daily push: the push itself is empty, the text is fetched fresh from the worker.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = '🏠 Наш Дім';
    let body = 'Відміть, що з\u2019їли й купили сьогодні.';
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(WORKER + '/push/digest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub && sub.endpoint }),
      });
      if (r.ok) { const d = await r.json(); title = d.title || title; body = d.body || body; }
    } catch (_) { /* offline — show the generic reminder */ }
    await self.registration.showNotification(title, {
      body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'daily', renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return clients.openWindow('./');
  })());
});
