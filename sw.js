const APP_VERSION = '1.0.3';

const CACHE_NAME = `linkamarket-static-v${APP_VERSION}`;
const CACHE_RUNTIME = `linkamarket-runtime-v${APP_VERSION}`;
const CACHE_IMAGES = `linkamarket-images-v${APP_VERSION}`;

const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/sw.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

const MAX_IMAGES = 50;
const MAX_RUNTIME = 50;

self.addEventListener('install', event => {
  console.log(`[SW] Installing LinkaMarket version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log(`[SW] Activating LinkaMarket version ${APP_VERSION}`);
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name =>
              name.startsWith('linkamarket-') &&
              ![CACHE_NAME, CACHE_RUNTIME, CACHE_IMAGES].includes(name)
            )
            .map(name => caches.delete(name))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.origin.includes('supabase.co')) {
    event.respondWith(networkWithCacheFallbackStrategy(request));
    return;
  }

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(cacheFirstWithNetworkFallback(request));
    return;
  }

  if (request.headers.get('accept')?.includes('application/json')) {
    event.respondWith(staleWhileRevalidateStrategy(request, CACHE_RUNTIME, MAX_RUNTIME));
    return;
  }

  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot|otf)$/)) {
    event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
    return;
  }

  if (request.headers.get('accept')?.includes('image')) {
    event.respondWith(staleWhileRevalidateStrategy(request, CACHE_IMAGES, MAX_IMAGES));
    return;
  }

  event.respondWith(networkWithCacheFallbackStrategy(request));
});

async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const network = await fetch(request);
    const cache = await caches.open(CACHE_RUNTIME);
    cache.put(request, network.clone());
    return network;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const network = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, network.clone());
  return network;
}

async function staleWhileRevalidateStrategy(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(network => {
    cache.put(request, network.clone());
    cleanCache(cacheName, maxItems);
    return network;
  });

  return cached || fetchPromise;
}

async function networkWithCacheFallbackStrategy(request) {
  try {
    const network = await fetch(request);
    const cache = await caches.open(CACHE_RUNTIME);
    cache.put(request, network.clone());
    return network;
  } catch {
    return caches.match(request);
  }
}

async function cleanCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    cache.delete(keys[0]);
  }
}

/* ===============================
   PUSH NOTIFICATIONS
=============================== */

self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();

  const title = data.notification?.title || 'LinkaMarket';
  const options = {
    body: data.notification?.body || 'New update available',
    icon: 'https://i.postimg.cc/CKj013xj/IMG-20250518-121907.png',
    badge: 'https://i.postimg.cc/CKj013xj/IMG-20250518-121907.png',
    data: {
      url: data.data?.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

console.log(`LinkaMarket Service Worker v${APP_VERSION} loaded`);