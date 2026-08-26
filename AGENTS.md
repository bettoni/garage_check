# Extensions Workspace

Chrome/Firefox extensions repo. Currently contains one extension: `garage_check/`.

## garage_check — NHW Frankfurt Parking Monitor

Manifest V3 extension that polls `nhw.de` hourly for parking listings in Frankfurt am Main and notifies on changes.

### Key constraints

- **No DOM APIs in service worker.** `DOMParser`, `document`, `window` etc. are unavailable in `background.js` (MV3 service worker). Parse HTML with regex only.
- **No npm/build step.** Plain JS, no bundler, no transpilation. Edit files directly.
- **Cross-browser compatibility.** Uses `const api = globalThis.browser || globalThis.chrome` shim for Firefox/Chrome. Use `api.*` not `chrome.*` in new code.

### Loading for development

**Chrome:**
1. `chrome://extensions/` → enable Developer mode
2. "Load unpacked" → select `garage_check/chrome/`
3. Reload after changes: click refresh icon on extension card

**Firefox:**
1. `about:debugging#/runtime/this-firefox`
2. "Load Temporary Add-on" → select `garage_check/firefox/manifest.json`
3. Reload: click "Reload" on the add-on card

### Structure

```
garage_check/
  chrome/          # Chrome-specific (manifest with service_worker)
  firefox/         # Firefox-specific (manifest with scripts)
  background.js    # Service worker: alarm, fetch, regex parse, diff, notify
  popup.html/js/css # UI for manual check + listing display
  icons/           # Generated solid-color PNGs (16/48/128)
```

Chrome and Firefox directories contain only their `manifest.json` and symlink shared files (`background.js`, `popup.*`, `icons/`). Edit shared files at the root level — changes apply to both browsers.

### How parsing works

`background.js` fetches the listing page and uses regex to extract listing blocks (`immo--item--wrap`). Each block is checked for "Frankfurt am Main" in the location field. Fields extracted: id, title, location, price, url. If the site changes its HTML class names, the regex patterns in `parseListings()` need updating.

## PWA (Android)

`pwa/` contains a Progressive Web App version of the same monitor.

### Structure

```
pwa/
  index.html       # Full-page UI
  app.js           # All logic: fetch, parse, diff, UI, notifications
  sw.js            # Service worker with periodicsync handler
  manifest.json    # Web app manifest (installable)
  icons/           # Same icons as extension
```

### Key constraints

- Same regex parser as the extension. If the NHW site changes HTML classes, update `parseListings()` in both `background.js` (extension) and `sw.js` + `app.js` (PWA).
- Periodic Background Sync only works on installed PWAs (Add to Home Screen) in Chrome on Android. Timing is best-effort, not guaranteed hourly.
- Requires HTTPS for service worker (GitHub Pages provides this).
- `localStorage` is used for change detection (same as extension uses `chrome.storage`).

### Testing locally

```bash
cd pwa && python3 -m http.server 8080
```

Periodic sync won't fire in localhost (needs HTTPS + installed PWA), but "Check Now" works.

### Deploying to GitHub Pages

Push `pwa/` contents to a `gh-pages` branch or configure GitHub Pages to serve from `garage_check/pwa/`. All files must be at the root of the served path (no subdirectories in URLs for service worker scope).
