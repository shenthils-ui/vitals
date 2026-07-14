# Changelog

All notable changes to Vitals are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses a simple
date-stamped scheme rather than semantic versions because it ships as a whole
app, not a library.

## [Unreleased]

### Added
- Inline **dinner notes** on each logged meal (shared household data).
- **Clear this day's check-in** action with confirmation (private data).
- React **error boundary**: a screen-level runtime error now shows a friendly
  recovery screen with a Reload button instead of a blank page. On-device data
  is never touched.
- Automatic **date rollover** on the Today screen when the app is left open
  past midnight or resumed the next day.

### Changed
- Bottom navigation is now labelled for assistive tech (`aria-label`,
  `aria-current` on the active tab), decorative icons are hidden from screen
  readers, touch targets are larger, and the bar respects the phone's
  gesture-navigation safe area.
- "Last exchange with …" is computed from the full timestamp rather than a
  truncated date string.

### Security
- **Backup restore** now validates every row key against the real table
  columns (`PRAGMA table_info`) before building the `INSERT`, so a hand-crafted
  backup file cannot inject SQL through a column name.
- The Express server returns the normal RPC error envelope for malformed or
  oversized request bodies instead of an HTML error page.

### Fixed
- `saveCheckin` validates the energy range in code (clear message) instead of
  surfacing a raw SQL `CHECK` constraint error.
- `importGrocery` rejects rows without a valid `YYYY-MM-DD` date (counted as
  skipped) rather than storing malformed dates.
- `applyBundle` matches dishes through a prebuilt normalized-name map, so it is
  O(n) instead of O(n²) and collapses duplicate dish names within one bundle to
  a single local dish.

## [1.0.0] — Initial build

### Added
- Local-first, privacy-first household health tracker with two build targets
  from one codebase: a Windows local server (Express + better-sqlite3) and a
  standalone installable Android PWA (sql.js + IndexedDB), sharing one schema
  and all business logic through a better-sqlite3-compatible shim.
- Two-tap Today screen: shared dinner log + private mood/symptom check-in.
- Dish catalog with once-tagged, reused ingredients; History with backfill.
- Restock grocery import (`restock_purchases`) with `purchase_key` dedup.
- Hypothesis-framed Insights: basket composition, weekly mood trend, and
  symptom/food co-occurrence over a 56-day window with visible sample sizes and
  ranking suppressed below the minimum-occurrence threshold.
- Two-phone sync via `VITL1` share bundles carrying **shared data only**;
  Android share-target import; idempotent re-import; drift indicator.
- Full personal backup (includes private check-ins), kept distinct from Share
  sync in the UI.
- GitHub Pages deployment workflow with correct subpath handling, `404.html`
  SPA fallback, offline precaching, and real PNG app icons.
- Verification suite in `scripts/`: engine-parity smoke test, a Playwright run
  of the standalone build under a simulated Pages subpath (all six acceptance
  tests), and an end-to-end server-build check.
