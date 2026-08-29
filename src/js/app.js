// ---------- toast
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- subpages (e.g. "Transactions", every Settings page, and the
// account/category/transaction edit forms — reached via a link/tap rather
// than a nav tab, so each gets its own back arrow instead of the bottom nav)
// nest via a real stack rather than "the one view before this", since one
// subpage routinely opens another (Settings → Categories → Edit category).
// Each level pushes a history entry, so "back" — a back arrow, the OS
// swipe-back gesture, or a hardware back button — always unwinds exactly one
// level via popstate, landing on whatever was actually showing before it,
// never a hardcoded view.
let subpageStack = []; // { view, trigger } — trigger is the element that opened this subpage

// A view's one "title" heading — h1 on subpages, h2.view-title or the
// .card-head h2 on tab views (see index.html) — always comes first among
// these in document order, so a single selector finds the right one.
function focusViewHeading(viewEl) {
  const heading = viewEl.querySelector('h1, h2.view-title, .card-head h2');
  if (heading) heading.focus({ preventScroll: true });
}

function openSubpage(viewId, trigger) {
  subpageStack.push({
    view: document.querySelector('section.view.active').id,
    trigger: trigger || null,
  });
  document.querySelectorAll('section.view').forEach((v) => v.classList.remove('active'));
  const view = document.getElementById(viewId);
  view.classList.add('active');
  document.getElementById('app').classList.add('subpage');
  window.scrollTo(0, 0);
  history.pushState({ page: 'subpage', view: viewId }, '');
  focusViewHeading(view);
}

function closeSubpage() {
  if (!subpageStack.length) return;
  document.querySelector('section.view.active').classList.remove('active');
  const { view: viewId, trigger } = subpageStack.pop();
  const view = document.getElementById(viewId);
  view.classList.add('active');
  document.getElementById('app').classList.toggle('subpage', subpageStack.length > 0);
  window.scrollTo(0, 0);
  // Focus goes back to whatever row/button opened this subpage — falling
  // back to the parent view's heading if it's gone (e.g. the account backing
  // that row was just deleted).
  if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  else focusViewHeading(view);
}

window.addEventListener('popstate', closeSubpage);

function setDateRangeExpanded(expanded) {
  document.getElementById('all-date-toggle').setAttribute('aria-expanded', String(expanded));
  document.getElementById('all-date-fields').hidden = !expanded;
}

// Every entry into #view-all resets search and the date range — a stale
// query silently hiding results is worse than retyping a few characters —
// then applies whatever account/category the entry point pre-selects.
function openAllTx(filter, trigger) {
  allFilter = {
    account: filter.account || '',
    category: filter.category || '',
    search: '',
    from: '',
    to: '',
  };
  document.getElementById('all-search').value = '';
  document.getElementById('all-from').value = '';
  document.getElementById('all-to').value = '';
  setDateRangeExpanded(false);
  renderAllTransactions();
  openSubpage('view-all', trigger);
}

// Resets all four filters without navigating anywhere — used by both the
// result line's "Clear filters" link and the empty state's own button.
function clearAllFilters() {
  allFilter = { account: '', category: '', search: '', from: '', to: '' };
  document.getElementById('all-search').value = '';
  document.getElementById('all-from').value = '';
  document.getElementById('all-to').value = '';
  setDateRangeExpanded(false);
  renderAllTransactions();
}

function openGeneralSubpage(trigger) {
  const s = data.settings;
  document.getElementById('g-na').value = s.name_a || 'A';
  document.getElementById('g-nb').value = s.name_b || 'B';
  document.getElementById('g-cur').value = s.currency || 'DKK';
  document.getElementById('g-pin').value = s.pin || '';
  openSubpage('view-general', trigger);
}

function openConfigAccounts(trigger) {
  renderConfigAccounts();
  openSubpage('view-config-accounts', trigger);
}

function openConfigCategories(trigger) {
  renderConfigCategories();
  openSubpage('view-config-categories', trigger);
}

// ---------- events
document.querySelectorAll('nav button').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('nav button').forEach((x) => {
        x.classList.toggle('on', x === b);
        if (x === b) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
      const view = document.getElementById('view-' + b.dataset.view);
      document
        .querySelectorAll('section.view')
        .forEach((v) => v.classList.toggle('active', v === view));
      if (b.dataset.view === 'summary') {
        summaryMonth = monthKey(todayISO());
        renderSummary();
      }
      if (b.dataset.view === 'budgets') {
        budgetsMonth = monthKey(todayISO());
        renderBudgets();
      }
      window.scrollTo(0, 0);
      focusViewHeading(view);
    }),
);
document
  .querySelectorAll('#add-tx-actions button')
  .forEach((b) => (b.onclick = () => openTransactionPage(null, b.dataset.type, b)));
