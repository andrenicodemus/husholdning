// ---------- modals
const modalBg = document.getElementById('modal-bg');
const modalContent = document.getElementById('modal-content');
let modalScrollY = 0;
function openModal(title, bodyHtml) {
  modalContent.innerHTML =
    '<div class="modal-head"><h3></h3><button class="modal-close" aria-label="Close">' +
    '<svg class="icon"><use href="icons/sprite.svg#close"></use></svg>' +
    '</button></div><div class="modal-body"></div>';
  modalContent.querySelector('.modal-head h3').textContent = title;
  modalContent.querySelector('.modal-body').innerHTML = bodyHtml;
  modalContent.querySelector('.modal-close').onclick = closeModal;
  modalBg.classList.add('open');
  modalScrollY = window.scrollY;
  document.body.style.top = -modalScrollY + 'px';
  document.body.classList.add('modal-open');
}
function closeModal() {
  modalBg.classList.remove('open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalScrollY);
}
modalBg.addEventListener('click', (e) => {
  if (e.target === modalBg) closeModal();
});

function ownerOptions(selected) {
  return ['a', 'b', 'joint']
    .map(
      (o) =>
        '<option value="' +
        o +
        '"' +
        (o === selected ? ' selected' : '') +
        '>' +
        ownerName(o) +
        '</option>',
    )
    .join('');
}

function openAccountModal(acc) {
  const isNew = !acc;
  acc = acc || { name: '', type: 'current', owner: 'joint', initial_balance: 0 };
  openModal(
    isNew ? 'New account' : 'Edit account',
    '<div class="field-label">Name</div><input class="text-input" id="m-name">' +
      '<div class="row2" style="margin-top:4px">' +
      '<div><div class="field-label">Type</div><select class="text-input" id="m-type">' +
      '<option value="current"' +
      (acc.type === 'current' ? ' selected' : '') +
      '>Current</option>' +
      '<option value="savings"' +
      (acc.type === 'savings' ? ' selected' : '') +
      '>Savings</option></select></div>' +
      '<div><div class="field-label">Owner</div><select class="text-input" id="m-owner">' +
      ownerOptions(acc.owner) +
      '</select></div></div>' +
      '<div class="field-label">Initial balance</div><input class="text-input" id="m-init" inputmode="decimal">' +
      '<div class="settle-note">The starting balance when you begin tracking. Current balance = initial + every transaction dated today or earlier; upcoming ones only count from their date.</div>' +
      '<div class="actions" style="display:flex;flex-direction:column;row-gap:8px;">' +
      '<button class="btn-primary" id="m-save">' +
      (isNew ? 'Add account' : 'Save changes') +
      '</button>' +
      (isNew ? '' : '<button class="btn-danger" id="m-del">Delete account</button>') +
      '</div>',
  );
  document.getElementById('m-name').value = acc.name;
  document.getElementById('m-init').value = acc.initial_balance;
  document.getElementById('m-save').onclick = () => {
    const name = document.getElementById('m-name').value.trim();
    const init = parseAmount(document.getElementById('m-init').value || '0');
    if (!name) return toast('Give the account a name');
    if (isNaN(init)) return toast('Initial balance is not a number');
    const payload = {
      id: acc.id || uuid(),
      name,
      type: document.getElementById('m-type').value,
      owner: document.getElementById('m-owner').value,
      initial_balance: init,
      created_at: acc.created_at || new Date().toISOString(),
    };
    submit(isNew ? 'addAccount' : 'updateAccount', payload);
    closeModal();
  };
  if (!isNew)
    document.getElementById('m-del').onclick = () => {
      const used = data.transactions.some(
        (t) => t.from_account === acc.id || t.to_account === acc.id,
      );
      if (used) return toast('Account has transactions — delete them first');
      if (confirm('Delete ' + acc.name + '?')) {
        submit('deleteAccount', { id: acc.id });
        closeModal();
      }
    };
}

function openCategoryModal(cat) {
  const isNew = !cat;
  cat = cat || { name: '', type: 'expense', monthly_budget: 0 };
  openModal(
    isNew ? 'New category' : 'Edit category',
    '<div class="field-label">Name</div><input class="text-input" id="m-name">' +
      '<div class="row2" style="margin-top:4px">' +
      '<div><div class="field-label">Type</div><select class="text-input" id="m-type"' +
      (isNew ? '' : ' disabled') +
      '>' +
      '<option value="expense"' +
      (cat.type === 'expense' ? ' selected' : '') +
      '>Expense</option>' +
      '<option value="income"' +
      (cat.type === 'income' ? ' selected' : '') +
      '>Income</option></select></div>' +
      '<div><div class="field-label">Monthly budget</div><input class="text-input" id="m-budget" inputmode="decimal" placeholder="0 = none"></div></div>' +
      '<div class="actions" style="display:flex;flex-direction:column;row-gap:8px;">' +
      '<button class="btn-primary" id="m-save">' +
      (isNew ? 'Add category' : 'Save changes') +
      '</button>' +
      (isNew ? '' : '<button class="btn-danger" id="m-del">Delete category</button>') +
      '</div>',
  );
  document.getElementById('m-name').value = cat.name;
  document.getElementById('m-budget').value = cat.monthly_budget || '';
  document.getElementById('m-save').onclick = () => {
    const name = document.getElementById('m-name').value.trim();
    const budget = parseAmount(document.getElementById('m-budget').value || '0');
    if (!name) return toast('Give the category a name');
    if (isNaN(budget)) return toast('Budget is not a number');
    submit(isNew ? 'addCategory' : 'updateCategory', {
      id: cat.id || uuid(),
      name,
      type: document.getElementById('m-type').value,
      monthly_budget: budget,
    });
    closeModal();
  };
  if (!isNew)
    document.getElementById('m-del').onclick = () => {
      if (data.transactions.some((t) => t.category === cat.name))
        return toast('Category is used by transactions');
      if (confirm('Delete ' + cat.name + '?')) {
        submit('deleteCategory', { id: cat.id });
        closeModal();
      }
    };
}

let editSel = { type: null, category: null, from: null, to: null };

function renderTxModalBody() {
  const type = editSel.type;
  document.getElementById('m-card').className = 'card tint-' + type;

  const cats = data.categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense'));
  document.getElementById('m-wrap-category').style.display = type === 'transfer' ? 'none' : '';
  if (type !== 'transfer') {
    if (!cats.some((c) => c.id === editSel.category))
      editSel.category = cats.length ? cats[0].id : null;
    chipRow(
      'm-chips-category',
      cats.map((c) => ({ id: c.id, label: c.name })),
      editSel.category,
      (id) => (editSel.category = id),
      renderTxModalBody,
    );
  }

  const accs = data.accounts.map((a) => ({ id: a.id, label: a.name }));
  const showFrom = type !== 'income';
  const showTo = type !== 'expense';
  document.getElementById('m-wrap-from').style.display = showFrom ? '' : 'none';
  document.getElementById('m-wrap-to').style.display = showTo ? '' : 'none';
  if (showFrom) {
    if (!accs.some((a) => a.id === editSel.from)) editSel.from = accs.length ? accs[0].id : null;
    chipRow('m-chips-from', accs, editSel.from, (id) => (editSel.from = id), renderTxModalBody);
  }
  if (showTo) {
    const toAccs = type === 'transfer' ? accs.filter((a) => a.id !== editSel.from) : accs;
    if (!toAccs.some((a) => a.id === editSel.to)) editSel.to = toAccs.length ? toAccs[0].id : null;
    chipRow('m-chips-to', toAccs, editSel.to, (id) => (editSel.to = id), renderTxModalBody);
  }
  document.getElementById('m-label-to').textContent =
    type === 'income' ? 'Receiving account' : 'To account';
}

function openTransactionModal(t) {
  editSel = {
    type: t.type,
    category: (data.categories.find((c) => c.name === t.category) || {}).id || null,
    from: t.from_account || null,
    to: t.to_account || null,
  };
  openModal(
    'Edit transaction',
    '<div class="card" id="m-card" style="padding:0;border:none;margin:0">' +
      '<div class="amount-wrap"><input class="amount-input" id="m-amount" inputmode="numeric"><div class="amount-currency">' +
      (data.settings.currency || 'DKK').toUpperCase() +
      '</div></div>' +
      '<div id="m-wrap-category"><div class="field-label">Category</div><div class="chips" id="m-chips-category"></div></div>' +
      '<div id="m-wrap-from"><div class="field-label" id="m-label-from">From account</div><div class="chips" id="m-chips-from"></div></div>' +
      '<div id="m-wrap-to" style="display:none"><div class="field-label" id="m-label-to">To account</div><div class="chips" id="m-chips-to"></div></div>' +
      '<div class="row2" style="margin-top:14px">' +
      '<div><div class="field-label" style="margin-top:0">Date</div><input class="text-input" type="date" id="m-date"></div>' +
      '<div><div class="field-label" style="margin-top:0">Note</div><input class="text-input" id="m-note" placeholder="Optional"></div>' +
      '</div>' +
      '<div class="actions" style="display:flex;flex-direction:column;row-gap:8px;">' +
      '<button class="btn-primary" id="m-save">Save changes</button>' +
      '<button class="btn-danger" id="m-del">Delete transaction</button>' +
      '</div>' +
      '</div>',
  );
  setupAmountInput(document.getElementById('m-amount'), Number(t.amount));
  document.getElementById('m-date').value = t.date;
  document.getElementById('m-note').value = t.note || '';
  renderTxModalBody();

  document.getElementById('m-save').onclick = () => {
    const amount = parseAmount(document.getElementById('m-amount').value);
    if (!(amount > 0)) return toast('Enter an amount');
    const type = editSel.type;
    const updated = {
      id: t.id,
      date: document.getElementById('m-date').value || todayISO(),
      type,
      amount,
      category:
        type === 'transfer'
          ? ''
          : (data.categories.find((c) => c.id === editSel.category) || {}).name || '',
      from_account: type === 'income' ? '' : editSel.from,
      to_account: type === 'expense' ? '' : editSel.to,
      note: document.getElementById('m-note').value.trim(),
      created_at: t.created_at || new Date().toISOString(),
    };
    if (type !== 'transfer' && !updated.category) return toast('Pick a category');
    if (type !== 'income' && !updated.from_account) return toast('Pick an account');
    if (type !== 'expense' && !updated.to_account) return toast('Pick an account');
    if (type === 'transfer' && updated.from_account === updated.to_account)
      return toast('Pick two different accounts');
    submit('updateTransaction', updated);
    closeModal();
    toast('Saved');
  };
  document.getElementById('m-del').onclick = () => {
    if (confirm('Delete this transaction?')) {
      submit('deleteTransaction', { id: t.id });
      closeModal();
    }
  };
}

function openSettingsModal() {
  const s = data.settings;
  openModal(
    'Settings',
    '<div class="row2"><div><div class="field-label">Name A</div><input class="text-input" id="m-na"></div>' +
      '<div><div class="field-label">Name B</div><input class="text-input" id="m-nb"></div></div>' +
      '<div class="row2" style="margin-top:4px"><div><div class="field-label">Currency</div><input class="text-input" id="m-cur" maxlength="3" autocapitalize="characters"></div>' +
      '<div><div class="field-label">PIN</div><input class="text-input" id="m-pin" inputmode="numeric"></div></div>' +
      '<div class="actions" style="display:flex;flex-direction:column;row-gap:8px;">' +
      '<button class="btn-primary" id="m-save">Save settings</button>' +
      '<button class="btn-ghost" id="m-resync">Force full resync</button>' +
      '<button class="btn-danger" id="m-disconnect">Disconnect from sheet</button>' +
      '</div>',
  );
  document.getElementById('m-na').value = s.name_a || 'A';
  document.getElementById('m-nb').value = s.name_b || 'B';
  document.getElementById('m-cur').value = s.currency || 'DKK';
  document.getElementById('m-pin').value = s.pin || '';
  document.getElementById('m-save').onclick = () => {
    const payload = {
      name_a: document.getElementById('m-na').value.trim() || 'A',
      name_b: document.getElementById('m-nb').value.trim() || 'B',
      currency: (document.getElementById('m-cur').value.trim() || 'DKK').toUpperCase(),
      pin: document.getElementById('m-pin').value.trim() || data.settings.pin,
    };
    submit('updateSettings', payload);
    config.pin = payload.pin;
    store.set('hf_config', config);
    closeModal();
    toast('Settings saved — remind your partner if the PIN changed');
  };
  document.getElementById('m-resync').onclick = async () => {
    closeModal();
    toast('Syncing…');
    await backgroundRefresh();
    toast('Up to date');
  };
  document.getElementById('m-disconnect').onclick = () => {
    if (!confirm('Disconnect this device? Your sheet data is untouched.')) return;
    store.del('hf_config');
    store.del('hf_data');
    store.del('hf_pending');
    location.reload();
  };
}
