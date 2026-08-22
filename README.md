# Husholdning — joint finance tracker

A zero-cost, two-person finance app. The UI is a PWA hosted on GitHub Pages; the data lives in a Google Sheet you own, exposed through a Google Apps Script web app. No servers, no subscriptions, no app stores.

```
┌─────────────┐   HTTPS/JSON   ┌──────────────────┐        ┌──────────────┐
│  PWA (you    │ ─────────────▶ │  Apps Script     │ ─────▶ │ Google Sheet │
│  + partner)  │ ◀───────────── │  web app (free)  │ ◀───── │ (your data)  │
└─────────────┘                └──────────────────┘        └──────────────┘
```

## What's in this folder

- `apps-script/Code.gs` — the backend. Lives inside your Google Sheet.
- `pwa/` — the app. Goes into a GitHub repository, served by GitHub Pages.

---

## Part 1 — Backend (~10 min)

1. Go to [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet. Name it e.g. **Husholdning data**.
2. In the sheet: **Extensions → Apps Script**.
3. Delete the placeholder code and paste the entire contents of `apps-script/Code.gs`. Save (⌘/Ctrl+S).
4. In the toolbar, select the function **`setup`** and press **Run**. Grant the permissions when asked (it only touches this spreadsheet). This creates the four tabs (`accounts`, `transactions`, `categories`, `settings`) and seeds defaults.
5. **Deploy → New deployment**:
   - Click the gear → type **Web app**
   - Description: anything
   - **Execute as: Me**
   - **Who has access: Anyone**  ← required, this is what lets your phones call it. The PIN is what keeps strangers out.
   - Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).
6. Open the sheet's `settings` tab and change the `pin` value from `1234` to something of your own.

**Test it:** open `YOUR_WEB_APP_URL?action=getAll&pin=YOUR_PIN` in a browser — you should see JSON with your (empty) data.

> After any future change to `Code.gs`, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Part 2 — Frontend (~10 min)

1. Create a GitHub account if you don't have one, then a **new public repository** (e.g. `husholdning`).
2. Upload the app files to the repository root: `index.html`, `style.css`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, and the `js/` folder (`format.js`, `store.js`, `render.js`, `modals.js`, `app.js`) (drag-and-drop works on github.com → *Add file → Upload files*).
3. Repository **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
4. After a minute your app is live at `https://YOURUSERNAME.github.io/husholdning/`.

> The repo is public, but it contains no secrets — the Apps Script URL and PIN are entered on each phone and stored only on the device.

## Part 3 — On your phones (~2 min each)

1. Open the GitHub Pages URL in **Safari** (iPhone) / **Chrome** (Android).
2. Paste the Apps Script URL and your PIN → **Connect**.
3. Add to home screen:
   - iPhone: Share button → **Add to Home Screen**
   - Android: menu ⋮ → **Add to Home screen** (or "Install app")
4. First thing to do in the app: **Accounts tab → + Add account** for each of your accounts, with today's real balance as the *initial balance*. From then on, only log transactions — balances are computed.

## Daily use

- **New**: log an expense, income, or transfer in a few taps. Entries save instantly and sync in the background (the pill in the header shows anything unsynced — it retries automatically when you're back online). Post-date one to plan ahead: it lands in **Upcoming** and starts counting on its date.
- **Accounts**: live balances; tap an account to edit or delete it. Balances only count transactions dated today or earlier — anything upcoming shows as a projected balance beneath.
- **Budgets**: monthly progress per category; manage categories and budgets below.
- **Summary**: pick any month — spent/income/net/balance with trends vs the previous month, per-account change, and category breakdowns.
- ⚙︎ **Settings**: your names, currency, PIN.

## Good to know

- **Your data is always just a spreadsheet.** Open the sheet anytime to inspect or export. Avoid editing rows by hand while the app is in use (the app treats the sheet as its database); if you do, keep the column structure intact.
- **Latency**: Apps Script calls take ~1–2 s. The app hides this with a local cache and optimistic writes, so it never blocks you.
- **Both phones, one PIN**: the PIN lives in the `settings` tab. If you change it, update it on both phones (⚙︎ → PIN, or reconnect).
- **Backup**: in Google Sheets, File → Make a copy, occasionally. That's your whole backup story.
- **Limits**: Apps Script allows vastly more requests per day than two people can produce; a decade of transactions is a few thousand rows — no problem.
