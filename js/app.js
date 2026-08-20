// ---------- toast
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- events
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('section.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
  if (b.dataset.view === 'summary') { summaryMonth = monthKey(todayISO()); renderSummary(); }
});
document.querySelectorAll('#type-seg button').forEach(b => b.onclick = () => { entryType = b.dataset.type; renderEntryForm(); });
document.getElementById('month-prev').onclick = () => { summaryMonth = shiftMonth(summaryMonth, -1); renderSummary(); };
document.getElementById('month-next').onclick = () => { summaryMonth = shiftMonth(summaryMonth, 1); renderSummary(); };
document.getElementById('btn-settings').onclick = openSettingsModal;
document.getElementById('btn-add-account').onclick = () => openAccountModal(null);
document.getElementById('btn-add-category').onclick = () => openCategoryModal(null);

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
  document.getElementById('in-amount').value = '';
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
boot();

// ---------- service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
