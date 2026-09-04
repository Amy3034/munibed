/**
 * MuniBed service worker — caches the app shell (HTML/JS/CSS/icons/manifest
 * and third-party assets like Leaflet + fonts) so the app still opens on a
 * weak or dropped connection out on the trail. It never touches the live
 * API or the community board's Apps Script endpoint — those already have
 * their own offline handling in the page's own JS (the offline indicator /
 * data.js snapshot fallback), and a stale cached API response here would
 * only fight with that logic.
 *
 * Strategy: cache-first, falling back to network, with a background
 * refresh on every successful fetch so the next offline visit gets
 * whatever was last successfully loaded.
 *
 * Bump CACHE_VERSION whenever the app shell's own files change materially,
 * so old clients pick up the new shell instead of serving a stale one
 * forever.
 */

const CACHE_VERSION = 'munibed-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './community.html',
  './data.js?v=1.2',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

// Never cache/intercept these — they're live, dynamic, and already have
// their own offline handling in the page's own JS.
const NEVER_INTERCEPT_HOSTS = [
  'railway.app',
  'script.google.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // never fail install over one missing/renamed asset
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (NEVER_INTERCEPT_HOSTS.some(h => url.hostname.includes(h))) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req)
        .then(res => {
          // Cross-origin no-cors loads (Leaflet CDN, Google Fonts) come
          // back "opaque" — res.ok is always false for those even on
          // success, so opaque is accepted too. Same-origin/CORS
          // responses still require res.ok.
          if (res && (res.ok || res.type === 'opaque')) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
