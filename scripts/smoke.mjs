// Quick parity check: run the same scenario through better-sqlite3 and the
// sql.js shim and compare results. Not the full verification (see verify.mjs);
// this catches shared-layer regressions in seconds.
import Database from 'better-sqlite3';
import initSqlJs from 'sql.js';
import { migrate } from '../shared/schema.js';
import { wrapSqlJs } from '../shared/sqljs-shim.js';
import { call } from '../shared/api.js';
import { todayStr, addDays } from '../shared/normalize.js';

const today = todayStr();

async function makeEngines() {
  const native = new Database(':memory:');
  migrate(native);
  const SQL = await initSqlJs();
  const wasm = wrapSqlJs(new SQL.Database());
  migrate(wasm);
  return { native, wasm };
}

function scenario(db, label) {
  call(db, 'setup', { device_name: 'Laptop', person_name: 'Shen' });
  const state = call(db, 'getState');
  if (!state.initialized) throw new Error('not initialized');

  const dishes = call(db, 'listDishes');
  if (dishes.length !== 3) throw new Error(`expected 3 seed dishes, got ${dishes.length}`);
  const dal = dishes.find((d) => d.name === 'Dal with rice');
  if (dal.ingredients.length !== 4) throw new Error('seed ingredients missing');

  const dish = call(db, 'createDish', { name: 'Chili night', ingredients: ['chili', 'Tomato ', 'onion'] });
  if (dish.ingredients.map((i) => i.normalized_name).join(',') !== 'chili,tomato,onion') {
    throw new Error('normalization failed: ' + JSON.stringify(dish.ingredients));
  }

  call(db, 'logMeal', { date: today, dish_id: dish.dish_id });
  call(db, 'saveCheckin', { date: today, mood: 4, energy: 3, symptoms: ['Headache', 'New tag'], note: 'private note' });
  const day = call(db, 'getDay', { date: today });
  if (day.meals.length !== 1 || day.checkin.mood !== 4 || day.checkin.symptoms.length !== 2) {
    throw new Error('getDay mismatch: ' + JSON.stringify(day));
  }

  // insights fixture: chili precedes Headache
  for (let i = 0; i < 4; i++) {
    const d = addDays(today, -(i * 5 + 3));
    call(db, 'logMeal', { date: d, dish_id: dish.dish_id });
    call(db, 'saveCheckin', { date: d, mood: 2, symptoms: ['Headache'] });
  }
  const ins = call(db, 'getInsights', { today });
  const head = ins.cooccurrence.find((c) => c.tag === 'Headache');
  if (!head || head.occurrences !== 5 || !head.ranked) throw new Error('cooccurrence missing: ' + JSON.stringify(ins.cooccurrence));
  if (head.ingredients[0].with_rate !== 1) throw new Error('expected top with_rate 1: ' + JSON.stringify(head.ingredients[0]));

  // grocery
  const g = call(db, 'importGrocery', { payload: { format: 'restock_purchases', purchases: [
    { date: today, item_name: 'Apples', item_category: 'Fruit', qty: 1, price_cents: 300 },
    { date: today, item_name: 'Cola', item_category: 'Drinks', qty: 2, price_cents: 250 },
    { date: today, item_name: 'Bread', item_category: 'Bakery', qty: 1 },
  ] } });
  if (g.added !== 3) throw new Error('grocery add failed');
  const g2 = call(db, 'importGrocery', { payload: { purchases: [{ date: today, item_name: 'Apples', item_category: 'Fruit', qty: 1, price_cents: 300 }] } });
  if (g2.added !== 0) throw new Error('grocery dedup failed');
  const ins2 = call(db, 'getInsights', { today });
  if (ins2.basket.by_count.healthy !== 1 || ins2.basket.by_count.watch !== 1 || ins2.basket.by_count.rest !== 1) {
    throw new Error('basket mismatch: ' + JSON.stringify(ins2.basket.by_count));
  }

  // bundle: must contain only shared data
  const bundle = call(db, 'createBundle', { today });
  const raw = JSON.parse(Buffer.from(bundle.token.slice('VITL1:'.length).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const txt = JSON.stringify(raw);
  for (const bad of ['mood', 'checkin', 'symptom', 'energy', 'private note', 'Headache', 'New tag']) {
    if (txt.includes(bad)) throw new Error(`PRIVACY LEAK: bundle contains "${bad}"`);
  }
  if (raw.meals.length !== 5) throw new Error('bundle meal count ' + raw.meals.length);

  // backup round-trip
  const backup = call(db, 'exportBackup');
  if (!backup.tables.checkins.length) throw new Error('backup should include checkins');
  return { bundleText: bundle.text, backup };
}

const { native, wasm } = await makeEngines();
const a = scenario(native, 'native');
const b = scenario(wasm, 'wasm');

// cross-engine sync: import native's bundle into wasm side (second device)
const before = call(wasm, 'exportBackup');
const res = call(wasm, 'previewBundle', { text: a.bundleText });
if (res.meals !== 5) throw new Error('preview mismatch');
const applied = call(wasm, 'applyBundle', { text: a.bundleText });
if (applied.added_meals < 1) throw new Error('apply added nothing');
const again = call(wasm, 'applyBundle', { text: a.bundleText });
if (!again.already_imported) throw new Error('idempotency failed');
const after = call(wasm, 'exportBackup');
if (JSON.stringify(after.tables.checkins) !== JSON.stringify(before.tables.checkins)) {
  throw new Error('PRIVACY: applying a bundle changed checkins');
}

// backup import round-trip on wasm
call(wasm, 'importBackup', { data: JSON.stringify(a.backup) });
const restored = call(wasm, 'exportBackup');
if (JSON.stringify(restored.tables.meals) !== JSON.stringify(a.backup.tables.meals)) {
  throw new Error('backup round-trip mismatch');
}

console.log('SMOKE OK: both engines pass the shared-logic scenario');
