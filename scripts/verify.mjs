// Full verification of the STANDALONE build in a real browser, served under a
// simulated GitHub Pages subpath (/vitals/ with 404-for-unknown-paths).
// Run: node scripts/verify.mjs   (add --skip-build to reuse dist-standalone)
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { createPagesServer } from './pages-server.mjs';
import { todayStr, addDays, b64urlDecode } from '../shared/normalize.js';

const PORT = 4181;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/vitals/`;
const today = todayStr();

let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${name} ${detail}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

if (!process.argv.includes('--skip-build')) {
  console.log('Building standalone target (VITE_BASE=/vitals/)…');
  execSync('npm run build:standalone', { stdio: 'inherit', env: { ...process.env, VITE_BASE: '/vitals/' } });
}

const server = createPagesServer();
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  .catch(() => chromium.launch());

const externalRequests = [];
function watchRequests(context) {
  context.on('request', (req) => {
    if (!new URL(req.url()).host.startsWith('localhost')) externalRequests.push(req.url());
  });
}

async function newAppContext(opts = {}) {
  const context = await browser.newContext(opts);
  watchRequests(context);
  const page = await context.newPage();
  return { context, page };
}

const rpcOn = (page) => (method, args = {}) =>
  page.evaluate(([m, a]) => window.__vitalsRpc(m, a), [method, args]);

// Force the debounced IndexedDB flush before a hard navigation.
const flush = (page) => page.evaluate(() => window.__vitalsFlush?.());

async function firstLaunch(page, deviceName, personName) {
  await page.waitForSelector('[data-testid="first-launch"]');
  await page.fill('[data-testid="device-name"]', deviceName);
  await page.fill('[data-testid="person-name"]', personName);
  await page.click('[data-testid="start-button"]');
  await page.waitForSelector('[data-testid="screen-today"]');
  await page.waitForTimeout(700); // let the debounced IndexedDB flush land before any hard navigation
}

const forbidden = /checkin|mood|energy|symptom/i;
function assertNoPrivateKeys(obj, path = '$') {
  if (Array.isArray(obj)) { obj.forEach((v, i) => assertNoPrivateKeys(v, `${path}[${i}]`)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (forbidden.test(k)) throw new Error(`private-looking key "${k}" at ${path}`);
      assertNoPrivateKeys(v, `${path}.${k}`);
    }
  }
}

try {
  // ============ Phone A: boot, seed, zero external requests ============
  console.log('\n[boot & seeding, zero external requests]');
  const A = await newAppContext();
  await A.page.goto(BASE);
  await firstLaunch(A.page, "Shen's phone", 'Shen');
  const rpcA = rpcOn(A.page);
  const stateA = await rpcA('getState');
  ok('device initialized with generated device_id', stateA.initialized && stateA.device_id?.startsWith('dev-'));
  const seededDishes = await rpcA('listDishes');
  ok('seed dishes present (3)', seededDishes.length === 3);
  const seededSymptoms = await rpcA('listSymptoms');
  ok('seed symptom tags present (10)', seededSymptoms.length === 10);
  const dayEmpty = await rpcA('getDay', { date: today });
  ok('no seeded meals or check-ins', dayEmpty.meals.length === 0 && !dayEmpty.checkin);
  ok('zero requests left localhost during boot', externalRequests.length === 0, externalRequests.join(','));

  // ============ Acceptance 1: the two-tap flow ============
  console.log('\n[acceptance 1: two-tap flow]');
  await A.page.getByTestId('dish-picker').getByRole('button', { name: 'Dal with rice' }).click();
  await A.page.waitForSelector('[data-testid="dinner-logged"]');
  await A.page.click('[data-testid="mood-4"]');
  await A.page.getByTestId('checkin-form').getByRole('button', { name: 'Headache', exact: true }).click();
  await A.page.fill('[data-testid="checkin-form"] textarea', 'my private note');
  await A.page.click('[data-testid="save-checkin"]');
  await A.page.waitForFunction(() => document.querySelector('[data-testid="save-checkin"]')?.textContent.includes('Saved'));
  const day1 = await rpcA('getDay', { date: today });
  ok('meal event row exists', day1.meals.length === 1 && day1.meals[0].event_id.includes('-'));
  ok('private check-in row exists', day1.checkin?.mood === 4 && day1.checkin.symptoms.includes('Headache'));
  ok('Today screen reflects the dinner', await A.page.locator('[data-testid="dinner-logged"]').textContent().then((t) => t.includes('Dal with rice')));
  ok('Today screen reflects the check-in', await A.page.locator('[data-testid="save-checkin"]').textContent().then((t) => t.includes('Saved') || t.includes('Update')));

  // ============ persistence across a full reload (IndexedDB) ============
  console.log('\n[persistence across reload]');
  await A.page.waitForTimeout(900); // let the debounced IndexedDB flush run
  await A.page.reload();
  await A.page.waitForSelector('[data-testid="screen-today"]');
  const day1b = await rpcA('getDay', { date: today });
  ok('data persisted after full reload', day1b.meals.length === 1 && day1b.checkin?.mood === 4);
  ok('reloaded dinner visible in UI', await A.page.locator('[data-testid="dinner-logged"]').textContent().then((t) => t.includes('Dal with rice')));

  // ============ Acceptance 2 + 3 setup: more shared data on A ============
  const chili = await rpcA('createDish', { name: 'Chili night', ingredients: ['chili', 'tomato'] });
  for (const off of [3, 8, 13, 18]) {
    await rpcA('logMeal', { date: addDays(today, -off), dish_id: chili.dish_id });
    await rpcA('saveCheckin', { date: addDays(today, -off), mood: 2, energy: 2, symptoms: ['Headache'], note: 'secret feelings' });
  }

  // ============ Acceptance 2: PRIVACY — bundle carries no check-in data ============
  console.log('\n[acceptance 2: privacy of the sync bundle]');
  const bundle = await rpcA('createBundle', { today });
  const payload = JSON.parse(b64urlDecode(bundle.token.slice('VITL1:'.length)));
  ok('payload has exactly the allowed top-level keys',
    JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(['bundle_id', 'dish_ingredients', 'dishes', 'from', 'meals', 'sent_at', 'v']));
  assertNoPrivateKeys(payload);
  ok('no check-in-shaped keys anywhere in the payload', true);
  const payloadText = JSON.stringify(payload);
  for (const secret of ['my private note', 'secret feelings', 'Headache']) {
    ok(`payload does not contain "${secret}"`, !payloadText.includes(secret));
  }
  ok('payload contains the 5 dinners', payload.meals.length === 5);
  ok('payload dishes are only those referenced by meals', payload.dishes.length === 2);

  // Phone B: import the bundle, assert no check-ins appear
  const B = await newAppContext();
  await B.page.goto(BASE);
  await firstLaunch(B.page, "Ana's phone", 'Ana');
  const rpcB = rpcOn(B.page);
  await B.page.goto(`${BASE}import`);
  await B.page.fill('[data-testid="sync-input"]', bundle.text);
  await B.page.click('[data-testid="preview-bundle"]');
  await B.page.waitForSelector('[data-testid="bundle-preview"]');
  ok('import preview shows "From Shen: 5 dinners"', await B.page.locator('[data-testid="bundle-preview"]').textContent().then((t) => t.includes('From Shen') && t.includes('5 dinners')));
  await B.page.click('[data-testid="apply-bundle"]');
  await B.page.waitForSelector('[data-testid="apply-result"]');
  const backupB = await rpcB('exportBackup');
  ok('NO check-in rows created on B by the import', backupB.tables.checkins.length === 0 && backupB.tables.checkin_symptoms.length === 0);

  // ============ Acceptance 3: two-phone convergence ============
  console.log('\n[acceptance 3: two-phone convergence]');
  const backupA = await rpcA('exportBackup');
  const dishKey = (tables) => tables.dishes.map((d) => d.name.toLowerCase()).sort().join('|');
  const mealKey = (tables) => tables.meals.map((m) => `${m.event_id}:${m.date}`).sort().join('|');
  const ingKey = (tables) => {
    const nameById = Object.fromEntries(tables.dishes.map((d) => [d.dish_id, d.name.toLowerCase()]));
    return tables.dish_ingredients.map((i) => `${nameById[i.dish_id]}>${i.normalized_name}`).sort().join('|');
  };
  ok('identical dishes on both phones', dishKey(backupA.tables) === dishKey(backupB.tables));
  ok('identical meals on both phones', mealKey(backupA.tables) === mealKey(backupB.tables));
  ok('identical dish ingredients on both phones', ingKey(backupA.tables) === ingKey(backupB.tables));
  await B.page.fill('[data-testid="sync-input"]', bundle.text);
  await B.page.click('[data-testid="apply-bundle"]');
  await B.page.waitForFunction(() => document.querySelector('[data-testid="apply-result"]')?.textContent.includes('already imported'));
  const backupB2 = await rpcB('exportBackup');
  ok('re-import of a known bundle changes nothing',
    mealKey(backupB2.tables) === mealKey(backupB.tables) && dishKey(backupB2.tables) === dishKey(backupB.tables));
  const peersB = await rpcB('getPeers');
  ok('drift indicator peer recorded on B', peersB.length === 1 && peersB[0].name === 'Shen');

  // ============ Acceptance 4: insight determinism (fresh context D) ============
  console.log('\n[acceptance 4: insight determinism]');
  const D = await newAppContext();
  await D.page.goto(BASE);
  await firstLaunch(D.page, 'Fixture phone', 'Fix');
  const rpcD = rpcOn(D.page);
  const chiliD = await rpcD('createDish', { name: 'Chili night', ingredients: ['chili'] });
  const riceD = await rpcD('createDish', { name: 'Plain rice', ingredients: ['rice'] });
  // chili dinner ON each Headache day; dinners >= 3 days apart so each covers
  // exactly 3 window days -> baseline 12/56, with-symptom rate 4/4.
  for (const off of [3, 8, 13, 18]) {
    await rpcD('logMeal', { date: addDays(today, -off), dish_id: chiliD.dish_id });
    await rpcD('saveCheckin', { date: addDays(today, -off), mood: 2, symptoms: ['Headache'] });
  }
  for (const off of [1, 2]) await rpcD('logMeal', { date: addDays(today, -off), dish_id: riceD.dish_id });
  // a symptom below MIN_SYMPTOM_OCCURRENCES
  await rpcD('saveCheckin', { date: addDays(today, -1), mood: 3, symptoms: ['Fatigue'] });
  await rpcD('saveCheckin', { date: addDays(today, -2), mood: 3, symptoms: ['Fatigue'] });

  const ins = await rpcD('getInsights', { today });
  const head = ins.cooccurrence.find((c) => c.tag === 'Headache');
  ok('Headache is ranked (4 occurrences)', head.ranked && head.occurrences === 4);
  const top = head.ingredients[0];
  ok('chili ranks top', top.ingredient === 'chili');
  ok('with-symptom rate is 4/4 = 1.0', top.symptom_days_with === 4 && top.symptom_days_total === 4 && top.with_rate === 1);
  ok('baseline rate is 12/56', top.baseline_days_with === 12 && top.window_days === 56 && Math.abs(top.baseline_rate - 12 / 56) < 1e-9);
  const fat = ins.cooccurrence.find((c) => c.tag === 'Fatigue');
  ok('Fatigue ranking suppressed below threshold', fat.occurrences === 2 && !fat.ranked);

  await flush(D.page);
  await D.page.goto(`${BASE}insights`);
  await D.page.waitForSelector('[data-testid="symptom-Headache"]');
  ok('insights banner is present', await D.page.locator('[data-testid="hypothesis-banner"]').count() === 1);
  const headText = await D.page.locator('[data-testid="symptom-Headache"]').textContent();
  ok('UI shows sample size n=4', headText.includes('n = 4'));
  ok('UI shows chili with 4/4 vs 12/56', headText.includes('chili') && headText.includes('4/4') && headText.includes('12/56'));
  const fatText = await D.page.locator('[data-testid="symptom-Fatigue"]').textContent();
  ok('UI shows "not enough data" note for Fatigue', fatText.includes('not enough data'));

  // ============ Acceptance 5: basket composition ============
  console.log('\n[acceptance 5: basket composition]');
  const fixture = {
    format: 'restock_purchases',
    purchases: [
      { date: addDays(today, -2), item_name: 'Carrots', item_category: 'Vegetables', qty: 1, price_cents: 120 },
      { date: addDays(today, -2), item_name: 'Spinach', item_category: 'Vegetables', qty: 1, price_cents: 200 },
      { date: addDays(today, -3), item_name: 'Apples', item_category: 'Fruit', qty: 6, price_cents: 340 },
      { date: addDays(today, -9), item_name: 'Bananas', item_category: 'Fruit', qty: 5, price_cents: 150 },
      { date: addDays(today, -3), item_name: 'Crisps', item_category: 'Snacks', qty: 2, price_cents: 300 },
      { date: addDays(today, -9), item_name: 'Cola', item_category: 'Drinks', qty: 1, price_cents: 220 },
      { date: addDays(today, -9), item_name: 'Biscuits', item_category: 'Snacks', qty: 1, price_cents: 180 },
      { date: addDays(today, -2), item_name: 'Bread', item_category: 'Bakery', qty: 1, price_cents: 250 },
      { date: addDays(today, -3), item_name: 'Milk', item_category: 'Dairy', qty: 2, price_cents: 190 },
      { date: addDays(today, -9), item_name: 'Rice', item_category: 'Staples', qty: 1, price_cents: 400 },
    ],
  };
  await D.page.goto(`${BASE}import`);
  await D.page.fill('[data-testid="grocery-input"]', JSON.stringify(fixture));
  await D.page.click('[data-testid="import-grocery"]');
  await D.page.waitForSelector('[data-testid="grocery-result"]');
  ok('grocery import via UI added 10 rows', await D.page.locator('[data-testid="grocery-result"]').textContent().then((t) => t.includes('Added 10')));
  const ins2 = await rpcD('getInsights', { today });
  ok('basket by count = 4 healthy / 3 watch / 3 rest',
    ins2.basket.by_count.healthy === 4 && ins2.basket.by_count.watch === 3 && ins2.basket.by_count.rest === 3);
  ok('basket by spend matches fixture (810/700/840)',
    ins2.basket.by_spend.healthy === 810 && ins2.basket.by_spend.watch === 700 && ins2.basket.by_spend.rest === 840);
  await flush(D.page);
  await D.page.goto(`${BASE}insights`);
  await D.page.waitForSelector('[data-testid="basket-composition"]');
  const basketText = await D.page.locator('[data-testid="basket-count-shares"]').textContent();
  ok('UI shows veg/fruit 40% and watch 30%', basketText.includes('40%') && basketText.includes('30%'));
  const dup = await rpcD('importGrocery', { payload: fixture });
  ok('re-importing overlapping range adds nothing', dup.added === 0 && dup.skipped === 10);

  // ============ Acceptance 6: share target route ============
  console.log('\n[acceptance 6: share target]');
  await flush(A.page);
  await A.page.goto(`${BASE}import?text=${encodeURIComponent(bundle.text)}`);
  await A.page.waitForSelector('[data-testid="bundle-preview"]');
  ok('share-target route opens Import preview populated',
    await A.page.locator('[data-testid="bundle-preview"]').textContent().then((t) => t.includes('From Shen') && t.includes('5 dinners')));

  // ============ deep links BEFORE any service worker (404.html path) ============
  console.log('\n[deep links before service worker]');
  const C = await browser.newContext({ serviceWorkers: 'block' });
  watchRequests(C);
  const cPage = await C.newPage();
  const resp = await cPage.goto(`${BASE}insights`);
  ok('unknown deep path served as HTTP 404 (Pages semantics)', resp.status() === 404);
  await cPage.waitForSelector('[data-testid="first-launch"]');
  ok('app boots from 404.html on a first-visit deep link', true);
  await C.close();

  // ============ service worker + full offline operation ============
  console.log('\n[service worker & offline]');
  await A.page.goto(BASE);
  await A.page.waitForSelector('[data-testid="screen-today"]');
  await A.page.waitForFunction(() => navigator.serviceWorker?.getRegistration().then((r) => !!r?.active), null, { timeout: 20000 });
  ok('service worker registered and active', true);
  await A.page.waitForTimeout(500);
  await A.context.setOffline(true);
  await A.page.goto(`${BASE}history`); // offline deep link -> SW navigateFallback
  await A.page.waitForSelector('[data-testid="screen-history"]');
  ok('offline deep link renders via SW fallback', true);
  const offlineDay = await rpcA('getDay', { date: today });
  ok('data readable offline from the on-device engine', offlineDay.meals.length === 1);

  // every screen renders from the on-device engine (still offline)
  for (const [path, sel] of [
    ['', 'screen-today'], ['history', 'screen-history'], ['dishes', 'screen-dishes'],
    ['insights', 'screen-insights'], ['import', 'screen-import'], ['settings', 'screen-settings'],
  ]) {
    await A.page.goto(`${BASE}${path}`);
    await A.page.waitForSelector(`[data-testid="${sel}"]`);
  }
  await A.page.goto(`${BASE}dishes`);
  await A.page.getByRole('link', { name: /Dal with rice/ }).click();
  await A.page.waitForSelector('[data-testid="screen-dish-detail"]');
  ok('every screen (incl. dish detail) renders offline', true);
  await A.context.setOffline(false);

  ok('still zero external requests across the whole run', externalRequests.length === 0, externalRequests.join(','));

  console.log(`\nALL STANDALONE CHECKS PASSED (${passed} assertions)`);
} finally {
  await browser.close();
  server.close();
}
