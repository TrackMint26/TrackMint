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
// previous cache instead of running two cache generations side by side. Also
// bump it any time you need to force every device to drop a stale snapshot,
// independent of whether sw.js's own logic changed.
const CACHE_NAME = "track-mint-cache-v3";

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
    // { cache: "no-cache" } forces the browser to revalidate with the server
    // (a cheap conditional GET, cheap 304 if unchanged) instead of silently
    // reusing an unexpired HTTP cache entry — GitHub Pages serves everything
    // with `Cache-Control: max-age=600`, and without this override a plain
    // fetch() here could still be satisfied by that 10-minute browser cache
    // even though this handler's intent is "always check the network first."
    // That gap is exactly what let one device keep running months-old OCR/
    // extraction logic while another, freshly loaded, ran the current build.
    fetch(event.request, { cache: "no-cache" })
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
