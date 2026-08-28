// ---------- account / category / transaction pages
// These used to be bottom-sheet modals; they're now regular subpages (see
// openSubpage in app.js) — full screen, with a back arrow + title, and the
// whole page scrolls instead of a fixed header over a scrolling body.

function fillOwnerOptions(select, selected) {
  select.querySelectorAll('option').forEach((o) => (o.textContent = ownerName(o.value)));
  select.value = selected;
}

// iOS only opens the on-screen keyboard when focus() runs synchronously
// within the user gesture, so this must stay a plain, immediate call, and it
// must run after the page is made visible — a hidden element can't be
// focused.
function focusSoon(el) {
  el.focus();
}

function openAccountPage(acc) {
  const isNew = !acc;
  acc = acc || { name: '', type: 'current', owner: 'joint', initial_balance: 0 };
  document.getElementById('account-edit-title').textContent = isNew
    ? 'New account'
    : 'Edit account';
  document.getElementById('account-name').value = acc.name;
  document.getElementById('account-type').value = acc.type;
  fillOwnerOptions(document.getElementById('account-owner'), acc.owner);
  document.getElementById('account-init').value = acc.initial_balance;
  document.getElementById('account-save').textContent = isNew ? 'Add account' : 'Save changes';
  document.getElementById('account-del').hidden = isNew;
  openSubpage('view-account-edit');
  if (isNew) focusSoon(document.getElementById('account-name'));

  document.getElementById('account-save').onclick = () => {
    const name = document.getElementById('account-name').value.trim();
    const init = parseAmount(document.getElementById('account-init').value || '0');
    if (!name) return toast('Give the account a name');
    if (isNaN(init)) return toast('Initial balance is not a number');
    const payload = {
      id: acc.id || uuid(),
      name,
      type: document.getElementById('account-type').value,
      owner: document.getElementById('account-owner').value,
      initial_balance: init,
      created_at: acc.created_at || new Date().toISOString(),
    };
    submit(isNew ? 'addAccount' : 'updateAccount', payload);
    history.back();
  };
  if (!isNew)
    document.getElementById('account-del').onclick = () => {
      const used = data.transactions.some(
        (t) => t.from_account === acc.id || t.to_account === acc.id,
      );
      if (used) return toast('Account has transactions — delete them first');
      if (confirm('Delete ' + acc.name + '?')) {
        submit('deleteAccount', { id: acc.id });
        history.back();
      }
    };
}

function openCategoryPage(cat) {
  const isNew = !cat;
  cat = cat || { name: '', type: 'expense', monthly_budget: 0 };
  document.getElementById('category-edit-title').textContent = isNew
    ? 'New category'
    : 'Edit category';
  document.getElementById('category-name').value = cat.name;
  document.getElementById('category-type').value = cat.type;
  document.getElementById('category-type').disabled = !isNew;
  document.getElementById('category-budget').value = cat.monthly_budget || '';
  document.getElementById('category-save').textContent = isNew ? 'Add category' : 'Save changes';
  document.getElementById('category-del').hidden = isNew;
  openSubpage('view-category-edit');
  if (isNew) focusSoon(document.getElementById('category-name'));

  document.getElementById('category-save').onclick = () => {
    const name = document.getElementById('category-name').value.trim();
    const budget = parseAmount(document.getElementById('category-budget').value || '0');
    if (!name) return toast('Give the category a name');
    if (isNaN(budget)) return toast('Budget is not a number');
    submit(isNew ? 'addCategory' : 'updateCategory', {
      id: cat.id || uuid(),
      name,
      type: document.getElementById('category-type').value,
      monthly_budget: budget,
    });
    history.back();
  };
  if (!isNew)
    document.getElementById('category-del').onclick = () => {
      if (data.transactions.some((t) => t.category === cat.name))
        return toast('Category is used by transactions');
      if (confirm('Delete ' + cat.name + '?')) {
        submit('deleteCategory', { id: cat.id });
        history.back();
      }
    };
}

// #tx-form is a <form> so pressing Enter/Go in any of its fields submits
// it — but Save/Delete already handle that via their own click handlers, so
// suppress the browser's default submit (which would reload the page).
document.getElementById('tx-form').onsubmit = (e) => e.preventDefault();

let editSel = { type: null, category: null, from: null, to: null };

