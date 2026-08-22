// ---------- modals
const modalBg = document.getElementById('modal-bg');
const modalContent = document.getElementById('modal-content');
let modalScrollY = 0;

// Keep --app-vh synced to the real, currently-visible viewport height so
// .modal-bg (position:fixed) can size itself against it — see the comment
// on .modal-bg in style.css for why this is needed on iOS.
function syncAppVh() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', h + 'px');
}
syncAppVh();
if (window.visualViewport) window.visualViewport.addEventListener('resize', syncAppVh);
else window.addEventListener('resize', syncAppVh);

function openModal(title, bodyHtml) {
  if (!bodyHtml) {
    console.error('openModal: no template content for "' + title + '" — modalTemplates not loaded?');
    toast('Could not open this dialog — try reloading the page');
    return;
  }
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

function fillOwnerOptions(select, selected) {
  select.querySelectorAll('option').forEach((o) => (o.textContent = ownerName(o.value)));
  select.value = selected;
}

// iOS only opens the on-screen keyboard when focus() runs synchronously
// within the user gesture, so this must stay a plain, immediate call —
// .modal-bg's height (see style.css) is what keeps the modal above the
// keyboard once it opens.
function focusSoon(el) {
  el.focus();
}

function openAccountModal(acc) {
  const isNew = !acc;
  acc = acc || { name: '', type: 'current', owner: 'joint', initial_balance: 0 };
  openModal(isNew ? 'New account' : 'Edit account', modalTemplates.account);
  document.getElementById('m-name').value = acc.name;
  document.getElementById('m-type').value = acc.type;
  fillOwnerOptions(document.getElementById('m-owner'), acc.owner);
  document.getElementById('m-init').value = acc.initial_balance;
  if (isNew) focusSoon(document.getElementById('m-name'));
  document.getElementById('m-save').textContent = isNew ? 'Add account' : 'Save changes';
  document.getElementById('m-del').hidden = isNew;
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
  openModal(isNew ? 'New category' : 'Edit category', modalTemplates.category);
  document.getElementById('m-name').value = cat.name;
  document.getElementById('m-type').value = cat.type;
  document.getElementById('m-type').disabled = !isNew;
  document.getElementById('m-budget').value = cat.monthly_budget || '';
  document.getElementById('m-save').textContent = isNew ? 'Add category' : 'Save changes';
  document.getElementById('m-del').hidden = isNew;
  if (isNew) focusSoon(document.getElementById('m-name'));
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
  openModal('Edit transaction', modalTemplates.transaction);
  document.getElementById('m-amount-cur').textContent = (data.settings.currency || 'DKK').toUpperCase();
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

// Settings is now a menu of pages/actions rather than a form — each config
// page (General, Accounts, Categories) is a full subpage (see app.js), not
// a modal, so all this does is route to them or run the direct actions.
function openSettingsModal() {
  openModal('Settings', modalTemplates.settings);
  document.getElementById('settings-general').onclick = () => {
    closeModal();
    openGeneralSubpage();
  };
  document.getElementById('settings-accounts').onclick = () => {
    closeModal();
    openConfigAccounts();
  };
  document.getElementById('settings-categories').onclick = () => {
    closeModal();
    openConfigCategories();
  };
  document.getElementById('settings-resync').onclick = async () => {
    closeModal();
    toast('Syncing…');
    await backgroundRefresh();
    toast('Up to date');
  };
  document.getElementById('settings-disconnect').onclick = () => {
    if (!confirm('Disconnect this device? Your sheet data is untouched.')) return;
    store.del('hf_config');
    store.del('hf_data');
    store.del('hf_pending');
    location.reload();
  };
}
