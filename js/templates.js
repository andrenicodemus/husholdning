// ---------- modal templates
let modalTemplates = {};
async function loadModalTemplates() {
  const names = ['account', 'category', 'transaction', 'settings'];
  const entries = await Promise.all(
    names.map(async (name) => {
      const res = await fetch('modals/' + name + '.html');
      if (!res.ok) throw new Error('modal template "' + name + '" failed to load: HTTP ' + res.status);
      return [name, await res.text()];
    }),
  );
  modalTemplates = Object.fromEntries(entries);
}
