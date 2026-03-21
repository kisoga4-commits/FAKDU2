/* FAKDU v9.46 - sw.js */
/* Offline-first service worker */

const SW_VERSION = 'FAKDU-v9.46.1';
const APP_CACHE = `fakdu-app-${SW_VERSION}`;
const RUNTIME_CACHE = `fakdu-runtime-${SW_VERSION}`;
const IMAGE_CACHE = `fakdu-images-${SW_VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './client.html',
  './manifest.json',
  './style.css',
  './icon.png',
  './js/db.js',
  './js/core.js',
  './js/core-client.js',
  './js/vault.js',

  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode'
];

//* helpers open
function isCrossOrigin(url) {
  try {
    return new URL(url, self.location.href).origin !== self.location.origin;
  } catch {
    return false;
  }
}

function isHtmlRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html')
  );
}

function isImageRequest(request) {
  return request.destination === 'image';
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'manifest' ||
    request.destination === 'worker' ||
    request.destination === 'image' ||
    /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|json|woff|woff2|ttf|eot|map)$/i.test(url.pathname)
  );
}

function getOfflineHtmlFallback(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.includes('client')) return './client.html';
  return './index.html';
}

async function safeCachePut(cache, assetUrl) {
  try {
    const crossOrigin = isCrossOrigin(assetUrl);
    const request = new Request(assetUrl, {
      cache: 'no-cache',
      mode: crossOrigin ? 'no-cors' : 'same-origin'
    });

    const response = await fetch(request);

    // cross-origin opaque response ก็เก็บได้
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      return true;
    }
  } catch (err) {
    console.warn('[SW] cache put fail:', assetUrl, err);
  }
  return false;
}

async function fromCacheFirst(request, cacheName = APP_CACHE) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

async function networkFirstHtml(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const fallback = await cache.match(getOfflineHtmlFallback(request.url));
    if (fallback) return fallback;

    const rootFallback = await cache.match('./index.html');
    if (rootFallback) return rootFallback;

    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head><body style="font-family:sans-serif;padding:24px">แอปกำลังออฟไลน์ และยังไม่พบไฟล์ fallback ในแคช</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
//* helpers close

//* install open
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);

      for (const asset of ASSETS_TO_CACHE) {
        await safeCachePut(cache, asset);
      }

      await self.skipWaiting();
      console.log('[SW] installed:', SW_VERSION);
    })()
  );
});
//* install close

//* activate open
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (![APP_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );

      await self.clients.claim();
      console.log('[SW] activated:', SW_VERSION);
    })()
  );
});
//* activate close

//* fetch open
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ข้าม extension / devtools / browser internals
  if (
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:' ||
    url.protocol === 'edge-extension:'
  ) {
    return;
  }

  // HTML / page navigation
  if (isHtmlRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // รูปภาพ
  if (isImageRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // asset static ในโปรเจ็กต์
  if (!isCrossOrigin(request.url) && isStaticAsset(request)) {
    event.respondWith(fromCacheFirst(request, APP_CACHE));
    return;
  }

  // CDN / Google Fonts / external libs
  if (isCrossOrigin(request.url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // default
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || Response.error();
    })
  );
});
//* fetch close

//* message open
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_OLD_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => {
            if (![APP_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key)) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      })()
    );
    return;
  }

  if (data.type === 'PRECACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        for (const asset of data.urls) {
          await safeCachePut(cache, asset);
        }
      })()
    );
  }
});
//* message close

//* sync open
self.addEventListener('sync', (event) => {
  if (event.tag === 'fakdu-auto-sync') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({
          includeUncontrolled: true,
          type: 'window'
        });

        for (const client of clients) {
          client.postMessage({
            type: 'FAKDU_SYNC_NOW',
            at: Date.now()
          });
        }
      })()
    );
  }
});
//* sync close
