const api = globalThis.chrome || globalThis.browser;

document.addEventListener('DOMContentLoaded', () => {
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const lastCheckEl = document.getElementById('lastCheck');
  const checkBtn = document.getElementById('checkBtn');
  const changesEl = document.getElementById('changes');
  const changesList = document.getElementById('changesList');
  const listingsEl = document.getElementById('listings');
  const listingsList = document.getElementById('listingsList');
  const countEl = document.getElementById('count');

  loadData();

  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    statusIcon.textContent = '⏳';
    statusText.textContent = 'Checking...';

    try {
      const result = await sendAction('checkNow');
      if (result.success) {
        renderListings(result.listings);
        renderChanges(result.changes);
        setStatus('OK', new Date().toISOString());
      } else {
        setStatus('Error', null, result.error);
      }
    } catch (e) {
      setStatus('Error', null, e.message);
    }

    checkBtn.disabled = false;
  });

  async function loadData() {
    try {
      const data = await sendAction('getData');
      if (data.listings) {
        renderListings(data.listings);
      }
      if (data.lastChanges) {
        renderChanges(data.lastChanges);
      }
      if (data.lastCheck) {
        setStatus('OK', data.lastCheck);
      } else {
        setStatus('Not checked yet', null);
      }
    } catch (e) {
      setStatus('Error', null, e.message);
    }
  }

  function setStatus(state, lastCheck, error) {
    if (state === 'OK') {
      statusIcon.textContent = '✅';
      statusText.textContent = 'Connected';
      if (lastCheck) {
        const d = new Date(lastCheck);
        lastCheckEl.textContent = `Last check: ${d.toLocaleString()}`;
      }
    } else if (state === 'Error') {
      statusIcon.textContent = '❌';
      statusText.textContent = error || 'Error';
      lastCheckEl.textContent = '';
    } else {
      statusIcon.textContent = '⏳';
      statusText.textContent = state;
      lastCheckEl.textContent = '';
    }
  }

  function renderListings(listings) {
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
        ${l.url ? `<a href="${escapeHtml(l.url)}" target="_blank" class="listing-link">Details →</a>` : ''}
      `;
      listingsList.appendChild(card);
    });
  }

  function renderChanges(changes) {
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
      const section = createChangeSection('Newly Added', 'added', changes.added);
      changesList.appendChild(section);
    }

    if (changes.removed?.length > 0) {
      const section = createChangeSection('Removed', 'removed', changes.removed);
      changesList.appendChild(section);
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
          <span class="change-price">${escapeHtml(l.oldPrice)} → ${escapeHtml(l.price)}</span>
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

  function sendAction(action) {
    return api.runtime.sendMessage({ action });
  }
});
