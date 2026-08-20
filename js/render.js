// ---------- rendering
let entryType = 'expense';
let sel = { category: null, from: null, to: null };
let summaryMonth = monthKey(todayISO());

function renderAll() {
  renderEntryForm();
  renderRecent();
  renderAccounts();
  renderBudgets();
  renderSummary();
  updateSyncPill();
  document.getElementById('amount-cur').textContent = (data.settings.currency || 'DKK').toUpperCase();
}

function chipRow(container, items, selectedId, onPick, after) {
  after = after || renderEntryForm;
  const el = document.getElementById(container);
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'chip' + (it.id === selectedId ? ' on' : '');
    b.textContent = it.label;
    b.onclick = () => { onPick(it.id); after(); };
    el.appendChild(b);
  }
  if (!items.length) el.innerHTML = '<div class="empty">None yet</div>';
}

function renderEntryForm() {
  const card = document.getElementById('entry-card');
  card.className = 'card tint-' + entryType;
  document.querySelectorAll('#type-seg button').forEach(b => {
    b.className = b.dataset.type === entryType ? 'sel-' + entryType : '';
  });

  const cats = data.categories.filter(c => c.type === (entryType === 'income' ? 'income' : 'expense'));
  document.getElementById('wrap-category').style.display = entryType === 'transfer' ? 'none' : '';
  if (entryType !== 'transfer') {
    if (!cats.some(c => c.id === sel.category)) sel.category = cats.length ? cats[0].id : null;
    chipRow('chips-category', cats.map(c => ({ id: c.id, label: c.name })), sel.category, id => sel.category = id);
  }

  const accs = data.accounts.map(a => ({ id: a.id, label: a.name }));
  const showFrom = entryType !== 'income';
  const showTo = entryType !== 'expense';
  document.getElementById('wrap-from').style.display = showFrom ? '' : 'none';
  document.getElementById('wrap-to').style.display = showTo ? '' : 'none';
  if (showFrom) {
    if (!accs.some(a => a.id === sel.from)) sel.from = accs.length ? accs[0].id : null;
    chipRow('chips-from', accs, sel.from, id => sel.from = id);
  }
  if (showTo) {
    const toAccs = entryType === 'transfer' ? accs.filter(a => a.id !== sel.from) : accs;
    if (!toAccs.some(a => a.id === sel.to)) sel.to = toAccs.length ? toAccs[0].id : null;
    chipRow('chips-to', toAccs, sel.to, id => sel.to = id);
  }
  document.getElementById('label-to').textContent = entryType === 'income' ? 'Receiving account' : 'To account';
  document.getElementById('btn-save').textContent =
    entryType === 'expense' ? 'Save expense' : entryType === 'income' ? 'Save income' : 'Save transfer';
}

// Amount input mask: typed digits fill in from the decimals outward (like a
// till), so "200" becomes 2,00 instead of requiring "2,00" to be typed out.
function setupAmountInput(input, initial) {
  let raw = initial > 0 ? String(Math.round(initial * Math.pow(10, curDigits()))) : '';

  function render() { input.value = raw ? formatRawAmount(raw, curDigits()) : ''; }
  function caretToEnd() { input.setSelectionRange(input.value.length, input.value.length); }

  // Money mask: there's only ever one valid insertion point (the end), so a
  // click/tap anywhere in the field — which sets the caret by coordinates
  // after focus fires — must be pulled back to the end too.
  input.onfocus = () => { if (!raw) raw = '0'; render(); caretToEnd(); };
  input.onclick = caretToEnd;
  input.oninput = () => {
    raw = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
    render();
    caretToEnd();
  };
  input.onblur = () => { if (!raw || Number(raw) === 0) raw = ''; render(); };

  render();
  return { reset() { raw = ''; render(); } };
}

