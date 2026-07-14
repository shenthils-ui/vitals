# Vitals 🌿

A local-first, privacy-first household health tracker. Vitals links what your
household eats to how each person feels, with about **two taps a day**: tap
tonight's dinner, tap your mood. It runs two ways from one codebase:

1. **On a Windows laptop** as a small local server + database — double-click
   `start.bat`.
2. **As a standalone installable app (PWA) on an Android phone** — no laptop or
   server needed once installed. All data lives in the phone's own browser
   storage.

No cloud, no accounts, no analytics, no external network calls at runtime.

> **Not medical advice.** The Insights screen shows *associations* in your own
> entries — patterns to discuss with a healthcare professional. Correlation is
> not causation, and Vitals cannot diagnose anything. Sample sizes are always
> shown, and nothing is ranked until a symptom has enough data.

## The privacy model (read this first)

| Data | Where it lives | Synced to your partner? |
| --- | --- | --- |
| Dish catalog & ingredients | shared | ✅ yes, via Share sync |
| Household dinner log | shared | ✅ yes, via Share sync |
| Your daily check-ins (mood, energy, symptoms, notes) | **this phone only** | ❌ never |
| Imported grocery purchases (Restock) | this phone only | ❌ never |

Each phone correlates **its own** private check-ins against the shared dinners
and groceries. Neither phone ever sees the other person's check-ins — this is
enforced in the sync code (an allowlist guard refuses to build a bundle
containing anything check-in shaped) and proven by an automated acceptance
test (`scripts/verify.mjs`).

**Backup vs Share sync — don't confuse them:**

- **Backup** (Settings → Backup): everything on this device *including your
  private check-ins*. It's a personal file for restoring or moving *your own*
  data. Keep it to yourself.
- **Share sync** (Today or Settings): dinners and dishes from the last 8 weeks
  only. This is the only thing that goes to your partner.

## Getting started on Windows (server mode)

1. Install **Node.js** (LTS) from <https://nodejs.org> — click through the
   installer with default settings.
2. Double-click **`start.bat`**. On the first run it installs dependencies and
   builds the app (one time only), then starts the server and opens your
   browser. It prints a LAN URL like `http://192.168.1.23:8787` — open that on
   any phone on the same Wi-Fi.

Data is stored in `data/vitals.db` next to the app.

## Getting the standalone app on an Android phone (GitHub Pages)

One-time repo setting: **Settings → Pages → Source → "GitHub Actions"**.

Every push to `main` then builds and deploys the standalone app automatically
(`.github/workflows/deploy.yml`). Once deployed:

1. On the phone, open the Pages URL in **Chrome**
   (`https://<user>.github.io/<repo>/`).
2. Menu (⋮) → **Add to Home screen** → **Install**.
3. Open Vitals from the home screen. It works fully offline from then on; the
   Pages site is only ever needed again for app updates.

On first launch enter a device name and your name (the name labels your
private check-ins on that phone). Do this on both phones.

## The daily two-tap flow

- **Today → Dinner**: tap tonight's dish (recent dishes are one tap; type to
  search; "New dish" creates one and asks for its main ingredients — tagged
  once, reused forever). A toggle marks restaurant/takeaway meals.
- **Today → Check-in**: tap a mood face (1–5), optionally energy and symptom
  tags, save. The 🔒 marker means it stays on this phone. "Clear this day's
  check-in" removes it again.

Each logged dinner can carry a short **note** (e.g. "extra chilli") — this is
shared household data. Past days can be added or edited from **History**.
That's it — anything heavier (calories, weighing, snack logging) is
deliberately out of scope.

## Syncing the two phones

Dinners and dishes sync through **share bundles** — a short text message you
send however you like (WhatsApp is just the carrier):

1. On phone A: **Share sync** (Today or Settings) → the share sheet opens (or
   the text is copied). Send it to your partner.
2. On phone B: share the received message **to Vitals** (Android share target),
   or paste it on the **Import** screen. Preview shows "From \<name\>: N
   dinners, M dishes" — then Import.

Importing is idempotent: re-importing the same bundle changes nothing. The
Today screen shows how long ago you last exchanged with your partner.

## Importing Restock grocery data

On the **Import** screen, pick (or paste) the `restock_purchases` export file
from Restock. Purchases are deduplicated, so re-importing overlapping ranges
adds nothing. This feeds the basket composition view in Insights (veg & fruit
share vs snacks & drinks share, week by week). Each phone imports its own
copy; Vitals never writes back to Restock and never syncs grocery data.

## Insights

Everything uses a trailing 56-day window and shows its sample size:

- **Mood trend** — average mood per week (private).
- **Basket composition** — share of purchases in Vegetables/Fruit vs
  Snacks/Drinks vs the rest, by count and (when prices exist) by spend.
- **Symptoms & foods** — for each symptom with at least 4 logged days: which
  dinner ingredients appeared on the symptom day or the 2 days before, ranked
  by how much more often they precede symptom days than ordinary days. Both
  rates and raw counts are always displayed. Below 4 days, ranking is
  suppressed and the app says "not enough data yet". No p-values, no
  significance claims — honest ranked associations only, to bring to a
  professional.

## Development

```bash
npm install
npm run dev                 # Vite dev server (server-mode API; run `npm run server` too)
npm run build               # server-mode frontend  -> dist-server/
npm run build:standalone    # standalone PWA build  -> dist-standalone/
npm run server              # Express + better-sqlite3 on :8787
node scripts/smoke.mjs      # fast shared-logic parity check (both engines)
npm run verify              # full Playwright verification of the standalone
                            #   build under a simulated Pages subpath
npm run verify:server       # end-to-end verification of the server build
node scripts/make-icons.mjs # regenerate the PNG app icons
```

See [`CHANGELOG.md`](CHANGELOG.md) for the release history.

### Architecture

- `shared/` — the single source of truth: SQL schema (versioned, with a
  migration path), text normalization, and **all** business logic as functions
  over a db handle. Both builds run this exact code.
- `shared/sqljs-shim.js` — a thin better-sqlite3-compatible wrapper around
  sql.js so the browser engine and the server run identical queries.
- `src/lib/api.js` — the one module that decides at build time
  (`import.meta.env.VITE_STANDALONE`, statically defined in `vite.config.js`)
  whether RPC calls go to `fetch()` or the in-browser engine. sql.js is
  dynamically imported, so no wasm ends up in the server build.
- `src/engine/local.js` — sql.js persisted to IndexedDB (debounced after
  writes, flushed on `visibilitychange`/`pagehide`).
- `server/` — Express server exposing `POST /api/rpc` and serving
  `dist-server/`.
- `scripts/` — verification (kept in the repo so it can be re-run after every
  change), the simulated-Pages static server, and icon generation.
