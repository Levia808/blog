/* Levia blog PWA: public reading shell only; never cache account or API traffic. */
'use strict';

const VERSION = 'levia-pwa-v8';
const CORE_CACHE = `${VERSION}-core`;
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => Promise.all([
      cache.add(new URL('offline.html', scope).href).catch(() => null),
      cache.add(scope).catch(() => null)
    ])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('levia-pwa-') && ![CORE_CACHE, PAGE_CACHE, ASSET_CACHE].includes(key))
      .map((key) => caches.delete(key))))
      .then(async () => {
        if (self.registration.navigationPreload) {
          try { await self.registration.navigationPreload.enable(); } catch (_) { /* Optional browser optimization. */ }
        }
        await self.clients.claim();
      })
  );
});

function isPrivatePath(pathname) {
  const scopePath = new URL(self.registration.scope).pathname;
  const localPath = pathname.startsWith(scopePath) ? `/${pathname.slice(scopePath.length)}` : pathname;
  return /^\/(?:admin|admin-cms|login|profile)(?:\/|$)/i.test(localPath) || /^\/api(?:\/|$)/i.test(localPath);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'PREFETCH_URLS' || !Array.isArray(data.urls)) return;
  const urls = data.urls.slice(0, 10);
  event.waitUntil((async () => {
    for (const rawURL of urls) {
      try {
        const url = new URL(rawURL, self.registration.scope);
        if (url.origin !== self.location.origin || url.search || isPrivatePath(url.pathname) || url.pathname.endsWith('/sw.js') || /\.(?:mp4|webm|mov|mp3|m4a|m4v|avi|pdf)$/i.test(url.pathname)) continue;
        const request = new Request(url.href, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'text/html' } });
        const cached = await caches.match(request, { cacheName: PAGE_CACHE });
        if (cached) continue;
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic' && /^text\/html\b/i.test(response.headers.get('Content-Type') || '') && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(request, response.clone());
          trimCache(PAGE_CACHE, 40).catch(() => {});
        }
      } catch (_) { /* Prefetch must never interfere with the foreground page. */ }
    }
  })());
});

async function refreshPage(request, preloadResponse) {
  // Navigation Preload starts the HTML request before a sleeping worker wakes.
  // Unsupported browsers simply fall back to fetch(request).
  const response = (await preloadResponse) || await fetch(request);
  if (response && response.status === 200 && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
    const cache = await caches.open(PAGE_CACHE);
    await cache.put(request, response.clone());
    trimCache(PAGE_CACHE, 40).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  if (isPrivatePath(url.pathname) || url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    if (url.search) return;
    const refresh = refreshPage(request, event.preloadResponse);
    event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: PAGE_CACHE });
      if (cached) return cached;
      try { return await refresh; } catch (_) {
        const offlineURL = new URL('offline.html', self.registration.scope).href;
        return (await caches.match(offlineURL, { cacheName: CORE_CACHE })) || Response.error();
      }
    })());
    return;
  }

  const isStaticAsset = /\.(?:css|js|mjs|json|woff2?|ttf|otf|svg|png|jpe?g|webp|ico)$/i.test(url.pathname);
  if (!isStaticAsset || /\.(?:mp4|webm|mov|mp3|m4a)$/i.test(url.pathname)) return;
  const refresh = fetch(request).then(async (response) => {
    const lengthHeader = response.headers.get('Content-Length');
    const isMedia = /\.(?:svg|png|jpe?g|webp|ico)$/i.test(url.pathname);
    const mediaIsSmall = lengthHeader && Number(lengthHeader) <= 5 * 1024 * 1024;
    if (response && response.status === 200 && response.type === 'basic' && (!isMedia || mediaIsSmall)) {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
      trimCache(ASSET_CACHE, MAX_ASSETS).catch(() => {});
    }
    return response;
  });
  event.waitUntil(refresh.catch(() => {}));
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try { return await refresh; } catch (_) { return Response.error(); }
  })());
});
