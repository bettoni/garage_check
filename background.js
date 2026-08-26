const api = globalThis.chrome || globalThis.browser;

const URL = 'https://www.nhw.de/zuhause-finden/stellplatz-mieten';
const ALARM_NAME = 'nhw-check';
const CHECK_INTERVAL_MINUTES = 60;

api.runtime.onInstalled.addListener(() => {
  console.log('onInstalled fired, creating alarm');
  api.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  checkNow();
});

api.runtime.onStartup.addListener(() => {
  api.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkNow().catch((err) => console.error('Alarm check failed:', err));
  }
});

api.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'checkNow') {
    return checkNow();
  }
  if (msg.action === 'getData') {
    return api.storage.local.get(['listings', 'lastCheck', 'lastChanges']);
  }
});

async function checkNow() {
  console.log('checkNow called at', new Date().toISOString());
  try {
    const html = await fetchPage();
    const listings = parseListings(html);
    console.log('Found', listings.length, 'listings');
    const result = await detectChanges(listings);

    await api.storage.local.set({
      listings: listings,
      lastCheck: new Date().toISOString(),
      lastChanges: result.changes,
    });

    if (result.hasChanges) {
      showNotification(result.changes);
    }

    return { success: true, listings, changes: result.changes };
  } catch (err) {
    console.error('Check failed:', err);
    await api.storage.local.set({ lastError: err.message });
    return { success: false, error: err.message };
  }
}

async function fetchPage() {
  const resp = await fetch(URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
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

function extractId(url) {
  if (!url) return '';
  const match = url.match(/immobilie\/([^?]+)/);
  return match ? match[1] : url;
}

function normalizeUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return 'https://www.nhw.de' + (url.startsWith('/') ? url : '/' + url);
}

async function detectChanges(currentListings) {
  const data = await api.storage.local.get(['listings']);
  const previousListings = data.listings || [];

  const prevMap = new Map(previousListings.map((l) => [l.id, l]));
  const currMap = new Map(currentListings.map((l) => [l.id, l]));

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

  return {
    hasChanges,
    changes: { added, removed, priceChanged },
  };
}

function showNotification(changes) {
  const parts = [];
  if (changes.added.length > 0) {
    parts.push(`${changes.added.length} new listing(s)`);
  }
  if (changes.removed.length > 0) {
    parts.push(`${changes.removed.length} listing(s) removed`);
  }
  if (changes.priceChanged.length > 0) {
    parts.push(`${changes.priceChanged.length} price change(s)`);
  }

  let body = parts.join(', ') + '.\n\n';

  if (changes.added.length > 0) {
    body += 'New:\n';
    changes.added.forEach((l) => {
      body += `  - ${l.title} (${l.price})\n`;
    });
  }

  if (changes.priceChanged.length > 0) {
    body += 'Price changed:\n';
    changes.priceChanged.forEach((l) => {
      body += `  - ${l.title}: ${l.oldPrice} -> ${l.price}\n`;
    });
  }

  api.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'NHW Frankfurt Parking Update',
    message: body,
    priority: 2,
  });
}
