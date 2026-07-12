// ALL business logic for Vitals, as functions over a better-sqlite3-compatible
// db handle. Both builds (Express + better-sqlite3, and sql.js in the browser)
// run this exact code — never two implementations.

import {
  INSIGHT_WINDOW_DAYS, SYMPTOM_LOOKBACK_DAYS, MIN_SYMPTOM_OCCURRENCES,
  BASKET_HEALTHY_CATEGORIES, BASKET_WATCH_CATEGORIES,
  BACKUP_FORMAT, BACKUP_VERSION, BUNDLE_PREFIX, SCHEMA_VERSION,
  SEED_SYMPTOM_TAGS, SEED_DISHES, COMMON_INGREDIENTS,
} from './constants.js';
import {
  normalizeName, todayStr, addDays, daysBetween, dateRange, nowIso,
  stableHash, b64urlEncode, b64urlDecode,
} from './normalize.js';
import { ALL_TABLES } from './schema.js';

// ---------------------------------------------------------------- meta / ids

function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function nextId(db) {
  const deviceId = getMeta(db, 'device_id');
  if (!deviceId) throw new Error('Device not set up yet');
  const n = Number(getMeta(db, 'id_counter') || '0') + 1;
  setMeta(db, 'id_counter', n);
  return `${deviceId}-${n}`;
}

export function getState(db) {
  return {
    initialized: !!getMeta(db, 'device_id'),
    device_id: getMeta(db, 'device_id'),
    device_name: getMeta(db, 'device_name'),
    person_name: getMeta(db, 'person_name'),
    schema_version: Number(getMeta(db, 'schema_version')),
    common_ingredients: COMMON_INGREDIENTS,
  };
}

export function setup(db, { device_name, person_name }) {
  if (!device_name || !person_name) throw new Error('Device name and your name are required');
  const run = db.transaction(() => {
    if (!getMeta(db, 'device_id')) {
      const id = 'dev-' + stableHash(`${device_name}|${person_name}|${nowIso()}|${Math.random()}`).slice(0, 10);
      setMeta(db, 'device_id', id);
    }
    setMeta(db, 'device_name', device_name.trim());
    setMeta(db, 'person_name', person_name.trim());
    seedDefaults(db);
  });
  run();
  return getState(db);
}

export function updateSettings(db, { device_name, person_name }) {
  if (device_name != null) setMeta(db, 'device_name', String(device_name).trim());
  if (person_name != null) setMeta(db, 'person_name', String(person_name).trim());
  return getState(db);
}

function seedDefaults(db) {
  const haveSymptoms = db.prepare('SELECT COUNT(*) AS c FROM symptoms').get().c;
  if (!haveSymptoms) {
    for (const tag of SEED_SYMPTOM_TAGS) {
      db.prepare('INSERT OR IGNORE INTO symptoms (tag, archived) VALUES (?, 0)').run(tag);
    }
  }
  const haveDishes = db.prepare('SELECT COUNT(*) AS c FROM dishes').get().c;
  if (!haveDishes) {
    for (const d of SEED_DISHES) {
      insertDish(db, { name: d.name, meal_type: 'dinner', is_restaurant: 0, ingredients: d.ingredients });
    }
  }
  // Deliberately NO seeded meals or check-ins: insights must be computed from
  // real entries only.
}

// -------------------------------------------------------------------- dishes

