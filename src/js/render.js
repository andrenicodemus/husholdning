// ---------- rendering
let summaryMonth = monthKey(todayISO());
let budgetsMonth = monthKey(todayISO());
// `applied` drives the rendered list and the tag row; `searchQuery` is kept
// separate (per spec) since it applies live and is never shown as a tag.
// `draft` is the filter panel's working copy — see app.js for the open/
// apply/discard choreography.
let applied = { account: '', category: '', from: '', to: '' };
let draft = { account: '', category: '', from: '', to: '' };
let searchQuery = '';

// A transaction's foldable search text (description, category, account
// names), computed once per object and cached by identity. Every mutation
// path (submit()'s optimistic update, or a fresh getAll() replacing `data`
// wholesale) produces a new object for anything that changed, so a WeakMap
// keyed on the transaction itself invalidates for free — no manual bust.
const txHaystack = new WeakMap();
function haystackFor(t) {
  let h = txHaystack.get(t);
  if (h === undefined) {
    const parts = [
      t.description,
      t.category,
      t.from_account && accName(t.from_account),
      t.to_account && accName(t.to_account),
    ];
    h = foldDanish(parts.filter(Boolean).join(' '));
    txHaystack.set(t, h);
  }
  return h;
}

function renderAll() {
  renderRecent();
  renderAccounts();
  renderBudgets();
  renderSummary();
  renderAllTransactions();
  renderConfigAccounts();
  renderConfigCategories();
  updateSyncPill();
}

function chipRow(container, items, selectedId, onPick, after) {
  const el = document.getElementById(container);
  el.replaceChildren();
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    const on = it.id === selectedId;
    b.className = 'chip' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = it.label;
    b.onclick = () => {
      onPick(it.id);
      after();
    };
    el.appendChild(b);
  }
  if (!items.length) renderEmpty(el, 'None yet');
}

// Amount input mask: typed digits fill in from the decimals outward (like a
// till), so "200" becomes 2,00 instead of requiring "2,00" to be typed out.
function setupAmountInput(input, initial) {
  let raw = initial > 0 ? String(Math.round(initial * Math.pow(10, curDigits()))) : '';

  function render() {
    input.value = raw ? formatRawAmount(raw, curDigits()) : '';
  }
  function caretToEnd() {
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // Money mask: there's only ever one valid insertion point (the end), so a
  // click/tap anywhere in the field — which sets the caret by coordinates
  // after focus fires — must be pulled back to the end too.
  input.onfocus = () => {
    if (!raw) raw = '0';
    render();
    caretToEnd();
  };
  input.onclick = caretToEnd;
  input.oninput = () => {
    raw = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
    render();
    caretToEnd();
    setFieldError(input, null);
  };
  input.onblur = () => {
    if (!raw || Number(raw) === 0) raw = '';
    render();
  };

  render();
  return {
    reset() {
      raw = '';
      render();
    },
  };
}

// Transfers keep their fixed "Account A → Account B" title — a transfer's
// note (if any) surfaces in the sub line instead, since it isn't the title.
function txTitle(t) {
  if (t.type === 'transfer') return accName(t.from_account) + ' → ' + accName(t.to_account);
  return t.description || 'No description';
}
function txSub(t, pending) {
  const acc =
    t.type === 'income'
      ? accName(t.to_account)
      : t.type === 'expense'
        ? accName(t.from_account)
        : '';
  // Pending rows carry the date in their "due" badge, so don't repeat it here.
  const parts = [pending ? '' : txDateLabel(t.date), acc];
  if (t.type === 'transfer') parts.push(t.description);
  return parts.filter(Boolean).join(' · ');
}
// Always shown as a tag now — "Transfer" for transfers (they have no real
// category), the category name otherwise.
const txCategoryTag = (t) => (t.type === 'transfer' ? 'Transfer' : t.category || '—');

function txRowEl(t) {
  const pending = isPending(t);
  const row = component('tx-row');
  row.classList.toggle('pending', pending);
  row.querySelector('.tx-dot').classList.add(t.type);

  const title = row.querySelector('.tx-title');
  title.textContent = txTitle(t);
  title.classList.toggle('untitled', t.type !== 'transfer' && !t.description);

  const badge = row.querySelector('.due-badge');
  if (pending) badge.textContent = 'due ' + dueLabel(t.date);
  else badge.remove();

  const tag = row.querySelector('.category-tag');
  tag.classList.add(t.type);
  tag.textContent = txCategoryTag(t);
  row.querySelector('.tx-sub-text').textContent = txSub(t, pending);

  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  const amount = row.querySelector('.tx-amount');
  amount.classList.add(t.type);
  amount.textContent = sign + fmtAligned(Number(t.amount));

  row.onclick = () => openTransactionPage(t, undefined, row);
  return row;
}
function renderTxList(elId, txs, emptyText) {
  const el = document.getElementById(elId);
  el.replaceChildren();
  if (!txs.length) {
    renderEmpty(el, emptyText || 'No transactions yet');
    return;
  }
  for (const t of txs) el.appendChild(txRowEl(t));
}
function renderRecent() {
  // Pending entries get their own group: soonest first, all of them, since the
  // point of pre-entering them is to see what's still coming.
  const upcoming = pendingTx().sort((a, b) =>
    (a.date + (a.created_at || '')).localeCompare(b.date + (b.created_at || '')),
  );
  const done = data.transactions
    .filter((t) => !isPending(t))
    .sort((a, b) => (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || '')))
    .slice(0, 8);

  document.getElementById('upcoming-wrap').style.display = upcoming.length ? '' : 'none';
  document.getElementById('recorded-label').style.display = upcoming.length ? '' : 'none';
  if (upcoming.length) renderTxList('upcoming-list', upcoming);
  renderTxList('recent-list', done, upcoming.length ? 'Nothing recorded yet' : null);
}

