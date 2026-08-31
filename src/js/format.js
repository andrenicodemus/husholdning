// ---------- money & dates
function money(n, opts) {
  const cur = (data.settings.currency || 'DKK').toUpperCase();
  try {
    return new Intl.NumberFormat(
      'da-DK',
      Object.assign({ style: 'currency', currency: cur }, opts),
    ).format(n);
  } catch (e) {
    return n.toFixed(2) + ' ' + cur;
  }
}
// How many decimals this currency uses: 2 for DKK/EUR, 0 for JPY, 3 for BHD.
const _curDigits = {};
function curDigits() {
  const cur = (data.settings.currency || 'DKK').toUpperCase();
  if (_curDigits[cur] === undefined) {
    try {
      _curDigits[cur] = new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: cur,
      }).resolvedOptions().maximumFractionDigits;
    } catch (e) {
      _curDigits[cur] = 2;
    }
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
function fmtAligned(n) {
  return money(n, null);
}
// Summary breakdown cards (accounts change, spending/income by category): the
// opposite default of fmt() — always show full decimals, except an exact
// zero, which stays a plain "0 kr." rather than "0,00 kr.".
function fmtDecimals(n) {
  const dp = curDigits();
  const isZero = Math.round(n * Math.pow(10, dp)) === 0;
  const d = isZero ? 0 : dp;
  return money(n, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSignedDecimals(n) {
  return (n > 0 ? '+' : '') + fmtDecimals(n);
}
// Turns a plain digit string (smallest-unit amount, e.g. cents typed right-to-left)
// into a grouped decimal string for the amount input mask — no currency symbol.
function formatRawAmount(raw, decimals) {
  const n = Number(raw || '0') / Math.pow(10, decimals);
  try {
    return new Intl.NumberFormat('da-DK', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch (e) {
    return n.toFixed(decimals);
  }
}
function fmtSigned(n) {
  return (n > 0 ? '+' : '') + fmt(n);
}
// Danish-style plain number, no currency symbol — for text fields (initial
// balance, monthly budget) that round-trip through parseAmount: editing an
// existing value and saving it unchanged must be a no-op.
function fmtPlain(n) {
  try {
    return new Intl.NumberFormat('da-DK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch (e) {
    return Number(n).toFixed(2);
  }
}
// Parses a human-typed amount in either Danish (1.234,56) or plain (1234.56)
// style, deciding which separator is the decimal point from what's actually
// in the string rather than assuming one locale — see spec item 3b. Returns
// a Number rounded to 2dp, or null (never NaN) if the string isn't a number.
function parseAmount(str) {
  let s = String(str)
    .trim()
    .replace(/[\u00A0\u202F\s]/g, '') // incl. non-breaking/narrow-no-break space
    .replace(/kr\.?/gi, '')
    .replace(/[^\d.,\-\u2212]/g, ''); // strip any remaining currency symbol etc.
  if (!s) return null;

  let negative = false;
  if (s[0] === '-' || s[0] === '\u2212') {
    negative = true;
    s = s.slice(1);
  }
  if (/[-\u2212]/.test(s)) return null; // a second sign anywhere means this wasn't a number

  if (s.includes(',')) {
    // Last comma is the decimal separator; every '.' before it is a
    // thousands separator and is stripped: "1.234,56" -> "1234.56".
    const i = s.lastIndexOf(',');
    s = s.slice(0, i).replace(/\./g, '') + '.' + s.slice(i + 1);
  } else if ((s.match(/\./g) || []).length > 1) {
    // No comma, two or more '.': they're thousands separators.
    // "1.234.567" -> "1234567". (A single '.' with no comma is left as a
    // decimal point — forgiving of a US-keyboard "1234.56".)
    s = s.replace(/\./g, '');
  }

  if (!/\d/.test(s) || !/^\d*\.?\d*$/.test(s)) return null;
  return Math.round(Number(s) * (negative ? -1 : 1) * 100) / 100;
}

// Dev-only self-check for parseAmount — runs on localhost only, never in the
// deployed app. `node --check`/tests aren't wired up for this vanilla-JS,
// no-build project, so this is the lightweight stand-in the spec calls for.
if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const cases = [
    ['1234,50', 1234.5],
    ['1.234,50', 1234.5],
    ['1234.50', 1234.5],
    ['1234', 1234],
    ['-500', -500],
    ['1.000', 1],
    ['0,05', 0.05],
    [',5', 0.5],
    ['abc', null],
    ['', null],
    ['1.2.3,45', 123.45],
    ['1 234,50', 1234.5],
    ['1234,50 kr.', 1234.5],
  ];
  for (const [input, expected] of cases) {
    console.assert(
      parseAmount(input) === expected,
      'parseAmount(%o) = %o, expected %o',
      input,
      parseAmount(input),
      expected,
    );
  }
}
// Local calendar date, not UTC: transaction dates are plain YYYY-MM-DD strings
// the user picked in their own timezone, so "today" has to be local too — else
// an evening entry east of UTC would compare as tomorrow.
function todayISO() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
const monthKey = (d) => String(d).slice(0, 7);
// A transaction dated after today hasn't happened yet: it's pending. Both sides
// are YYYY-MM-DD, so a plain string compare is also a date compare.
const isPending = (t) => String(t.date) > todayISO();
// "28 Aug" — built from the parts so the string is never parsed as UTC.
function dueLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt)
    ? String(iso)
    : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
// "26 Aug 2026" — same construction as dueLabel, plus the year, for showing a
// transaction's date in lists. Also used as the filter tag date format (the
// spec calls it formatDateShort there) — deliberately different from the
// date *inputs*, which show dd-mm-yyyy per device locale.
function txDateLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt)
    ? String(iso)
    : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
const formatDateShort = txDateLabel;
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
  const acc = data.accounts.find((a) => a.id === id);
  if (!acc) return 0;
  let bal = Number(acc.initial_balance) || 0;
  for (const t of data.transactions) if (include(t)) bal += txEffect(t, id);
  return bal;
}
// The number on the account card: executed transactions only. Future-dated ones
// are pre-entered plans and must not move the balance until their date arrives.
const accountBalance = (id) => foldBalance(id, (t) => !isPending(t));
// Where the balance lands once everything already entered has gone through.
const accountProjected = (id) => foldBalance(id, () => true);
// Month-end snapshot for the monthly summary — excludes this month's
// still-pending transactions, so it reads as "as things stand today."
const accountBalanceUptoRecorded = (id, key) =>
  foldBalance(id, (t) => monthKey(t.date) <= key && !isPending(t));

const totalBalance = () => data.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
const totalProjected = () => data.accounts.reduce((s, a) => s + accountProjected(a.id), 0);
const totalBalanceUptoRecorded = (key) =>
  data.accounts.reduce((s, a) => s + accountBalanceUptoRecorded(a.id, key), 0);

const pendingTx = () => data.transactions.filter(isPending);
const pendingTxFor = (id) => data.transactions.filter((t) => isPending(t) && txTouches(t, id));
function monthTx(key) {
  return data.transactions.filter((t) => monthKey(t.date) === key);
}
const monthTxRecorded = (key) => monthTx(key).filter((t) => !isPending(t));
const monthTxUpcoming = (key) => monthTx(key).filter(isPending);
function sumBy(txs, type) {
  const by = {};
  let total = 0;
  for (const t of txs)
    if (t.type === type) {
      const amt = Number(t.amount) || 0;
      by[t.category || '—'] = (by[t.category || '—'] || 0) + amt;
      total += amt;
    }
  return { by, total };
}
function accountNetChange(id, key) {
  return monthTxRecorded(key).reduce((net, t) => net + txEffect(t, id), 0);
}
const accName = (id) => (data.accounts.find((a) => a.id === id) || {}).name || '?';

// Lowercases and strips diacritics so transaction search is Danish-safe:
// "soren" matches "Søren", "aben" matches "Åben", "rodgrod" matches
// "Rødgrød". æ/ø have no NFD decomposition so they're mapped explicitly;
// everything else (é, ü, …) goes through NFD + stripping the combining marks.
function foldDanish(str) {
  return String(str)
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
