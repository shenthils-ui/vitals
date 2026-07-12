import { SCHEMA_VERSION } from './constants.js';

// Migration path: each entry upgrades the schema by one version. To change the
// schema later, bump SCHEMA_VERSION in constants.js and append a migration.
const MIGRATIONS = [
  {
    version: 1,
    sql: `
      -- SHARED/SYNCED tables -------------------------------------------------
      CREATE TABLE IF NOT EXISTS dishes (
        dish_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        meal_type TEXT NOT NULL DEFAULT 'dinner',
        is_restaurant INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dish_ingredients (
        dish_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        UNIQUE(dish_id, normalized_name)
      );
      CREATE TABLE IF NOT EXISTS meals (
        event_id TEXT NOT NULL UNIQUE,
        device_id TEXT NOT NULL,
        date TEXT NOT NULL,
        dish_id TEXT NOT NULL,
        note TEXT,
        is_restaurant INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'logged',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

      -- PRIVATE tables: NEVER placed in any outgoing sync bundle -------------
      CREATE TABLE IF NOT EXISTS checkins (
        checkin_id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
        energy INTEGER CHECK(energy BETWEEN 1 AND 5),
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkin_symptoms (
        checkin_id INTEGER NOT NULL,
        symptom_tag TEXT NOT NULL,
        UNIQUE(checkin_id, symptom_tag)
      );

      -- Local-only tables -----------------------------------------------------
      CREATE TABLE IF NOT EXISTS symptoms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL UNIQUE,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS ext_grocery (
        purchase_key TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_category TEXT NOT NULL,
        qty REAL,
        unit TEXT,
        price_cents INTEGER,
        store TEXT,
        device TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_grocery_date ON ext_grocery(date);
      CREATE TABLE IF NOT EXISTS sync_log (
        bundle_id TEXT NOT NULL UNIQUE,
        from_device TEXT NOT NULL,
        from_name TEXT,
        received_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS peers (
        device_id TEXT NOT NULL UNIQUE,
        name TEXT,
        last_exchange_at TEXT
      );
    `,
  },
];

// Tables whose rows may enter an outgoing share bundle. Everything else is
// private or local-only. Used by the bundle builder as an allowlist.
export const SHARED_TABLES = ['dishes', 'dish_ingredients', 'meals'];
export const PRIVATE_TABLES = ['checkins', 'checkin_symptoms'];
export const ALL_TABLES = [
  'meta', 'dishes', 'dish_ingredients', 'meals', 'checkins',
  'checkin_symptoms', 'symptoms', 'ext_grocery', 'sync_log', 'peers',
];

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  let current = row ? Number(row.value) : 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const apply = db.transaction(() => {
        db.exec(m.sql);
        db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(String(m.version));
      });
      apply();
      current = m.version;
    }
  }
  if (current !== SCHEMA_VERSION) {
    throw new Error(`Database schema version ${current} does not match app schema version ${SCHEMA_VERSION}`);
  }
}