function renderTxPageBody() {
  const type = editSel.type;
  document.getElementById('tx-form').className = 'tint-' + type;

  const cats = data.categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense'));
  document.getElementById('tx-wrap-category').style.display = type === 'transfer' ? 'none' : '';
  if (type !== 'transfer') {
    if (!cats.some((c) => c.id === editSel.category))
      editSel.category = cats.length ? cats[0].id : null;
    chipRow(
      'tx-chips-category',
      cats.map((c) => ({ id: c.id, label: c.name })),
      editSel.category,
      (id) => (editSel.category = id),
      renderTxPageBody,
    );
  }

  const accs = data.accounts.map((a) => ({ id: a.id, label: a.name }));
  const showFrom = type !== 'income';
  const showTo = type !== 'expense';
  document.getElementById('tx-wrap-from').style.display = showFrom ? '' : 'none';
  document.getElementById('tx-wrap-to').style.display = showTo ? '' : 'none';
  if (showFrom) {
    if (!accs.some((a) => a.id === editSel.from)) editSel.from = accs.length ? accs[0].id : null;
    chipRow('tx-chips-from', accs, editSel.from, (id) => (editSel.from = id), renderTxPageBody);
  }
  if (showTo) {
    const toAccs = type === 'transfer' ? accs.filter((a) => a.id !== editSel.from) : accs;
    if (!toAccs.some((a) => a.id === editSel.to)) editSel.to = toAccs.length ? toAccs[0].id : null;
    chipRow('tx-chips-to', toAccs, editSel.to, (id) => (editSel.to = id), renderTxPageBody);
  }
  document.getElementById('tx-label-to').textContent =
    type === 'income' ? 'Receiving account' : 'To account';
}

// t null means "add a new transaction of type newType" (from the Home tab's
// Expense/Income/Transfer buttons); otherwise this edits the given
// transaction — its type is fixed for the life of the page either way, only
// amount/description/category/account/date are editable.
function openTransactionPage(t, newType) {
  const isNew = !t;
  t = t || {
    type: newType,
    date: todayISO(),
    amount: 0,
    category: '',
    from_account: '',
    to_account: '',
    description: '',
    created_at: null,
  };
  editSel = {
    type: t.type,
    category: (data.categories.find((c) => c.name === t.category) || {}).id || null,
    from: t.from_account || null,
    to: t.to_account || null,
  };
  const typeLabel = t.type.charAt(0).toUpperCase() + t.type.slice(1);
  document.getElementById('tx-edit-title').textContent = isNew
    ? 'Add ' + typeLabel
    : 'Edit transaction';
  document.getElementById('tx-amount-currency').textContent = (
    data.settings.currency || 'DKK'
  ).toUpperCase();
  setupAmountInput(document.getElementById('tx-amount-input'), Number(t.amount));
  document.getElementById('tx-date').value = t.date;
  document.getElementById('tx-description').value = t.description || '';
  renderTxPageBody();
  document.getElementById('tx-save').textContent = isNew ? 'Save ' + t.type : 'Save changes';
  document.getElementById('tx-del').hidden = isNew;
  openSubpage('view-transaction-edit');
  // Lets the user start typing the amount immediately — must stay a plain,
  // synchronous call within the click handler (see focusSoon above).
  if (isNew) focusSoon(document.getElementById('tx-amount-input'));

  document.getElementById('tx-save').onclick = () => {
    const amount = parseAmount(document.getElementById('tx-amount-input').value);
    if (!(amount > 0)) return toast('Enter an amount');
    if (isNew && !data.accounts.length) return toast('Add an account first (Accounts tab)');
    const type = editSel.type;
    const updated = {
      id: t.id || uuid(),
      date: document.getElementById('tx-date').value || todayISO(),
      type,
      amount,
      category:
        type === 'transfer'
          ? ''
          : (data.categories.find((c) => c.id === editSel.category) || {}).name || '',
      from_account: type === 'income' ? '' : editSel.from,
      to_account: type === 'expense' ? '' : editSel.to,
      description: document.getElementById('tx-description').value.trim(),
      created_at: t.created_at || new Date().toISOString(),
    };
    if (type !== 'transfer' && !updated.category) return toast('Pick a category');
    if (type !== 'income' && !updated.from_account) return toast('Pick an account');
    if (type !== 'expense' && !updated.to_account) return toast('Pick an account');
    if (type === 'transfer' && updated.from_account === updated.to_account)
      return toast('Pick two different accounts');
    submit(isNew ? 'addTransaction' : 'updateTransaction', updated);
    history.back();
    toast(isNew ? 'Saved ' + fmt(amount) : 'Saved');
  };
  if (!isNew)
    document.getElementById('tx-del').onclick = () => {
      if (confirm('Delete this transaction?')) {
        submit('deleteTransaction', { id: t.id });
        history.back();
      }
    };
}
