const CACHE_NAME = 'parking-monitor-v4';
const DATA_CACHE = 'parking-data-v1';
const RAW_URL = 'https://www.nhw.de/zuhause-finden/stellplatz-mieten';
const WORKER_URL = 'https://garage-check-proxy.nhw-garage-check.workers.dev/?url=';
const PROXY_URL = WORKER_URL + encodeURIComponent(RAW_URL);
const CHECK_INTERVAL = 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['.', 'index.html', 'app.js', 'manifest.json']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'parking-check') {
    event.waitUntil(checkAndNotify());
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'checkNow') {
    event.waitUntil(checkAndNotify());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('nhw.de')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

async function checkAndNotify() {
  try {
    const resp = await fetch(PROXY_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const listings = parseListings(html);
    const previous = await getPreviousListings();
    const changes = detectChanges(listings, previous);

    await saveListings(listings);

    if (changes.hasChanges) {
      await showNotification(changes.changes);
    }

    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'checkResult',
        listings,
        changes: changes.changes,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error('Background check failed:', err);
  }
}

function parseListings(html) {
  const listings = [];
  const blockRegex = /immo--item--wrap[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[0];
    if (!block.includes('Frankfurt am Main')) continue;

    const urlMatch = block.match(/href="\/zuhause-finden\/immobilie\/([^"?]+)/);
    if (!urlMatch) continue;
    const id = urlMatch[1];

    const titleMatch = block.match(/immo--item--title[^>]*><a[^>]*>([^<]+)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const locationMatch = block.match(/immo--item--location[^>]*>([^<]+)</);
    const location = locationMatch ? locationMatch[1].trim() : '';

    const priceMatch = block.match(/immo--item--fact--value[^>]*>([^<]+)</);
    const price = priceMatch ? priceMatch[1].trim() : '';

    if (!title || !location.includes('Frankfurt am Main')) continue;

    listings.push({
      id,
      title,
      location,
      price,
      url: `https://www.nhw.de/zuhause-finden/immobilie/${id}`,
    });
  }

  return listings;
}

async function getPreviousListings() {
  const cache = await caches.open(DATA_CACHE);
  const resp = await cache.match('previous-listings');
  if (!resp) return [];
  return await resp.json();
}

async function saveListings(listings) {
  const cache = await caches.open(DATA_CACHE);
  await cache.put(
    'previous-listings',
    new Response(JSON.stringify(listings), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function detectChanges(current, previous) {
  const prevMap = new Map(previous.map((l) => [l.id, l]));
  const currMap = new Map(current.map((l) => [l.id, l]));

  const added = [];
  const removed = [];
  const priceChanged = [];

  for (const [id, listing] of currMap) {
    if (!prevMap.has(id)) {
      added.push(listing);
    } else {
      const prev = prevMap.get(id);
      if (prev.price !== listing.price) {
        priceChanged.push({ ...listing, oldPrice: prev.price });
      }
    }
  }

  for (const [id, listing] of prevMap) {
    if (!currMap.has(id)) {
      removed.push(listing);
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || priceChanged.length > 0;
  return { hasChanges, changes: { added, removed, priceChanged } };
}

async function showNotification(changes) {
  const parts = [];
  if (changes.added.length > 0) parts.push(`${changes.added.length} new`);
  if (changes.removed.length > 0) parts.push(`${changes.removed.length} removed`);
  if (changes.priceChanged.length > 0) parts.push(`${changes.priceChanged.length} price changed`);

  let body = parts.join(', ') + '\n\n';
  if (changes.added.length > 0) {
    body += 'New:\n';
    changes.added.forEach((l) => { body += `  ${l.title} (${l.price})\n`; });
  }
  if (changes.priceChanged.length > 0) {
    body += 'Price:\n';
    changes.priceChanged.forEach((l) => { body += `  ${l.title}: ${l.oldPrice} -> ${l.price}\n`; });
  }

  return self.registration.showNotification('NHW Frankfurt Parking Update', {
    body,
    icon: 'icons/icon128.png',
    badge: 'icons/icon48.png',
    tag: 'parking-update',
  });
}
