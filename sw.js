const APP_VERSION = '3.2.0'; // Updated version

const CACHE_STATIC = `linkamarket-static-v${APP_VERSION}`;
const CACHE_RUNTIME = `linkamarket-runtime-v${APP_VERSION}`;
const CACHE_IMAGES = `linkamarket-images-v${APP_VERSION}`;
const CACHE_MODELS = `linkamarket-ai-models-v1`; // Dedicated AI Cache

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  // Fonts CSS
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap'
];

// Limits to prevent filling up user's phone storage
const MAX_IMAGES = 100; 
const MAX_RUNTIME = 50;

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(keys => Promise.all(
        keys.map(key => {
          if (key.startsWith('linkamarket-') && 
              ![CACHE_STATIC, CACHE_RUNTIME, CACHE_IMAGES, CACHE_MODELS].includes(key)) {
            return caches.delete(key);
          }
        })
      )),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // 1. STRATEGY: AI MODELS & WASM (Aggressive Cache First)
  // These are the ~80MB files from jsdelivr. Once we have them, we NEVER ask the network again.
  if (url.hostname.includes('cdn.jsdelivr.net') || url.pathname.endsWith('.wasm') || url.pathname.endsWith('.bin')) {
    event.respondWith(cacheFirstStrategy(request, CACHE_MODELS));
    return;
  }

  // 2. STRATEGY: SUPABASE API (Network First)
  // We want real-time prices/stock, but fallback to cache if the SME has no data.
  if (url.origin.includes('supabase.co')) {
    event.respondWith(networkFirstStrategy(request, CACHE_RUNTIME));
    return;
  }

  // 3. STRATEGY: IMAGES (Stale While Revalidate)
  // Show the old product photo immediately, update in background if changed.
  if (request.headers.get('accept')?.includes('image')) {
    event.respondWith(staleWhileRevalidateStrategy(request, CACHE_IMAGES, MAX_IMAGES));
    return;
  }

  // 4. STRATEGY: GOOGLE FONTS (Files)
  if (url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirstStrategy(request, CACHE_STATIC));
    return;
  }

  // 5. STRATEGY: Navigation (HTML)
  // For Single Page Apps, always return index.html if offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Default: Stale While Revalidate for JS/CSS
  event.respondWith(staleWhileRevalidateStrategy(request, CACHE_STATIC, MAX_RUNTIME));
});

// ── STRATEGIES ──────────────────────────────────────────────────────────────

// Cache First: Used for AI Models and Fonts. Very fast.
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const network = await fetch(request);
  cache.put(request, network.clone());
  return network;
}

// Network First: Used for Supabase (Real-time data).
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const network = await fetch(request);
    cache.put(request, network.clone());
    return network;
  } catch {
    return cache.match(request);
  }
}

// Stale While Revalidate: Best for UI assets and Product images.
async function staleWhileRevalidateStrategy(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(network => {
    cache.put(request, network.clone());
    limitCacheSize(cacheName, maxItems);
    return network;
  }).catch(() => cached); // If network fails, return cached

  return cached || fetchPromise;
}

// Helper to keep storage clean
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
  }
}

// ... (Keep your existing Push Notification listeners here) ...