// Rebuilds a filter <select>'s options from scratch (accounts/categories can
// change), keeping whichever value is still valid selected.
function populateFilterSelect(selectEl, items, allLabel, currentValue) {
  selectEl.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = allLabel;
  selectEl.appendChild(allOpt);
  for (const it of items) {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.label;
    selectEl.appendChild(opt);
  }
  selectEl.value = items.some((it) => it.id === currentValue) ? currentValue : '';
}

// One tag per active `applied` filter, account/category/date order, date
// range collapsed into a single tag. Removed from the DOM (not just hidden)
// when nothing is applied, so it contributes no spacing.
function tagDateRangeLabel() {
  if (applied.from && applied.to)
    return formatDateShort(applied.from) + ' – ' + formatDateShort(applied.to);
  if (applied.from) return 'From ' + formatDateShort(applied.from);
  return 'Until ' + formatDateShort(applied.to);
}
function renderFilterTags() {
  const row = document.getElementById('all-filter-tags');
  const tags = [];
  if (applied.account) {
    const acc = data.accounts.find((a) => a.id === applied.account);
    if (acc) tags.push({ kind: 'account', label: acc.name });
  }
  if (applied.category) {
    const cat = data.categories.find((c) => c.id === applied.category);
    if (cat) tags.push({ kind: 'category', label: cat.name });
  }
  if (applied.from || applied.to) tags.push({ kind: 'date', label: tagDateRangeLabel() });

  if (!tags.length) {
    row.replaceChildren();
    row.hidden = true;
    return;
  }
  row.hidden = false;
  row.replaceChildren();
  for (const t of tags) {
    const tag = component('filter-tag');
    tag.dataset.filter = t.kind;
    tag.querySelector('.filter-tag-label').textContent = t.label;
    const removeBtn = tag.querySelector('.filter-tag-remove');
    removeBtn.setAttribute('aria-label', 'Remove filter: ' + t.label);
    removeBtn.onclick = () => removeFilterTag(t.kind, removeBtn);
    row.appendChild(tag);
  }
}

