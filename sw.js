// Track Mint offline support.
//
// Strategy: network-first, falling back to cache when the network is
// unavailable, opportunistically caching every successful GET response as it
// happens. This needs no hand-maintained precache list — the app's own
// cache-busting query strings (app.js?v=N, styles.css?v=N) just become new
// cache keys automatically, and the Tesseract.js/pdf.js CDN scripts (plus
// whatever WASM/traineddata Tesseract.js itself fetches at runtime) get
// cached the same way the first time they're used online.
//
// Bump CACHE_NAME whenever this file changes so the activate step clears the
// previous cache instead of running two cache generations side by side.
const CACHE_NAME = "track-mint-cache-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a copy of every successful response as it's fetched — this
        // is what makes the OCR engine's CDN scripts and runtime WASM/
        // traineddata downloads work offline after their first use, without
        // this service worker needing to know their exact URLs in advance.
        if (response && response.status === 200) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
      )
  );
});
