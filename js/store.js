/* =================================================================
   Husholdning — sync engine
   State lives in a Google Sheet via Apps Script; a local cache makes
   the UI instant and writes are queued so entries work offline.
   ================================================================= */

// ---------- persistence (degrades gracefully if storage is blocked)
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let config = store.get('hf_config');            // { url, pin }
let data = store.get('hf_data') || { accounts: [], transactions: [], categories: [], settings: {} };
let pending = store.get('hf_pending') || [];    // queued write actions
let syncing = false;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));

// ---------- API
async function apiCall(action, payload) {
  const res = await fetch(config.url, {
    method: 'POST',
    body: JSON.stringify({ action, pin: config.pin, payload: payload || {} })
  });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || 'server_error');
  return out.data;
}

function acceptServerState(fresh) {
  // Keep optimistic rows for actions still in the queue
  data = fresh;
  for (const p of pending) applyLocal(p, true);
  store.set('hf_data', data);
}

// Apply a queued action to the local cache (optimistic UI)
function applyLocal(item, silent) {
  const { action, payload } = item;
  if (action === 'addTransaction' && !data.transactions.some(t => t.id === payload.id)) data.transactions.push(payload);
  if (action === 'updateTransaction') data.transactions = data.transactions.map(t => t.id === payload.id ? { ...t, ...payload } : t);
  if (action === 'deleteTransaction') data.transactions = data.transactions.filter(t => t.id !== payload.id);
  if (action === 'addAccount' && !data.accounts.some(a => a.id === payload.id)) data.accounts.push(payload);
  if (action === 'updateAccount') data.accounts = data.accounts.map(a => a.id === payload.id ? { ...a, ...payload } : a);
  if (action === 'deleteAccount') data.accounts = data.accounts.filter(a => a.id !== payload.id);
  if (action === 'addCategory' && !data.categories.some(c => c.id === payload.id)) data.categories.push(payload);
  if (action === 'updateCategory') data.categories = data.categories.map(c => c.id === payload.id ? { ...c, ...payload } : c);
  if (action === 'deleteCategory') data.categories = data.categories.filter(c => c.id !== payload.id);
  if (action === 'updateSettings') data.settings = { ...data.settings, ...payload };
  if (!silent) { store.set('hf_data', data); renderAll(); }
}

// Queue a write, apply it locally, kick off a sync
function submit(action, payload) {
  const item = { action, payload };
  pending.push(item);
  store.set('hf_pending', pending);
  applyLocal(item);
  flushQueue();
}

async function flushQueue() {
  if (syncing || !config) return;
  syncing = true;
  updateSyncPill();
  try {
    let lastState = null;
    while (pending.length) {
      const item = pending[0];
      try {
        lastState = await apiCall(item.action, item.payload);
      } catch (err) {
        if (err instanceof TypeError || /fetch|network/i.test(String(err))) throw err; // offline → keep queued
        // Logical server error → drop the action, tell the user, resync
        pending.shift(); store.set('hf_pending', pending);
        toast('Rejected by server: ' + err.message);
        lastState = await apiCall('getAll').catch(() => null);
        continue;
      }
      pending.shift(); store.set('hf_pending', pending);
    }
    if (lastState) { acceptServerState(lastState); renderAll(); }
  } catch (e) {
    /* offline — queue stays */
  } finally {
    syncing = false;
    updateSyncPill();
  }
}

async function backgroundRefresh() {
  if (!config || pending.length) { flushQueue(); return; }
  try {
    const fresh = await apiCall('getAll');
    acceptServerState(fresh);
    renderAll();
  } catch (e) { updateSyncPill(true); }
}

function updateSyncPill(offline) {
  const pill = document.getElementById('sync-pill');
  if (pending.length) {
    pill.className = 'pill warn';
    pill.textContent = syncing ? 'Syncing…' : pending.length + ' unsynced';
  } else if (offline) {
    pill.className = 'pill warn';
    pill.textContent = 'Offline';
  } else {
    pill.className = 'pill';
    pill.textContent = '';
  }
}
