/* Husholdning service worker — app shell cache */
const CACHE = 'husholdning-v28';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './src/style.css',
  './src/icons/sprite.svg',
  './src/js/format.js',
  './src/js/store.js',
  './src/js/templates.js',
  './src/js/render.js',
  './src/js/modals.js',
  './src/js/app.js',
  './src/modals/account.html',
  './src/modals/category.html',
  './src/modals/transaction.html',
  './src/modals/settings.html',
  './src/components/empty.html',
  './src/components/tx-row.html',
  './src/components/tx-month-group.html',
  './src/components/account-row.html',
  './src/components/config-row.html',
  './src/components/budget-row.html',
  './src/components/account-change-row.html',
  './src/components/cat-breakdown-row.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache API calls to Apps Script
  if (
    url.hostname.endsWith('script.google.com') ||
    url.hostname.endsWith('script.googleusercontent.com')
  )
    return;

  // Fonts: cache-first with runtime fill
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
              return res;
            })
            .catch(() => hit),
      ),
    );
    return;
  }

  // App shell: network-first so updates land, cache fallback for offline
  if (e.request.method === 'GET' && url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
  }
});
