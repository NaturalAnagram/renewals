// Service worker: lets the installed app open offline.
// The app's own files are network-first, so a push to GitHub Pages shows up on the next launch
// while online, and the cached copy is used when offline (or when the network is too slow).
// Supabase API calls are never cached; sync.js handles being offline.

const CACHE = 'renewals-v2';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'sync.js', 'push.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', SUPABASE_JS,
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The pinned library version never changes, so the cached copy is always right.
  if (url.href === SUPABASE_JS) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  } else if (url.origin === location.origin) {
    event.respondWith(networkFirst(req));
  }
});

// Reminders from the send-reminders function (see push.js). They arrive with the app closed.
// The tag is the item's id, so a newer reminder for an item replaces the older one.
self.addEventListener('push', event => {
  const msg = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(msg.title || 'Renewals', {
    body: msg.body || '',
    tag: msg.tag,
    icon: 'icons/icon-192.png',
  }));
});

// Tapping a reminder opens the app, or brings it forward if it's already open.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const open = windows.find(w => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Pages may be opened with a query string or as a sign-in redirect; any page falls back to the app.
    return (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' && await cache.match('./'))
      || Response.error();
  }
}
