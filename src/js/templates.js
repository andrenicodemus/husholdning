// ---------- html templates
// Markup lives in .html files rather than in string literals: modals/ holds
// whole dialog bodies (injected as-is), components/ holds the small repeated
// list rows that the render functions clone and fill in.
const MODAL_NAMES = ['account', 'category', 'transaction', 'settings'];
const COMPONENT_NAMES = [
  'empty',
  'tx-row',
  'tx-month-group',
  'account-row',
  'config-row',
  'budget-row',
  'account-change-row',
  'cat-breakdown-row',
];

let modalTemplates = {};
let componentTemplates = {};

async function fetchTemplate(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('template "' + path + '" failed to load: HTTP ' + res.status);
  return res.text();
}

async function loadTemplates() {
  const [modals, components] = await Promise.all([
    Promise.all(MODAL_NAMES.map((n) => fetchTemplate('src/modals/' + n + '.html'))),
    Promise.all(COMPONENT_NAMES.map((n) => fetchTemplate('src/components/' + n + '.html'))),
  ]);
  modalTemplates = Object.fromEntries(MODAL_NAMES.map((n, i) => [n, modals[i]]));
  componentTemplates = Object.fromEntries(
    COMPONENT_NAMES.map((n, i) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = components[i].trim();
      return [n, tpl];
    }),
  );
}

// Returns a fresh, detached copy of a component's root element, ready to fill
// in. Comments and surrounding whitespace in the file are skipped.
function component(name) {
  const tpl = componentTemplates[name];
  if (!tpl) throw new Error('unknown component "' + name + '"');
  return tpl.content.firstElementChild.cloneNode(true);
}

// Replaces a list's contents with the "nothing here" placeholder.
function renderEmpty(el, text) {
  const ph = component('empty');
  ph.textContent = text;
  el.replaceChildren(ph);
}