function txTitle(t) {
  if (t.type === 'transfer') return accName(t.from_account) + ' → ' + accName(t.to_account);
  return t.category || '—';
}
function txSub(t) {
  const acc = t.type === 'income' ? accName(t.to_account) : t.type === 'expense' ? accName(t.from_account) : '';
  return [t.date, acc, t.note].filter(Boolean).join(' · ');
}
function renderTxList(elId, txs, withDelete) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  if (!txs.length) { el.innerHTML = '<div class="empty">No transactions yet</div>'; return; }
  for (const t of txs) {
    const row = document.createElement('div');
    row.className = 'tx-row';
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
    row.innerHTML = '<div class="tx-dot ' + t.type + '"></div>' +
      '<div class="tx-main"><div class="tx-title"></div><div class="tx-sub"></div></div>' +
      '<div class="tx-amount ' + t.type + '">' + sign + fmt(Number(t.amount)) + '</div>';
    row.querySelector('.tx-title').textContent = txTitle(t);
    row.querySelector('.tx-sub').textContent = txSub(t);
    row.style.cursor = 'pointer';
    row.onclick = () => openTransactionModal(t);
    if (withDelete) {
      const del = document.createElement('button');
      del.className = 'tx-del'; del.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'; del.setAttribute('aria-label', 'Delete');
      del.onclick = (e) => { e.stopPropagation(); if (confirm('Delete this transaction?')) submit('deleteTransaction', { id: t.id }); };
      row.appendChild(del);
    }
    el.appendChild(row);
  }
}
function renderRecent() {
  const txs = [...data.transactions]
    .sort((a, b) => (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || '')))
    .slice(0, 8);
  renderTxList('recent-list', txs, true);
}

function renderAccounts() {
  document.getElementById('total-balance').textContent = fmt(totalBalance());
  const el = document.getElementById('accounts-list');
  el.innerHTML = '';
  if (!data.accounts.length) el.innerHTML = '<div class="empty">Add your first account to get started</div>';
  for (const a of data.accounts) {
    const bal = accountBalance(a.id);
    const row = document.createElement('div');
    row.className = 'acct-row';
    row.innerHTML = '<div><div class="acct-name"></div><div class="acct-meta"></div></div>' +
      '<div class="acct-bal' + (bal < 0 ? ' neg' : '') + '">' + fmtAligned(bal) + '</div>';
    row.querySelector('.acct-name').textContent = a.name;
    row.querySelector('.acct-meta').textContent = ownerName(a.owner) + ' · ' + a.type;
    row.onclick = () => openAccountModal(a);
    el.appendChild(row);
  }
}
function ownerName(o) {
  if (o === 'a') return data.settings.name_a || 'A';
  if (o === 'b') return data.settings.name_b || 'B';
  return 'Joint';
}

function renderBudgets() {
  const key = monthKey(todayISO());
  document.getElementById('budgets-title').textContent = 'Budgets — ' + monthLabel(key);
  const { by } = sumBy(monthTx(key), 'expense');
  const el = document.getElementById('budgets-list');
  el.innerHTML = '';
  const budgeted = data.categories.filter(c => c.type === 'expense' && Number(c.monthly_budget) > 0);
  if (!budgeted.length) el.innerHTML = '<div class="empty">Set a monthly budget on a category below</div>';
  for (const c of budgeted) {
    const spent = by[c.name] || 0;
    const budget = Number(c.monthly_budget);
    const pct = Math.min(100, spent / budget * 100);
    const cls = spent > budget ? ' over' : pct >= 85 ? ' close' : '';
    const row = document.createElement('div');
    row.className = 'budget-row';
    row.innerHTML = '<div class="budget-top"><span></span><span class="nums">' +
      fmt(spent) + ' / ' + fmt(budget) + '</span></div>' +
      '<div class="bar"><div class="bar-fill' + cls + '" style="width:' + pct + '%"></div></div>';
    row.querySelector('.budget-top span').textContent = c.name;
    el.appendChild(row);
  }
  // category management list
  const cl = document.getElementById('categories-list');
  cl.innerHTML = '';
  for (const c of [...data.categories].sort((x, y) => (x.type + x.name).localeCompare(y.type + y.name))) {
    const row = document.createElement('div');
    row.className = 'acct-row';
    row.innerHTML = '<div><div class="acct-name"></div><div class="acct-meta"></div></div><div class="acct-meta"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div>';
    row.querySelector('.acct-name').textContent = c.name;
    row.querySelector('.acct-meta').textContent = c.type + (Number(c.monthly_budget) > 0 ? ' · budget ' + fmt(Number(c.monthly_budget)) : '');
    row.onclick = () => openCategoryModal(c);
    cl.appendChild(row);
  }
}

