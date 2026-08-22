// ---------- money & dates
function money(n, opts) {
  const cur = (data.settings.currency || 'DKK').toUpperCase();
  try {
    return new Intl.NumberFormat('da-DK', Object.assign({ style: 'currency', currency: cur }, opts)).format(n);
  } catch (e) { return n.toFixed(2) + ' ' + cur; }
}
// How many decimals this currency uses: 2 for DKK/EUR, 0 for JPY, 3 for BHD.
const _curDigits = {};
function curDigits() {
  const cur = (data.settings.currency || 'DKK').toUpperCase();
  if (_curDigits[cur] === undefined) {
    try {
      _curDigits[cur] = new Intl.NumberFormat('da-DK', { style: 'currency', currency: cur })
        .resolvedOptions().maximumFractionDigits;
    } catch (e) { _curDigits[cur] = 2; }
  }
  return _curDigits[cur];
}
// Default: round amounts drop the decimals entirely, but anything with a
// fraction shows all of them — 1.492,40 kr., never a partial 1.492,4 kr.
function fmt(n) {
  const dp = curDigits();
  const unit = Math.pow(10, dp);
  const d = dp && Math.round(Math.abs(n) * unit) % unit ? dp : 0;
  return money(n, { minimumFractionDigits: d, maximumFractionDigits: d });
}
// Account balances are read as a column (see .acct-bal tabular-nums), so keep
// the currency's own decimals there — aligned digits are easier to compare.
function fmtAligned(n) { return money(n, null); }
// Turns a plain digit string (smallest-unit amount, e.g. cents typed right-to-left)
// into a grouped decimal string for the amount input mask — no currency symbol.
function formatRawAmount(raw, decimals) {
  const n = Number(raw || '0') / Math.pow(10, decimals);
  try {
    return new Intl.NumberFormat('da-DK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
  } catch (e) { return n.toFixed(decimals); }
}
function fmtSigned(n) { return (n > 0 ? '+' : '') + fmt(n); }
function parseAmount(s) {
  const n = Number(String(s).trim().replace(/\./g, m => s.includes(',') ? '' : m).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}
// Local calendar date, not UTC: transaction dates are plain YYYY-MM-DD strings
// the user picked in their own timezone, so "today" has to be local too — else
// an evening entry east of UTC would compare as tomorrow.
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const monthKey = d => String(d).slice(0, 7);
// A transaction dated after today hasn't happened yet: it's pending. Both sides
// are YYYY-MM-DD, so a plain string compare is also a date compare.
const isPending = t => String(t.date) > todayISO();
// "28 Aug" — built from the parts so the string is never parsed as UTC.
function dueLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt) ? String(iso) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---------- derived numbers
// What one transaction does to one account's balance (0 if it doesn't touch it).
function txEffect(t, id) {
  const amt = Number(t.amount) || 0;
  if (t.type === 'income') return t.to_account === id ? amt : 0;
  if (t.type === 'expense') return t.from_account === id ? -amt : 0;
  if (t.type === 'transfer') {
    if (t.from_account === id) return -amt;
    if (t.to_account === id) return amt;
  }
  return 0;
}
const txTouches = (t, id) => t.from_account === id || t.to_account === id;
// Initial balance plus every transaction the predicate lets through.
function foldBalance(id, include) {
  const acc = data.accounts.find(a => a.id === id);
  if (!acc) return 0;
  let bal = Number(acc.initial_balance) || 0;
  for (const t of data.transactions) if (include(t)) bal += txEffect(t, id);
  return bal;
}
// The number on the account card: executed transactions only. Future-dated ones
// are pre-entered plans and must not move the balance until their date arrives.
const accountBalance = id => foldBalance(id, t => !isPending(t));
// Where the balance lands once everything already entered has gone through.
const accountProjected = id => foldBalance(id, () => true);
// Month-end snapshot for the monthly summary, which counts every transaction in
// the period — including still-pending ones in the current month.
const accountBalanceUpto = (id, key) => foldBalance(id, t => monthKey(t.date) <= key);

const totalBalance = () => data.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
const totalProjected = () => data.accounts.reduce((s, a) => s + accountProjected(a.id), 0);
const totalBalanceUpto = key => data.accounts.reduce((s, a) => s + accountBalanceUpto(a.id, key), 0);

const pendingTx = () => data.transactions.filter(isPending);
const pendingTxFor = id => data.transactions.filter(t => isPending(t) && txTouches(t, id));
function monthTx(key) { return data.transactions.filter(t => monthKey(t.date) === key); }
function sumBy(txs, type) {
  const by = {}; let total = 0;
  for (const t of txs) if (t.type === type) {
    const amt = Number(t.amount) || 0;
    by[t.category || '—'] = (by[t.category || '—'] || 0) + amt;
    total += amt;
  }
  return { by, total };
}
function accountNetChange(id, key) {
  return monthTx(key).reduce((net, t) => net + txEffect(t, id), 0);
}
const accName = id => (data.accounts.find(a => a.id === id) || {}).name || '?';