function renderAllTransactions() {
  let txs = data.transactions;
  if (applied.account) txs = txs.filter((t) => txTouches(t, applied.account));
  if (applied.category) {
    const catName = (data.categories.find((c) => c.id === applied.category) || {}).name;
    txs = txs.filter((t) => t.category === catName);
  }
  // Inclusive both ends, plain string compare — same convention already
  // used for pending/upcoming status, so a reversed range (from > to) just
  // yields zero matches rather than needing special-case handling.
  if (applied.from) txs = txs.filter((t) => t.date >= applied.from);
  if (applied.to) txs = txs.filter((t) => t.date <= applied.to);
  if (searchQuery) {
    const q = foldDanish(searchQuery);
    txs = txs.filter((t) => haystackFor(t).includes(q));
  }
  txs = [...txs].sort((a, b) =>
    (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || '')),
  );

  renderFilterTags();

  const anyActive = !!(applied.account || applied.category || applied.from || applied.to);
  // Screen-reader-only — the design drops the visible count line, but
  // keyboard/SR users still need to know the list changed. Called from the
  // same (already-debounced) path as search, so this never fires per
  // keystroke.
  document.getElementById('all-result-count').textContent =
    txs.length === 0 ? 'No results' : txs.length === 1 ? '1 result' : txs.length + ' results';

  const el = document.getElementById('all-tx-list');
  el.replaceChildren();
  if (!txs.length) {
    const empty = component('empty');
    if (anyActive || searchQuery) {
      empty.replaceChildren();
      const title = document.createElement('div');
      title.className = 'empty-title';
      title.textContent = 'No transactions match';
      const sub = document.createElement('div');
      sub.textContent = 'Try a different search, or clear the filters.';
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'link-btn';
      clearBtn.textContent = 'Clear all filters';
      // The one place search and filters are cleared together — from here
      // there's no distinction, the screen is empty and they want out.
      clearBtn.onclick = clearAllFiltersAndSearch;
      empty.append(title, sub, clearBtn);
    } else {
      empty.textContent = 'No transactions yet';
    }
    el.appendChild(empty);
    return;
  }
  let currentMonth = null,
    groupBody = null;
  for (const t of txs) {
    const mk = monthKey(t.date);
    if (mk !== currentMonth) {
      currentMonth = mk;
      const group = component('tx-month-group');
      group.querySelector('.list-sub').textContent = monthLabel(mk);
      groupBody = group.querySelector('.transactions-list');
      el.appendChild(group);
    }
    groupBody.appendChild(txRowEl(t));
  }
}

// "1.200,00 kr. after 3 upcoming" — the projected balance and how many
// pre-entered transactions it's still waiting on.
const projectedNote = (projected, count) => fmtAligned(projected) + ' after ' + count + ' upcoming';

function renderAccounts() {
  document.getElementById('total-balance').textContent = fmt(totalBalance());
  const upcoming = pendingTx().length;
  const note = document.getElementById('total-projected');
  note.style.display = upcoming ? '' : 'none';
  if (upcoming) {
    const projected = totalProjected();
    note.className = 'projected' + (projected < 0 ? ' neg' : '');
    note.textContent = projectedNote(projected, upcoming);
  }

  const el = document.getElementById('accounts-list');
  el.replaceChildren();
  if (!data.accounts.length) renderEmpty(el, 'Add your first account to get started');
  for (const a of data.accounts) {
    const bal = accountBalance(a.id);
    const pend = pendingTxFor(a.id).length;
    const row = component('account-row');
    row.querySelector('.acct-name').textContent = a.name;
    row.querySelector('.acct-meta').textContent = ownerName(a.owner) + ' · ' + a.type;

    const balEl = row.querySelector('.acct-bal');
    balEl.classList.toggle('neg', bal < 0);
    balEl.textContent = fmtAligned(bal);

    // Accounts with nothing pending keep the plain single-line right column.
    const p = row.querySelector('.projected');
    if (pend) {
      const projected = accountProjected(a.id);
      p.classList.toggle('neg', projected < 0);
      p.textContent = projectedNote(projected, pend);
    } else p.remove();

    row.onclick = () => openAllTx({ account: a.id }, row);
    el.appendChild(row);
  }
}
function ownerName(o) {
  if (o === 'a') return data.settings.name_a || 'A';
  if (o === 'b') return data.settings.name_b || 'B';
  return 'Joint';
}

