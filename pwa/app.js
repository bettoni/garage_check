const CHECK_INTERVAL = 60 * 60 * 1000;
const RAW_URL = 'https://www.nhw.de/zuhause-finden/stellplatz-mieten';
const PROXY_URL = location.origin + '/proxy/zuhause-finden/stellplatz-mieten';

let swRegistration = null;

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  const checkBtn = document.getElementById('checkBtn');

  if ('serviceWorker' in navigator) {
    swRegistration = await navigator.serviceWorker.register('./sw.js');
    await registerPeriodicSync();
    navigator.serviceWorker.addEventListener('message', onSWMessage);
  }

  loadData();
  checkBtn.addEventListener('click', manualCheck);
}

async function registerPeriodicSync() {
  if (!swRegistration) return;
  if (!('periodicSync' in swRegistration)) {
    console.log('Periodic Background Sync not supported');
    return;
  }

  const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
  if (status.state !== 'granted') {
    console.log('Periodic sync permission not granted');
    return;
  }

  const tags = await swRegistration.periodicSync.getTags();
  if (tags.includes('parking-check')) return;

  try {
    await swRegistration.periodicSync.register('parking-check', {
      minInterval: CHECK_INTERVAL,
    });
    console.log('Periodic sync registered');
  } catch (err) {
    console.log('Periodic sync registration failed:', err.message);
  }
}

async function manualCheck() {
  const checkBtn = document.getElementById('checkBtn');
  checkBtn.disabled = true;
  setStatus('Checking...');

  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage('checkNow');
  } else {
    try {
      const result = await fetchAndParse();
      renderListings(result.listings);
      renderChanges(result.changes);
      setStatus('OK', new Date().toISOString());
      saveToStorage(result.listings, result.changes);
    } catch (err) {
      setStatus('Error', null, err.message);
    }
  }

  checkBtn.disabled = false;
}

function onSWMessage(event) {
  if (event.data.type === 'checkResult') {
    renderListings(event.data.listings);
    renderChanges(event.data.changes);
    setStatus('OK', event.data.timestamp);
    saveToStorage(event.data.listings, event.data.changes);
  }
}

async function fetchAndParse() {
  let html;
  try {
    const resp = await fetch(PROXY_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch {
    const resp = await fetch(RAW_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  }
  const listings = parseListings(html);
  const previous = getFromStorage();
  const changes = detectChanges(listings, previous);
  return { listings, changes };
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

function getFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('previousListings') || '[]');
  } catch {
    return [];
  }
}

function saveToStorage(listings, changes) {
  localStorage.setItem('previousListings', JSON.stringify(listings));
  localStorage.setItem('lastCheck', new Date().toISOString());
  localStorage.setItem('lastChanges', JSON.stringify(changes));
}

function loadData() {
  const listings = getFromStorage();
  const lastCheck = localStorage.getItem('lastCheck');
  const lastChanges = JSON.parse(localStorage.getItem('lastChanges') || 'null');

  if (listings.length > 0) {
    renderListings(listings);
  }
  if (lastChanges) {
    renderChanges(lastChanges);
  }
  if (lastCheck) {
    setStatus('OK', lastCheck);
  } else {
    setStatus('Not checked yet');
  }
}

function setStatus(state, lastCheck, error) {
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const lastCheckEl = document.getElementById('lastCheck');

  if (state === 'OK') {
    statusIcon.textContent = '\u2705';
    statusText.textContent = 'Connected';
    if (lastCheck) {
      const d = new Date(lastCheck);
      lastCheckEl.textContent = `Last check: ${d.toLocaleString()}`;
    }
  } else if (state === 'Error') {
    statusIcon.textContent = '\u274c';
    statusText.textContent = error || 'Error';
    lastCheckEl.textContent = '';
  } else {
    statusIcon.textContent = '\u23f3';
    statusText.textContent = state;
    lastCheckEl.textContent = '';
  }
}

function renderListings(listings) {
  const countEl = document.getElementById('count');
  const listingsList = document.getElementById('listingsList');

  countEl.textContent = listings.length;
  listingsList.innerHTML = '';

  if (listings.length === 0) {
    listingsList.innerHTML = '<p class="empty">No listings found</p>';
    return;
  }

  listings.forEach((l) => {
    const card = document.createElement('div');
    card.className = 'listing-card';
    card.innerHTML = `
      <div class="listing-title">${escapeHtml(l.title)}</div>
      <div class="listing-location">${escapeHtml(l.location)}</div>
      <div class="listing-price">${escapeHtml(l.price)}</div>
      ${l.url ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="listing-link">Details &rarr;</a>` : ''}
    `;
    listingsList.appendChild(card);
  });
}

function renderChanges(changes) {
  const changesEl = document.getElementById('changes');
  const changesList = document.getElementById('changesList');

  if (!changes) {
    changesEl.classList.add('hidden');
    return;
  }

  const hasAny =
    changes.added?.length > 0 ||
    changes.removed?.length > 0 ||
    changes.priceChanged?.length > 0;

  if (!hasAny) {
    changesEl.classList.add('hidden');
    return;
  }

  changesEl.classList.remove('hidden');
  changesList.innerHTML = '';

  if (changes.added?.length > 0) {
    changesList.appendChild(createChangeSection('Newly Added', 'added', changes.added));
  }
  if (changes.removed?.length > 0) {
    changesList.appendChild(createChangeSection('Removed', 'removed', changes.removed));
  }
  if (changes.priceChanged?.length > 0) {
    const section = document.createElement('div');
    section.className = 'change-section';
    section.innerHTML = '<h3>Price Changes</h3>';
    changes.priceChanged.forEach((l) => {
      const item = document.createElement('div');
      item.className = 'change-item price-changed';
      item.innerHTML = `
        <span class="change-title">${escapeHtml(l.title)}</span>
        <span class="change-price">${escapeHtml(l.oldPrice)} \u2192 ${escapeHtml(l.price)}</span>
      `;
      section.appendChild(item);
    });
    changesList.appendChild(section);
  }
}

function createChangeSection(title, className, items) {
  const section = document.createElement('div');
  section.className = 'change-section';
  section.innerHTML = `<h3>${title}</h3>`;
  items.forEach((l) => {
    const item = document.createElement('div');
    item.className = `change-item ${className}`;
    item.innerHTML = `
      <span class="change-title">${escapeHtml(l.title)}</span>
      <span class="change-price">${escapeHtml(l.price)}</span>
    `;
    section.appendChild(item);
  });
  return section;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
