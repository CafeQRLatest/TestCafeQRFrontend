const CACHE_VERSION = 'v7';
const APP_SHELL_CACHE = `cafeqr-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cafeqr-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';

const APP_SHELL_URLS = [
  '/',
  '/owner/sales',
  '/owner/product-management',
  '/owner/table-management',
  '/owner/configurations',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  OFFLINE_FALLBACK_URL,
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => (
      Promise.allSettled(APP_SHELL_URLS.map((url) => cache.add(url)))
    ))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('cafeqr-') && ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function shouldBypass(request) {
  const url = new URL(request.url);
  return request.method !== 'GET'
    || url.pathname.endsWith('.mp3')
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/_next/webpack-hmr')
    || url.pathname.startsWith('/.well-known/');
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return caches.match(OFFLINE_FALLBACK_URL);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypass(request)) {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')
      || url.pathname.startsWith('/icons/')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.woff2')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