// Metadata-only account list (Settings › Accounts) — editing and deleting
// happen from here instead of the main Accounts view now.
function renderConfigAccounts() {
  const el = document.getElementById('config-accounts-list');
  el.replaceChildren();
  if (!data.accounts.length) {
    renderEmpty(el, 'Add your first account to get started');
    return;
  }
  for (const a of data.accounts) {
    const row = component('config-row');
    row.querySelector('.acct-name').textContent = a.name;
    row.querySelector('.acct-meta').textContent = ownerName(a.owner) + ' · ' + a.type;
    row.onclick = () => openAccountPage(a, row);
    el.appendChild(row);
  }
}

function renderBudgets() {
  const key = budgetsMonth;
  document.getElementById('budgets-month-label').textContent = monthLabel(key);
  const recordedBy = sumBy(monthTxRecorded(key), 'expense').by;
  const upcomingBy = sumBy(monthTxUpcoming(key), 'expense').by;
  const el = document.getElementById('budgets-list');
  el.replaceChildren();
  const budgeted = data.categories.filter(
    (c) => c.type === 'expense' && Number(c.monthly_budget) > 0,
  );
  if (!budgeted.length) renderEmpty(el, 'Set a monthly budget from Settings › Categories');
  for (const c of budgeted) {
    const recorded = recordedBy[c.name] || 0;
    const upcoming = upcomingBy[c.name] || 0;
    const budget = Number(c.monthly_budget);
    const forecast = recorded + upcoming;
    // The solid bar segment reflects recorded spending only; the row's
    // over/close warning looks ahead to the forecast (recorded + upcoming),
    // since that's the number that actually tells you if you're in trouble.
    const recordedOver = recorded > budget;
    const recordedCls = recordedOver ? 'over' : recorded / budget >= 0.85 ? 'close' : '';
    const forecastOver = forecast > budget;
    const pctRecorded = Math.min(100, (recorded / budget) * 100);
    const pctUpcoming = Math.max(0, Math.min(100 - pctRecorded, (upcoming / budget) * 100));

    const row = component('budget-row');
    row.querySelector('.budget-top .name').textContent = c.name;
    row.querySelector('.budget-top .recorded').textContent = fmt(recorded);

    const note = row.querySelector('.upcoming-note');
    if (upcoming > 0) note.textContent = '+' + fmtDecimals(upcoming) + ' upcoming';
    else note.remove();

    const fill = row.querySelector('.bar-fill');
    if (recordedCls) fill.classList.add(recordedCls);
    fill.style.width = pctRecorded + '%';

    const fillUpcoming = row.querySelector('.bar-fill-upcoming');
    fillUpcoming.classList.toggle('over', forecastOver);
    fillUpcoming.style.width = pctUpcoming + '%';

    const remaining = row.querySelector('.budget-remaining');
    remaining.classList.add(forecastOver ? 'over' : 'left');
    remaining.textContent = forecastOver
      ? fmt(forecast - budget) + ' over budget'
      : fmt(budget - forecast) + ' left';
    row.querySelector('.budget-total').textContent = 'of ' + fmt(budget);
    row.onclick = () => openAllTx({ category: c.id }, row);
    el.appendChild(row);
  }
}

// Category management list (Settings › Categories) — editing and deleting
// happen from here instead of the Budgets view now.
function renderConfigCategories() {
  const cl = document.getElementById('categories-list');
  cl.replaceChildren();
  for (const c of [...data.categories].sort((x, y) =>
    (x.type + x.name).localeCompare(y.type + y.name),
  )) {
    const row = component('config-row');
    row.querySelector('.acct-name').textContent = c.name;
    row.querySelector('.acct-meta').textContent =
      c.type + (Number(c.monthly_budget) > 0 ? ' · budget ' + fmt(Number(c.monthly_budget)) : '');
    row.onclick = () => openCategoryPage(c, row);
    cl.appendChild(row);
  }
}

