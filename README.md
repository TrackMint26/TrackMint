# Track Mint

## How to launch the app

### Option 1: Open directly in a browser
1. Open your file explorer.
2. Navigate to:
   `C:\Users\khush\Documents\Codex\2026-06-09\an-application-or-software-for-expense\outputs\msme-expense-scanner`
3. Double-click `index.html`.
4. The app will open in your default browser.

**Limitation:** opening the file this way (a `file://` URL) disables two features that
require what browsers call a "secure context" — **live camera capture** and
**offline support** (see below). Everything else, including uploading a photo and
running OCR on it, works fine. Use Option 2 or 3, or host the app on HTTPS, if you
need those two features.

### Option 2: Use a simple local web server
Some browsers may restrict local file features, so using a local server is more reliable.

#### If you have Python installed
1. Open PowerShell in the project folder.
2. Run:
   `python -m http.server 8080`
3. Open your browser and visit:
   `http://localhost:8080`

#### If you have Python 3 and `python` is not available, try:
`py -m http.server 8080`

### Option 3: Use VS Code Live Server extension
1. Open the `msme-expense-scanner` folder in VS Code.
2. Install the `Live Server` extension if needed.
3. Right-click `index.html` and choose `Open with Live Server`.

## What the app includes
- New app name: **Track Mint**
- Light and dark theme support with user preference saved locally
- Receipt scanning (file upload or live camera capture), OCR data extraction, expense tracking, and alerts
- Export expenses as CSV
- Offline support after the first online visit (see below)

## OCR — runs entirely in the browser, no server required

Receipt scanning uses [Tesseract.js](https://github.com/naptha/tesseract.js) (a
WebAssembly build of the Tesseract OCR engine), loaded from a CDN `<script>` tag
in `index.html`. There is **no local Python/Flask server and no installed
Tesseract binary to set up** — the OCR engine ships as part of the page itself
and runs on-device.

This means:
- **Works on any machine** that can open the page — nothing to install, no
  environment-specific setup (this replaced an earlier local-server-based
  design that broke depending on which Tesseract version happened to be
  installed on the host PC).
- **Works on mobile** — Android Chrome and iOS Safari support WebAssembly, so
  scanning a bill from a phone camera works the same as on desktop.
- **First scan in a session downloads the OCR engine + English language data**
  (a few MB) from the CDN, so an internet connection is needed once per
  session; after that the same in-memory worker is reused for subsequent
  scans without re-downloading.
- The relevant code is `getOcrWorker()` / `runBrowserOcr()` in `app.js`.

`server.py` / `README_PROXY.md` describe an earlier, now-unused local-Tesseract
server design — kept in the repo for reference but not required to run the app.

## Offline support

A service worker (`sw.js`) caches the app shell and every script it loads —
including the Tesseract.js/pdf.js CDN files and the OCR engine's own WASM +
language data — the first time they're used online. After that, the app
(including scanning and OCR) keeps working without a connection.

- **Requires a secure context** — the app must be opened over `https://` or
  `http://localhost` (Option 2 or 3 above, or a real HTTPS host). It will
  **not** register when `index.html` is opened directly as a `file://` URL;
  the app still works in that mode, it just won't cache anything for offline use.
- A small "Offline" badge appears in the top bar whenever your device loses its
  network connection, so it's clear the app is running from cached data rather
  than silently failing.
- To verify it yourself: load the app once online (over `http://localhost:8080`
  or similar), then in Chrome/Edge DevTools go to the Network tab and check
  "Offline", then reload the page — it should still load and function.

## Notes
- The app works entirely in the browser and uses `localStorage` to save data.
- If Node is not available on your system, browser launch is still fine.
- For the best experience, use a modern browser such as Edge, Chrome, Firefox, or Safari.