function insertDish(db, { dish_id, name, meal_type = 'dinner', is_restaurant = 0, ingredients = [] }) {
  const id = dish_id || nextId(db);
  db.prepare('INSERT INTO dishes (dish_id, name, meal_type, is_restaurant, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), meal_type, is_restaurant ? 1 : 0, nowIso());
  for (const ing of ingredients) addIngredientRow(db, id, ing);
  return id;
}

function addIngredientRow(db, dishId, ingredientName) {
  const raw = String(ingredientName).trim();
  if (!raw) return;
  db.prepare('INSERT OR IGNORE INTO dish_ingredients (dish_id, ingredient_name, normalized_name) VALUES (?, ?, ?)')
    .run(dishId, raw, normalizeName(raw));
}

function dishWithIngredients(db, row) {
  const ingredients = db.prepare('SELECT ingredient_name, normalized_name FROM dish_ingredients WHERE dish_id = ? ORDER BY rowid')
    .all(row.dish_id);
  return { ...row, ingredients };
}

export function listDishes(db, { q = '' } = {}) {
  const rows = db.prepare(`
    SELECT d.*, COUNT(m.event_id) AS use_count, MAX(m.date) AS last_used
    FROM dishes d LEFT JOIN meals m ON m.dish_id = d.dish_id
    GROUP BY d.dish_id
    ORDER BY last_used DESC NULLS LAST, use_count DESC, d.name ASC
  `).all();
  const nq = normalizeName(q);
  const filtered = nq ? rows.filter((r) => normalizeName(r.name).includes(nq)) : rows;
  return filtered.map((r) => dishWithIngredients(db, r));
}

export function getDish(db, { dish_id }) {
  const row = db.prepare('SELECT * FROM dishes WHERE dish_id = ?').get(dish_id);
  if (!row) throw new Error('Dish not found');
  return dishWithIngredients(db, row);
}

export function createDish(db, { name, meal_type = 'dinner', is_restaurant = 0, ingredients = [] }) {
  if (!name || !name.trim()) throw new Error('Dish name is required');
  const run = db.transaction(() => insertDish(db, { name, meal_type, is_restaurant, ingredients }));
  const id = run();
  return getDish(db, { dish_id: id });
}

export function updateDish(db, { dish_id, name, is_restaurant, ingredients }) {
  const run = db.transaction(() => {
    const row = db.prepare('SELECT * FROM dishes WHERE dish_id = ?').get(dish_id);
    if (!row) throw new Error('Dish not found');
    db.prepare('UPDATE dishes SET name = ?, is_restaurant = ? WHERE dish_id = ?')
      .run(name != null ? String(name).trim() : row.name,
        is_restaurant != null ? (is_restaurant ? 1 : 0) : row.is_restaurant, dish_id);
    if (ingredients != null) {
      db.prepare('DELETE FROM dish_ingredients WHERE dish_id = ?').run(dish_id);
      for (const ing of ingredients) addIngredientRow(db, dish_id, ing);
    }
  });
  run();
  return getDish(db, { dish_id });
}

// --------------------------------------------------------------------- meals

export function logMeal(db, { date, dish_id, note = null, is_restaurant = null }) {
  if (!date || !dish_id) throw new Error('date and dish_id are required');
  const dish = db.prepare('SELECT * FROM dishes WHERE dish_id = ?').get(dish_id);
  if (!dish) throw new Error('Dish not found');
  const run = db.transaction(() => {
    const eventId = nextId(db);
    const restaurant = is_restaurant != null ? (is_restaurant ? 1 : 0) : dish.is_restaurant;
    if (is_restaurant != null && (is_restaurant ? 1 : 0) !== dish.is_restaurant) {
      db.prepare('UPDATE dishes SET is_restaurant = ? WHERE dish_id = ?').run(is_restaurant ? 1 : 0, dish_id);
    }
    db.prepare(`INSERT INTO meals (event_id, device_id, date, dish_id, note, is_restaurant, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'logged', ?)`)
      .run(eventId, getMeta(db, 'device_id'), date, dish_id, note ?? null, restaurant, nowIso());
    return eventId;
  });
  const eventId = run();
  return { event_id: eventId };
}

export function updateMeal(db, { event_id, dish_id, note, is_restaurant }) {
  const row = db.prepare('SELECT * FROM meals WHERE event_id = ?').get(event_id);
  if (!row) throw new Error('Meal not found');
  db.prepare('UPDATE meals SET dish_id = ?, note = ?, is_restaurant = ? WHERE event_id = ?')
    .run(dish_id ?? row.dish_id,
      note !== undefined ? note : row.note,
      is_restaurant != null ? (is_restaurant ? 1 : 0) : row.is_restaurant,
      event_id);
  return { ok: true };
}

export function deleteMeal(db, { event_id }) {
  db.prepare('DELETE FROM meals WHERE event_id = ?').run(event_id);
  return { ok: true };
}

function mealsForDate(db, date) {
  return db.prepare(`
    SELECT m.*, d.name AS dish_name FROM meals m
    LEFT JOIN dishes d ON d.dish_id = m.dish_id
    WHERE m.date = ? ORDER BY m.created_at
  `).all(date);
}

// ------------------------------------------------------------ check-ins (PRIVATE)

function checkinForDate(db, date) {
  const row = db.prepare('SELECT * FROM checkins WHERE date = ?').get(date);
  if (!row) return null;
  const symptoms = db.prepare('SELECT symptom_tag FROM checkin_symptoms WHERE checkin_id = ?')
    .all(row.checkin_id).map((r) => r.symptom_tag);
  return { ...row, symptoms };
}

export function saveCheckin(db, { date, mood, energy = null, note = null, symptoms = [] }) {
  if (!date) throw new Error('date is required');
  const m = Number(mood);
  if (!(m >= 1 && m <= 5)) throw new Error('mood must be 1..5');
  const run = db.transaction(() => {
    const existing = db.prepare('SELECT checkin_id FROM checkins WHERE date = ?').get(date);
    let id;
    if (existing) {
      id = existing.checkin_id;
      db.prepare('UPDATE checkins SET mood = ?, energy = ?, note = ? WHERE checkin_id = ?')
        .run(m, energy ?? null, note ?? null, id);
      db.prepare('DELETE FROM checkin_symptoms WHERE checkin_id = ?').run(id);
    } else {
      db.prepare('INSERT INTO checkins (date, mood, energy, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(date, m, energy ?? null, note ?? null, nowIso());
      id = db.prepare('SELECT checkin_id FROM checkins WHERE date = ?').get(date).checkin_id;
    }
    for (const tag of symptoms) {
      const t = String(tag).trim();
      if (!t) continue;
      db.prepare('INSERT OR IGNORE INTO symptoms (tag, archived) VALUES (?, 0)').run(t);
      db.prepare('INSERT OR IGNORE INTO checkin_symptoms (checkin_id, symptom_tag) VALUES (?, ?)').run(id, t);
    }
  });
  run();
  return checkinForDate(db, date);
}

export function deleteCheckin(db, { date }) {
  const row = db.prepare('SELECT checkin_id FROM checkins WHERE date = ?').get(date);
  if (row) {
    db.prepare('DELETE FROM checkin_symptoms WHERE checkin_id = ?').run(row.checkin_id);
    db.prepare('DELETE FROM checkins WHERE date = ?').run(date);
  }
  return { ok: true };
}

// ------------------------------------------------------------------ symptoms

export function listSymptoms(db, { include_archived = false } = {}) {
  return include_archived
    ? db.prepare('SELECT * FROM symptoms ORDER BY archived, tag').all()
    : db.prepare('SELECT * FROM symptoms WHERE archived = 0 ORDER BY tag').all();
}

export function addSymptom(db, { tag }) {
  const t = String(tag ?? '').trim();
  if (!t) throw new Error('Tag is required');
  db.prepare('INSERT OR IGNORE INTO symptoms (tag, archived) VALUES (?, 0)').run(t);
  db.prepare('UPDATE symptoms SET archived = 0 WHERE tag = ?').run(t);
  return listSymptoms(db, {});
}

export function setSymptomArchived(db, { id, archived }) {
  db.prepare('UPDATE symptoms SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
  return listSymptoms(db, { include_archived: true });
}

// ------------------------------------------------------------- day / history

export function getDay(db, { date }) {
  return { date, meals: mealsForDate(db, date), checkin: checkinForDate(db, date) };
}

export function getHistory(db, { from, to }) {
  const meals = db.prepare(`
    SELECT m.*, d.name AS dish_name FROM meals m
    LEFT JOIN dishes d ON d.dish_id = m.dish_id
    WHERE m.date >= ? AND m.date <= ? ORDER BY m.date DESC, m.created_at
  `).all(from, to);
  const checkins = db.prepare('SELECT * FROM checkins WHERE date >= ? AND date <= ?').all(from, to);
  const symRows = db.prepare(`
    SELECT cs.checkin_id, cs.symptom_tag FROM checkin_symptoms cs
    JOIN checkins c ON c.checkin_id = cs.checkin_id
    WHERE c.date >= ? AND c.date <= ?
  `).all(from, to);
  const symsById = {};
  for (const r of symRows) (symsById[r.checkin_id] ||= []).push(r.symptom_tag);
  const days = {};
  for (const m of meals) (days[m.date] ||= { date: m.date, meals: [], checkin: null }).meals.push(m);
  for (const c of checkins) {
    (days[c.date] ||= { date: c.date, meals: [], checkin: null }).checkin = { ...c, symptoms: symsById[c.checkin_id] || [] };
  }
  return Object.values(days).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ------------------------------------------------------------ grocery import

// Accepts Restock's frozen "restock_purchases" export: an object with
// format:"restock_purchases" and a purchases array, or a bare array of rows.
export function importGrocery(db, { payload }) {
  let data = payload;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { throw new Error('Not valid JSON'); }
  }
  let rows;
  if (Array.isArray(data)) rows = data;
  else if (data && Array.isArray(data.purchases)) rows = data.purchases;
  else if (data && Array.isArray(data.rows)) rows = data.rows;
  else throw new Error('Unrecognized format: expected a restock_purchases export');
  if (data && !Array.isArray(data) && data.format && data.format !== 'restock_purchases') {
    throw new Error(`Unrecognized format "${data.format}": expected restock_purchases`);
  }
  let added = 0, skipped = 0;
  const run = db.transaction(() => {
    for (const r of rows) {
      const date = r.date;
      const item = r.item_name ?? r.item ?? r.name;
      if (!date || !item) { skipped++; continue; }
      const qty = r.qty ?? null;
      const price = r.price_cents ?? null;
      const store = r.store ?? null;
      const device = r.device ?? null;
      const key = r.purchase_key
        || stableHash(`${date}|${item}|${store ?? ''}|${qty ?? ''}|${price ?? ''}|${device ?? ''}`);
      const res = db.prepare(`INSERT OR IGNORE INTO ext_grocery
        (purchase_key, date, item_name, item_category, qty, unit, price_cents, store, device)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(key, date, item, r.item_category ?? r.category ?? 'Other', qty, r.unit ?? null, price, store, device);
      if (res.changes > 0) added++; else skipped++;
    }
  });
  run();
  const stats = db.prepare('SELECT COUNT(*) AS c, MIN(date) AS min_d, MAX(date) AS max_d FROM ext_grocery').get();
  return { added, skipped, total: stats.c, from: stats.min_d, to: stats.max_d };
}

export function groceryStats(db) {
  return db.prepare('SELECT COUNT(*) AS total, MIN(date) AS from_date, MAX(date) AS to_date FROM ext_grocery').get();
}

// ------------------------------------------------------------------ insights

// All insight computations use the trailing INSIGHT_WINDOW_DAYS window ending
// at `today` (passed by the client so both engines agree on the calendar day).
export function getInsights(db, { today } = {}) {
  const end = today || todayStr();
  const start = addDays(end, -(INSIGHT_WINDOW_DAYS - 1));
  return {
    window: { from: start, to: end, days: INSIGHT_WINDOW_DAYS },
    constants: {
      min_symptom_occurrences: MIN_SYMPTOM_OCCURRENCES,
      lookback_days: SYMPTOM_LOOKBACK_DAYS,
      healthy_categories: BASKET_HEALTHY_CATEGORIES,
      watch_categories: BASKET_WATCH_CATEGORIES,
    },
    basket: basketComposition(db, start, end),
    cooccurrence: symptomFoodCooccurrence(db, start, end),
    mood_trend: moodTrend(db, start, end),
  };
}

function basketComposition(db, start, end) {
  const rows = db.prepare('SELECT * FROM ext_grocery WHERE date >= ? AND date <= ?').all(start, end);
  const group = (cat) => (BASKET_HEALTHY_CATEGORIES.includes(cat) ? 'healthy'
    : BASKET_WATCH_CATEGORIES.includes(cat) ? 'watch' : 'rest');
  const byCount = { healthy: 0, watch: 0, rest: 0 };
  const bySpend = { healthy: 0, watch: 0, rest: 0 };
  let spendRows = 0;
  for (const r of rows) {
    const g = group(r.item_category);
    byCount[g]++;
    if (r.price_cents != null) { bySpend[g] += r.price_cents; spendRows++; }
  }
  // Week-by-week trend of the veg/fruit (healthy) share, oldest week first.
  const weeks = [];
  const nWeeks = Math.ceil(INSIGHT_WINDOW_DAYS / 7);
  for (let w = 0; w < nWeeks; w++) {
    const wStart = addDays(start, w * 7);
    const wEnd = addDays(start, Math.min(w * 7 + 6, INSIGHT_WINDOW_DAYS - 1));
    const wRows = rows.filter((r) => r.date >= wStart && r.date <= wEnd);
    const h = wRows.filter((r) => group(r.item_category) === 'healthy').length;
    weeks.push({ from: wStart, to: wEnd, total: wRows.length, healthy: h, share: wRows.length ? h / wRows.length : null });
  }
  return { total_purchases: rows.length, by_count: byCount, by_spend: spendRows ? bySpend : null, spend_rows: spendRows, weekly_healthy_share: weeks };
}

// Set of normalized ingredient names from dinners on `date` and the previous
// SYMPTOM_LOOKBACK_DAYS days ("preceding dinners").
function buildPrecedingSets(db, start, end) {
  const earliest = addDays(start, -SYMPTOM_LOOKBACK_DAYS);
  const rows = db.prepare(`
    SELECT m.date, di.normalized_name FROM meals m
    JOIN dish_ingredients di ON di.dish_id = m.dish_id
    WHERE m.date >= ? AND m.date <= ?
  `).all(earliest, end);
  const byDate = {};
  for (const r of rows) (byDate[r.date] ||= new Set()).add(r.normalized_name);
  const preceding = {};
  for (const d of dateRange(start, end)) {
    const set = new Set();
    for (let k = 0; k <= SYMPTOM_LOOKBACK_DAYS; k++) {
      const s = byDate[addDays(d, -k)];
      if (s) for (const ing of s) set.add(ing);
    }
    preceding[d] = set;
  }
  return preceding;
}

function symptomFoodCooccurrence(db, start, end) {
  const windowDates = dateRange(start, end);
  const preceding = buildPrecedingSets(db, start, end);

  // Baseline: for each ingredient, on how many window days does it appear in
  // the preceding-dinner set (i.e. how often it precedes ANY day).
  const baselineCounts = {};
  for (const d of windowDates) {
    for (const ing of preceding[d]) baselineCounts[ing] = (baselineCounts[ing] || 0) + 1;
  }

  const tagRows = db.prepare(`
    SELECT cs.symptom_tag AS tag, c.date FROM checkin_symptoms cs
    JOIN checkins c ON c.checkin_id = cs.checkin_id
    WHERE c.date >= ? AND c.date <= ?
  `).all(start, end);
  const daysByTag = {};
  for (const r of tagRows) (daysByTag[r.tag] ||= new Set()).add(r.date);

  const results = [];
  for (const [tag, daySet] of Object.entries(daysByTag)) {
    const symptomDays = [...daySet].sort();
    const n = symptomDays.length;
    const entry = {
      tag,
      occurrences: n,
      symptom_days: symptomDays,
      ranked: n >= MIN_SYMPTOM_OCCURRENCES,
      min_needed: MIN_SYMPTOM_OCCURRENCES,
      ingredients: [],
    };
    if (entry.ranked) {
      const withCounts = {};
      for (const d of symptomDays) {
        for (const ing of preceding[d]) withCounts[ing] = (withCounts[ing] || 0) + 1;
      }
      const list = Object.entries(withCounts).map(([ing, c]) => {
        const baseC = baselineCounts[ing] || 0;
        return {
          ingredient: ing,
          symptom_days_with: c,
          symptom_days_total: n,
          with_rate: c / n,
          baseline_days_with: baseC,
          window_days: windowDates.length,
          baseline_rate: baseC / windowDates.length,
          delta: c / n - baseC / windowDates.length,
        };
      });
      list.sort((a, b) => b.delta - a.delta || b.symptom_days_with - a.symptom_days_with || a.ingredient.localeCompare(b.ingredient));
      entry.ingredients = list.slice(0, 5);
    }
    results.push(entry);
  }
  results.sort((a, b) => b.occurrences - a.occurrences || a.tag.localeCompare(b.tag));
  return results;
}

function moodTrend(db, start, end) {
  const rows = db.prepare('SELECT date, mood FROM checkins WHERE date >= ? AND date <= ?').all(start, end);
  const weeks = [];
  const nWeeks = Math.ceil(INSIGHT_WINDOW_DAYS / 7);
  for (let w = 0; w < nWeeks; w++) {
    const wStart = addDays(start, w * 7);
    const wEnd = addDays(start, Math.min(w * 7 + 6, INSIGHT_WINDOW_DAYS - 1));
    const wRows = rows.filter((r) => r.date >= wStart && r.date <= wEnd);
    const avg = wRows.length ? wRows.reduce((s, r) => s + r.mood, 0) / wRows.length : null;
    weeks.push({ from: wStart, to: wEnd, count: wRows.length, avg_mood: avg });
  }
  return { total_checkins: rows.length, weeks };
}

// ---------------------------------------------------- share bundles (W6)

// Keys allowed anywhere inside an outgoing bundle payload. Anything else —
// especially anything check-in shaped — makes assertShareSafe throw.
const BUNDLE_ALLOWED_KEYS = new Set([
  'v', 'bundle_id', 'from', 'id', 'name', 'sent_at',
  'dishes', 'dish_id', 'meal_type', 'is_restaurant',
  'dish_ingredients', 'ingredient_name',
  'meals', 'event_id', 'date', 'note',
]);
const BUNDLE_FORBIDDEN_KEYS = /checkin|mood|energy|symptom/i;

export function assertShareSafe(obj, path = '') {
  if (Array.isArray(obj)) { obj.forEach((v, i) => assertShareSafe(v, `${path}[${i}]`)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (BUNDLE_FORBIDDEN_KEYS.test(k) || !BUNDLE_ALLOWED_KEYS.has(k)) {
        throw new Error(`PRIVACY GUARD: key "${k}" at ${path} is not allowed in a share bundle`);
      }
      assertShareSafe(v, `${path}.${k}`);
    }
  }
}

// Builds the outgoing bundle. HARD REQUIREMENT: only dishes, dish_ingredients
// and meals ever enter the payload; check-ins are never queried here and the
// payload is verified against an allowlist before encoding.
export function createBundle(db, { today } = {}) {
  const end = today || todayStr();
  const start = addDays(end, -(INSIGHT_WINDOW_DAYS - 1));
  const state = getState(db);
  if (!state.initialized) throw new Error('Set up the device first');

  const meals = db.prepare('SELECT event_id, date, dish_id, note, is_restaurant FROM meals WHERE date >= ? AND date <= ? ORDER BY date').all(start, end);
  const dishIds = [...new Set(meals.map((m) => m.dish_id))];
  const dishes = [];
  const dishIngredients = [];
  for (const id of dishIds) {
    const d = db.prepare('SELECT dish_id, name, meal_type, is_restaurant FROM dishes WHERE dish_id = ?').get(id);
    if (!d) continue;
    dishes.push(d);
    for (const di of db.prepare('SELECT dish_id, ingredient_name FROM dish_ingredients WHERE dish_id = ?').all(id)) {
      dishIngredients.push(di);
    }
  }
  const bundleId = nextId(db);
  const payload = {
    v: 1,
    bundle_id: bundleId,
    from: { id: state.device_id, name: state.person_name },
    sent_at: nowIso(),
    dishes,
    dish_ingredients: dishIngredients,
    meals: meals.map((m) => ({ event_id: m.event_id, date: m.date, dish_id: m.dish_id, note: m.note, is_restaurant: m.is_restaurant })),
  };
  assertShareSafe(payload); // privacy guard: throws if anything private slips in

  const token = BUNDLE_PREFIX + b64urlEncode(JSON.stringify(payload));
  const summary = `Vitals sync (from ${state.person_name}): ${meals.length} dinners, ${dishes.length} dishes`;
  return { summary, token, text: `${summary}\n${token}`, counts: { meals: meals.length, dishes: dishes.length } };
}

export function parseBundle(text) {
  const m = String(text ?? '').match(/VITL1:([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('No Vitals sync code (VITL1:…) found in the pasted text');
  let payload;
  try { payload = JSON.parse(b64urlDecode(m[1])); } catch { throw new Error('The sync code is damaged and could not be read'); }
  if (payload.v !== 1) throw new Error(`Unsupported bundle version ${payload.v}`);
  return payload;
}

export function previewBundle(db, { text }) {
  const p = parseBundle(text);
  const known = !!db.prepare('SELECT 1 AS x FROM sync_log WHERE bundle_id = ?').get(p.bundle_id);
  return {
    bundle_id: p.bundle_id,
    from: p.from,
    sent_at: p.sent_at,
    meals: (p.meals || []).length,
    dishes: (p.dishes || []).length,
    already_imported: known,
  };
}

export function applyBundle(db, { text }) {
  const p = parseBundle(text);
  const known = !!db.prepare('SELECT 1 AS x FROM sync_log WHERE bundle_id = ?').get(p.bundle_id);
  if (known) return { already_imported: true, added_meals: 0, added_dishes: 0 };

  let addedMeals = 0, addedDishes = 0;
  const run = db.transaction(() => {
    // Cross-device dish matching: by dish_id if present, else by normalized
    // name (create if missing). idMap translates remote ids to local ids.
    const idMap = {};
    for (const d of p.dishes || []) {
      const byId = db.prepare('SELECT dish_id FROM dishes WHERE dish_id = ?').get(d.dish_id);
      if (byId) { idMap[d.dish_id] = d.dish_id; continue; }
      const local = db.prepare('SELECT dish_id, name FROM dishes').all()
        .find((r) => normalizeName(r.name) === normalizeName(d.name));
      if (local) { idMap[d.dish_id] = local.dish_id; continue; }
      db.prepare('INSERT OR IGNORE INTO dishes (dish_id, name, meal_type, is_restaurant, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(d.dish_id, d.name, d.meal_type || 'dinner', d.is_restaurant ? 1 : 0, nowIso());
      idMap[d.dish_id] = d.dish_id;
      addedDishes++;
      for (const di of (p.dish_ingredients || []).filter((x) => x.dish_id === d.dish_id)) {
        addIngredientRow(db, d.dish_id, di.ingredient_name);
      }
    }
    for (const m of p.meals || []) {
      const res = db.prepare(`INSERT OR IGNORE INTO meals (event_id, device_id, date, dish_id, note, is_restaurant, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'synced', ?)`)
        .run(m.event_id, p.from?.id || 'unknown', m.date, idMap[m.dish_id] || m.dish_id, m.note ?? null, m.is_restaurant ? 1 : 0, nowIso());
      if (res.changes > 0) addedMeals++;
    }
    db.prepare('INSERT INTO sync_log (bundle_id, from_device, from_name, received_at) VALUES (?, ?, ?, ?)')
      .run(p.bundle_id, p.from?.id || 'unknown', p.from?.name ?? null, nowIso());
    db.prepare(`INSERT INTO peers (device_id, name, last_exchange_at) VALUES (?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET name = excluded.name, last_exchange_at = excluded.last_exchange_at`)
      .run(p.from?.id || 'unknown', p.from?.name ?? null, nowIso());
  });
  run();
  return { already_imported: false, added_meals: addedMeals, added_dishes: addedDishes, from: p.from };
}

export function getPeers(db) {
  return db.prepare('SELECT * FROM peers ORDER BY last_exchange_at DESC').all();
}

// -------------------------------------------------------- backup / restore (W7)

// Full personal backup: includes PRIVATE check-ins (it stays with you; it is
// NOT a sync bundle). Format is identical on both builds.
export function exportBackup(db) {
  const tables = {};
  for (const t of ALL_TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: nowIso(), tables };
}

export function importBackup(db, { data }) {
  let backup = data;
  if (typeof backup === 'string') {
    try { backup = JSON.parse(backup); } catch { throw new Error('Not valid JSON'); }
  }
  if (!backup || backup.format !== BACKUP_FORMAT) throw new Error('Not a Vitals backup file');
  if (backup.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version ${backup.version}`);
  const run = db.transaction(() => {
    for (const t of ALL_TABLES) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of ALL_TABLES) {
      const rows = backup.tables?.[t] || [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
          .run(...keys.map((k) => row[k] ?? null));
      }
    }
  });
  run();
  return getState(db);
}

export function resetAll(db) {
  const run = db.transaction(() => {
    for (const t of ALL_TABLES) db.prepare(`DELETE FROM ${t}`).run();
    // meta was wiped too; the schema itself is still current, so restore the
    // version marker to keep migrate() happy on next boot.
    setMeta(db, 'schema_version', String(SCHEMA_VERSION));
  });
  run();
  return { ok: true };
}
