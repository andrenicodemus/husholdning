// ---------- toast
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- subpages (e.g. "All transactions", the Settings config pages —
// reached via a link/tap rather than a nav tab, so each gets its own back
// arrow instead of the bottom nav, and "back" really means back to wherever
// it was opened from, via the browser's history rather than a hardcoded view)
let subpageReturnView = null;
let activeSubpageId = null;

function openSubpage(viewId) {
  subpageReturnView = document.querySelector('section.view.active');
  document.querySelectorAll('section.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.getElementById('app').classList.add('subpage');
  activeSubpageId = viewId;
  window.scrollTo(0, 0);
  history.pushState({ page: 'subpage', view: viewId }, '');
}

function closeSubpage() {
  if (!activeSubpageId) return;
  document.getElementById(activeSubpageId).classList.remove('active');
  document.getElementById('app').classList.remove('subpage');
  if (subpageReturnView) subpageReturnView.classList.add('active');
  subpageReturnView = null;
  activeSubpageId = null;
  window.scrollTo(0, 0);
}

// Popping back to any state that isn't a subpage (whether via a back arrow,
// the OS swipe-back gesture, or a hardware back button) closes it and
// restores whatever was showing before — never a hardcoded view.
window.addEventListener('popstate', (e) => {
  if (!e.state || e.state.page !== 'subpage') closeSubpage();
});
history.replaceState({ page: 'app' }, '');

function openAllTx(filter) {
  allFilter = { account: filter.account || '', category: filter.category || '' };
  renderAllTransactions();
  openSubpage('view-all');
}

function openGeneralSubpage() {
  const s = data.settings;
  document.getElementById('g-na').value = s.name_a || 'A';
  document.getElementById('g-nb').value = s.name_b || 'B';
  document.getElementById('g-cur').value = s.currency || 'DKK';
  document.getElementById('g-pin').value = s.pin || '';
  openSubpage('view-general');
}

function openConfigAccounts() {
  renderConfigAccounts();
  openSubpage('view-config-accounts');
}

function openConfigCategories() {
  renderConfigCategories();
  openSubpage('view-config-categories');
}

// ---------- events
const entryAmountInput = setupAmountInput(document.getElementById('in-amount'));
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('section.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
  if (b.dataset.view === 'summary') { summaryMonth = monthKey(todayISO()); renderSummary(); }
  window.scrollTo(0, 0);
});
document.querySelectorAll('#type-seg button').forEach(b => b.onclick = () => { entryType = b.dataset.type; renderEntryForm(); });
document.getElementById('month-prev').onclick = () => { summaryMonth = shiftMonth(summaryMonth, -1); renderSummary(); };
document.getElementById('month-next').onclick = () => { summaryMonth = shiftMonth(summaryMonth, 1); renderSummary(); };
document.getElementById('all-filter-account').onchange = (e) => { allFilter.account = e.target.value; renderAllTransactions(); };
document.getElementById('all-filter-category').onchange = (e) => { allFilter.category = e.target.value; renderAllTransactions(); };
document.getElementById('btn-view-all').onclick = () => openAllTx({});
document.querySelectorAll('.subpage-back').forEach((b) => (b.onclick = () => history.back()));
document.getElementById('btn-settings').onclick = openSettingsModal;
document.getElementById('btn-add-account').onclick = () => openAccountModal(null);
document.getElementById('btn-add-category').onclick = () => openCategoryModal(null);
document.getElementById('g-save').onclick = () => {
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

document.getElementById('btn-save').onclick = () => {
  const amount = parseAmount(document.getElementById('in-amount').value);
  if (!(amount > 0)) return toast('Enter an amount');
  if (!data.accounts.length) return toast('Add an account first (Accounts tab)');
  const t = {
    id: uuid(),
    date: document.getElementById('in-date').value || todayISO(),
    type: entryType,
    amount,
    category: entryType === 'transfer' ? '' : (data.categories.find(c => c.id === sel.category) || {}).name || '',
    from_account: entryType === 'income' ? '' : sel.from,
    to_account: entryType === 'expense' ? '' : sel.to,
    note: document.getElementById('in-note').value.trim(),
    created_at: new Date().toISOString()
  };
  if (entryType !== 'transfer' && !t.category) return toast('Pick a category');
  if (entryType !== 'income' && !t.from_account) return toast('Pick an account');
  if (entryType !== 'expense' && !t.to_account) return toast('Pick an account');
  if (entryType === 'transfer' && t.from_account === t.to_account) return toast('Pick two different accounts');
  submit('addTransaction', t);
  entryAmountInput.reset();
  document.getElementById('in-note').value = '';
  toast('Saved ' + fmt(amount));
};

// ---------- setup flow
document.getElementById('setup-form').onsubmit = async (e) => {
  e.preventDefault();
  const url = document.getElementById('setup-url').value.trim();
  const pin = document.getElementById('setup-pin').value.trim();
  const err = document.getElementById('setup-err');
  err.style.display = 'none';
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    err.textContent = 'That does not look like an Apps Script URL (it should start with https://script.google.com/…)';
    err.style.display = 'block'; return;
  }
  const btn = document.getElementById('setup-connect');
  btn.disabled = true; btn.textContent = 'Connecting…';
  config = { url, pin };
  try {
    const fresh = await apiCall('getAll');
    store.set('hf_config', config);
    data = fresh; store.set('hf_data', data);
    boot();
  } catch (e) {
    config = null;
    err.textContent = String(e.message).includes('bad_pin') ? 'Wrong PIN — check the Settings tab of your sheet.'
      : 'Could not connect: ' + e.message + '. Check the URL, and that the deployment access is set to "Anyone".';
    err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Connect';
};

function boot() {
  if (!config) {
    document.getElementById('setup').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    return;
  }
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('in-date').value = todayISO();
  renderAll();
  backgroundRefresh();
}

window.addEventListener('online', flushQueue);
document.addEventListener('visibilitychange', () => { if (!document.hidden) backgroundRefresh(); });
loadModalTemplates()
  .catch((err) => {
    console.error(err);
    toast('Could not load dialog templates — reload the page');
  })
  .then(boot);

// ---------- service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