document.getElementById('month-prev').onclick = () => {
  summaryMonth = shiftMonth(summaryMonth, -1);
  renderSummary();
};
document.getElementById('month-next').onclick = () => {
  summaryMonth = shiftMonth(summaryMonth, 1);
  renderSummary();
};
document.getElementById('budgets-month-prev').onclick = () => {
  budgetsMonth = shiftMonth(budgetsMonth, -1);
  renderBudgets();
};
document.getElementById('budgets-month-next').onclick = () => {
  budgetsMonth = shiftMonth(budgetsMonth, 1);
  renderBudgets();
};
document.getElementById('all-filter-account').onchange = (e) => {
  allFilter.account = e.target.value;
  renderAllTransactions();
};
document.getElementById('all-filter-category').onchange = (e) => {
  allFilter.category = e.target.value;
  renderAllTransactions();
};
let searchDebounceTimer;
document.getElementById('all-search').oninput = (e) => {
  const value = e.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    allFilter.search = value;
    renderAllTransactions();
  }, 150);
};
document.getElementById('all-from').onchange = (e) => {
  allFilter.from = e.target.value;
  renderAllTransactions();
};
document.getElementById('all-to').onchange = (e) => {
  allFilter.to = e.target.value;
  renderAllTransactions();
};
document.getElementById('all-date-toggle').onclick = (e) => {
  setDateRangeExpanded(e.currentTarget.getAttribute('aria-expanded') !== 'true');
};
document.getElementById('all-clear-filters').onclick = clearAllFilters;
document.getElementById('btn-view-all').onclick = (e) => openAllTx({}, e.currentTarget);
document
  .querySelectorAll('.subpage-back, .subpage-cancel')
  .forEach((b) => (b.onclick = () => history.back()));
document.getElementById('btn-settings').onclick = (e) =>
  openSubpage('view-settings', e.currentTarget);
document.getElementById('settings-general').onclick = (e) => openGeneralSubpage(e.currentTarget);
document.getElementById('settings-accounts').onclick = (e) => openConfigAccounts(e.currentTarget);
document.getElementById('settings-categories').onclick = (e) =>
  openConfigCategories(e.currentTarget);
document.getElementById('settings-resync').onclick = async () => {
  toast('Syncing…');
  await backgroundRefresh();
  toast('Up to date');
};
document.getElementById('settings-check-update').onclick = async () => {
  toast('Checking for updates…');
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch (e) {
    /* fall through to reload regardless */
  }
  location.reload();
};
document.getElementById('settings-disconnect').onclick = () => {
  if (!confirm('Disconnect this device? Your sheet data is untouched.')) return;
  store.del('hf_config');
  store.del('hf_data');
  store.del('hf_pending');
  location.reload();
};

// ---------- theme
function applyThemeIcon(theme) {
  document
    .querySelector('#btn-theme use')
    .setAttribute('href', 'src/icons/sprite.svg#' + (theme === 'dark' ? 'moon' : 'sun'));
}
// Mirrors --bg in style.css (light/dark) — kept in sync with the identical
// COLORS map in index.html's inline pre-paint script (that one can't reach
// this file yet, so the values are duplicated rather than shared).
const THEME_COLORS = { light: '#ffffff', dark: '#111111' };
// persist=true for an explicit user choice (the toggle button), false for the
// OS-preference listener below — only an explicit choice should stick as an
// override that the OS listener must then respect and stay out of.
function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    try {
      localStorage.setItem('hf_theme', theme);
    } catch (e) {}
  }
  document.getElementById('meta-theme-color').setAttribute('content', THEME_COLORS[theme]);
  applyThemeIcon(theme);
}
applyThemeIcon(document.documentElement.getAttribute('data-theme') || 'light');
document.getElementById('btn-theme').onclick = () => {
  applyTheme(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark',
    true,
  );
};
// No stored override → keep following the OS live, same as the pre-paint
// script does on cold launch.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let stored;
  try {
    stored = localStorage.getItem('hf_theme');
  } catch (err) {
    stored = null;
  }
  if (stored) return;
  applyTheme(e.matches ? 'dark' : 'light', false);
});
document.getElementById('btn-add-account').onclick = (e) => openAccountPage(null, e.currentTarget);
document.getElementById('btn-add-category').onclick = (e) =>
  openCategoryPage(null, e.currentTarget);