function trendEl(id, cur, prev, invert) {
  const el = document.getElementById(id);
  if (prev === 0 && cur === 0) { el.textContent = '—'; el.className = 't trend-flat'; return; }
  const diff = cur - prev;
  const good = invert ? diff < 0 : diff > 0;
  el.textContent = (diff === 0 ? '=' : fmtSigned(diff)) + ' vs last mo.';
  el.className = 't ' + (diff === 0 ? 'trend-flat' : good ? 'trend-up' : 'trend-down');
}

function renderSummary() {
  const key = summaryMonth, prev = shiftMonth(key, -1);
  document.getElementById('month-label').textContent = monthLabel(key);
  const cur = { spend: sumBy(monthTx(key), 'expense'), inc: sumBy(monthTx(key), 'income') };
  const old = { spend: sumBy(monthTx(prev), 'expense'), inc: sumBy(monthTx(prev), 'income') };

  document.getElementById('sum-spent').textContent = fmt(cur.spend.total);
  trendEl('sum-spent-t', cur.spend.total, old.spend.total, true);
  document.getElementById('sum-income').textContent = fmt(cur.inc.total);
  trendEl('sum-income-t', cur.inc.total, old.inc.total, false);

  const netCur = cur.inc.total - cur.spend.total;
  const netOld = old.inc.total - old.spend.total;
  document.getElementById('sum-net').textContent = fmtSigned(netCur);
  trendEl('sum-net-t', netCur, netOld, false);

  document.getElementById('sum-balance').textContent = fmt(totalBalance(key));
  trendEl('sum-balance-t', totalBalance(key), totalBalance(prev), false);

  // per-account net change
  const ael = document.getElementById('sum-accounts');
  ael.innerHTML = '';
  if (!data.accounts.length) ael.innerHTML = '<div class="empty">No accounts</div>';
  for (const a of data.accounts) {
    const c = accountNetChange(a.id, key), p = accountNetChange(a.id, prev);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = '<span class="name"></span><span class="amt ' + (c < 0 ? 'trend-down' : c > 0 ? 'trend-up' : '') + '">' +
      fmtSigned(c) + '</span><span class="tr trend-flat">prev ' + fmtSigned(p) + '</span>';
    row.querySelector('.name').textContent = a.name;
    ael.appendChild(row);
  }

  renderCatBreakdown('sum-spend-cats', cur.spend.by, old.spend.by, true);
  renderCatBreakdown('sum-income-cats', cur.inc.by, old.inc.by, false);
}

function renderCatBreakdown(elId, curBy, oldBy, invert) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  const names = [...new Set([...Object.keys(curBy), ...Object.keys(oldBy)])]
    .sort((a, b) => (curBy[b] || 0) - (curBy[a] || 0));
  if (!names.length) { el.innerHTML = '<div class="empty">Nothing this month</div>'; return; }
  for (const n of names) {
    const c = curBy[n] || 0, p = oldBy[n] || 0, d = c - p;
    const cls = d === 0 ? 'trend-flat' : (invert ? d < 0 : d > 0) ? 'trend-up' : 'trend-down';
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = '<span class="name"></span><span class="amt">' + fmt(c) +
      '</span><span class="tr ' + cls + '">' + (d === 0 ? '=' : fmtSigned(d)) + '</span>';
    row.querySelector('.name').textContent = n;
    el.appendChild(row);
  }
}
