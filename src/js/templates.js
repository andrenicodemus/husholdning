// ---------- html templates
// Markup for the small repeated list rows (tx rows, account rows, etc.)
// lives in components/*.html rather than in string literals — the render
// functions clone a fetched <template> and fill it in.
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

let componentTemplates = {};

async function fetchTemplate(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('template "' + path + '" failed to load: HTTP ' + res.status);
  return res.text();
}

async function loadTemplates() {
  const components = await Promise.all(
    COMPONENT_NAMES.map((n) => fetchTemplate('src/components/' + n + '.html')),
  );
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