document.getElementById('g-share-link').onclick = async () => {
  const link =
    location.origin +
    location.pathname +
    '#connect=' +
    encodeConnectPayload(config.url, config.pin);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Husholdning setup', url: link });
    } catch (e) {
      /* user cancelled */
    }
  } else {
    await navigator.clipboard.writeText(link).catch(() => {});
    toast('Link copied — send it to the other phone');
  }
};

document.getElementById('general-form').onsubmit = (e) => {
  e.preventDefault();
  const payload = {
    name_a: document.getElementById('g-na').value.trim() || 'A',
    name_b: document.getElementById('g-nb').value.trim() || 'B',
    currency: (document.getElementById('g-cur').value.trim() || 'DKK').toUpperCase(),
    pin: document.getElementById('g-pin').value.trim() || data.settings.pin,
  };
  submit('updateSettings', payload);
  config.pin = payload.pin;
  store.set('hf_config', config);
  toast('Settings saved — remind your partner if the PIN changed');
  history.back();
};

// ---------- setup flow
function encodeConnectPayload(url, pin) {
  return btoa(JSON.stringify({ u: url, p: pin }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function decodeConnectPayload(encoded) {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const { u, p } = JSON.parse(json);
  return { url: u, pin: p };
}
// A "#connect=…" link (from Settings → General → Share connection link on
// another device) prefills the setup form so the URL/PIN never need retyping.
(() => {
  const m = location.hash.match(/^#connect=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const { url, pin } = decodeConnectPayload(m[1]);
    document.getElementById('setup-url').value = url;
    document.getElementById('setup-pin').value = pin;
  } catch (e) {
    /* malformed link — leave the form empty */
  }
})();

document.getElementById('setup-form').onsubmit = async (e) => {
  e.preventDefault();
  const url = document.getElementById('setup-url').value.trim();
  const pin = document.getElementById('setup-pin').value.trim();
  const err = document.getElementById('setup-err');
  err.style.display = 'none';
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    err.textContent =
      'That does not look like an Apps Script URL (it should start with https://script.google.com/…)';
    err.style.display = 'block';
    return;
  }
  const btn = document.getElementById('setup-connect');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  config = { url, pin };
  try {
    const fresh = await apiCall('getAll');
    store.set('hf_config', config);
    data = fresh;
    store.set('hf_data', data);
    boot();
  } catch (e) {
    config = null;
    err.textContent = String(e.message).includes('bad_pin')
      ? 'Wrong PIN. Check the Settings tab of your sheet.'
      : 'Could not connect: ' +
        e.message +
        '. Check the URL, and that the deployment access is set to "Anyone".';
    err.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = 'Connect';
};

function boot() {
  if (!config) {
    const urlField = document.getElementById('setup-url');
    if (!urlField.value && window.HF_DEV_URL) urlField.value = window.HF_DEV_URL;
    document.getElementById('setup').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    return;
  }
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderAll();
  backgroundRefresh();
}

window.addEventListener('online', flushQueue);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) backgroundRefresh();
});
loadTemplates()
  .catch((err) => {
    console.error(err);
    toast('Could not load templates — reload the page');
  })
  .then(boot);

// ---------- service worker
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // Only a genuinely new version landing on top of an already-running
          // app counts as "update ready" — skip the very first install, where
          // there's nothing to refresh (this load is already the latest).
          if (worker.state === 'installed' && hadController) {
            const pill = document.getElementById('update-pill');
            pill.textContent = 'Update ready — tap to refresh';
            pill.className = 'pill warn';
            pill.onclick = () => location.reload();
          }
        });
      });
    })
    .catch(() => {});
}
