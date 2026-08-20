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
function fmtSigned(n) { return (n > 0 ? '+' : '') + fmt(n); }
function parseAmount(s) {
  const n = Number(String(s).trim().replace(/\./g, m => s.includes(',') ? '' : m).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = d => String(d).slice(0, 7);
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
function accountBalance(id, uptoMonth) {
  const acc = data.accounts.find(a => a.id === id);
  if (!acc) return 0;
  let bal = Number(acc.initial_balance) || 0;
  for (const t of data.transactions) {
    if (uptoMonth && monthKey(t.date) > uptoMonth) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income' && t.to_account === id) bal += amt;
    if (t.type === 'expense' && t.from_account === id) bal -= amt;
    if (t.type === 'transfer') {
      if (t.from_account === id) bal -= amt;
      if (t.to_account === id) bal += amt;
    }
  }
  return bal;
}
function totalBalance(uptoMonth) {
  return data.accounts.reduce((s, a) => s + accountBalance(a.id, uptoMonth), 0);
}
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
  let net = 0;
  for (const t of monthTx(key)) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income' && t.to_account === id) net += amt;
    if (t.type === 'expense' && t.from_account === id) net -= amt;
    if (t.type === 'transfer') {
      if (t.from_account === id) net -= amt;
      if (t.to_account === id) net += amt;
    }
  }
  return net;
}
const accName = id => (data.accounts.find(a => a.id === id) || {}).name || '?';