function trendEl(id, cur, prev, invert) {
  const el = document.getElementById(id);
  if (prev === 0 && cur === 0) {
    el.textContent = '—';
    el.className = 't trend-flat';
    return;
  }
  const diff = cur - prev;
  const good = invert ? diff < 0 : diff > 0;
  el.textContent = diff === 0 ? '=' : fmtSigned(diff);
  el.className = 't ' + (diff === 0 ? 'trend-flat' : good ? 'trend-up' : 'trend-down');
}

function renderSummary() {
  const key = summaryMonth,
    prev = shiftMonth(key, -1);
  document.getElementById('month-label').textContent = monthLabel(key);
  // Recorded-only — still-pending transactions this month are deliberately
  // excluded so the cards read as "what's actually happened."
  const cur = {
    spend: sumBy(monthTxRecorded(key), 'expense'),
    inc: sumBy(monthTxRecorded(key), 'income'),
  };
  const old = {
    spend: sumBy(monthTxRecorded(prev), 'expense'),
    inc: sumBy(monthTxRecorded(prev), 'income'),
  };

  document.getElementById('sum-spent').textContent = fmt(cur.spend.total);
  trendEl('sum-spent-t', cur.spend.total, old.spend.total, true);
  document.getElementById('sum-income').textContent = fmt(cur.inc.total);
  trendEl('sum-income-t', cur.inc.total, old.inc.total, false);

  const netCur = cur.inc.total - cur.spend.total;
  const netOld = old.inc.total - old.spend.total;
  document.getElementById('sum-net').textContent = fmtSigned(netCur);
  trendEl('sum-net-t', netCur, netOld, false);

  const balCur = totalBalanceUptoRecorded(key);
  document.getElementById('sum-balance').textContent = fmt(balCur);
  trendEl('sum-balance-t', balCur, totalBalanceUptoRecorded(prev), false);

  // per-account net change
  const ael = document.getElementById('sum-accounts');
  ael.replaceChildren();
  if (!data.accounts.length) renderEmpty(ael, 'No accounts');
  for (const a of data.accounts) {
    const c = accountNetChange(a.id, key);
    const row = component('account-change-row');
    row.querySelector('.name').textContent = a.name;
    const amt = row.querySelector('.amt');
    if (c !== 0) amt.classList.add(c < 0 ? 'trend-down' : 'trend-up');
    amt.textContent = fmtSignedDecimals(c);
    ael.appendChild(row);
  }

  renderCatBreakdown('sum-spend-cats', cur.spend.by, old.spend.by, true);
  renderCatBreakdown('sum-income-cats', cur.inc.by, old.inc.by, false);
}

function renderCatBreakdown(elId, curBy, oldBy, invert) {
  const el = document.getElementById(elId);
  el.replaceChildren();
  const names = [...new Set([...Object.keys(curBy), ...Object.keys(oldBy)])].sort(
    (a, b) => (curBy[b] || 0) - (curBy[a] || 0),
  );
  if (!names.length) {
    renderEmpty(el, 'Nothing this month');
    return;
  }
  for (const n of names) {
    const c = curBy[n] || 0,
      p = oldBy[n] || 0,
      d = c - p;
    const row = component('cat-breakdown-row');
    row.querySelector('.name').textContent = n;
    const tr = row.querySelector('.tr');
    tr.classList.add(d === 0 ? 'trend-flat' : (invert ? d < 0 : d > 0) ? 'trend-up' : 'trend-down');
    tr.textContent = d === 0 ? '=' : fmtSignedDecimals(d);
    row.querySelector('.amt').textContent = fmtDecimals(c);
    el.appendChild(row);
  }
}
