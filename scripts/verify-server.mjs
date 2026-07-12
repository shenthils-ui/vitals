// End-to-end verification of the SERVER build: builds the frontend, starts the
// Express + better-sqlite3 server, exercises the RPC API directly, drives the
// UI in a real browser against it, and proves export -> import round-trips.
// Run: node scripts/verify-server.mjs   (--skip-build to reuse dist-server)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { todayStr } from '../shared/normalize.js';

const PORT_A = 8791;
const PORT_B = 8792;
const today = todayStr();

let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${name} ${detail}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

if (!process.argv.includes('--skip-build')) {
  console.log('Building server target…');
  execSync('npm run build', { stdio: 'inherit' });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-verify-'));
const servers = [];
function startServer(port, dataDir) {
  const proc = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(port), VITALS_DATA_DIR: dataDir },
    stdio: 'pipe',
  });
  servers.push(proc);
  return proc;
}

async function waitHealthy(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server on ${port} never became healthy`);
}

async function rpcHttp(port, method, args = {}) {
  const res = await fetch(`http://localhost:${port}/api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.error}`);
  return data.result;
}

startServer(PORT_A, path.join(tmp, 'a'));
await waitHealthy(PORT_A);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  .catch(() => chromium.launch());

try {
  console.log('\n[RPC API]');
  const state0 = await rpcHttp(PORT_A, 'getState');
  ok('RPC responds; fresh db uninitialized', state0.initialized === false);

  console.log('\n[UI against the server]');
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT_A}/`);
  await page.waitForSelector('[data-testid="first-launch"]');
  await page.fill('[data-testid="device-name"]', 'Laptop');
  await page.fill('[data-testid="person-name"]', 'Shen');
  await page.click('[data-testid="start-button"]');
  await page.waitForSelector('[data-testid="screen-today"]');
  ok('first launch through the UI works', true);

  await page.getByTestId('dish-picker').getByRole('button', { name: 'Omelette' }).click();
  await page.waitForSelector('[data-testid="dinner-logged"]');
  await page.click('[data-testid="mood-5"]');
  await page.click('[data-testid="save-checkin"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="save-checkin"]')?.textContent.includes('Saved'));
  const day = await rpcHttp(PORT_A, 'getDay', { date: today });
  ok('UI writes landed in the server database', day.meals.length === 1 && day.checkin?.mood === 5);

  // deep link served by the Express SPA fallback
  const resp = await page.goto(`http://localhost:${PORT_A}/insights`);
  ok('server SPA fallback serves deep links', resp.status() === 200);
  await page.waitForSelector('[data-testid="hypothesis-banner"]');
  ok('insights renders against the server (with banner)', true);
  for (const [p, sel] of [['history', 'screen-history'], ['dishes', 'screen-dishes'], ['import', 'screen-import'], ['settings', 'screen-settings']]) {
    await page.goto(`http://localhost:${PORT_A}/${p}`);
    await page.waitForSelector(`[data-testid="${sel}"]`);
  }
  ok('every screen renders against the server', true);

  console.log('\n[export -> import round-trip]');
  const backup = await rpcHttp(PORT_A, 'exportBackup');
  ok('backup includes private check-ins (personal backup, not a sync bundle)', backup.tables.checkins.length === 1);

  startServer(PORT_B, path.join(tmp, 'b'));
  await waitHealthy(PORT_B);
  await rpcHttp(PORT_B, 'importBackup', { data: backup });
  const stateB = await rpcHttp(PORT_B, 'getState');
  const dayB = await rpcHttp(PORT_B, 'getDay', { date: today });
  ok('backup restores identically on a second server', stateB.person_name === 'Shen' && dayB.meals.length === 1 && dayB.checkin?.mood === 5);
  const backupB = await rpcHttp(PORT_B, 'exportBackup');
  ok('round-tripped tables are identical',
    JSON.stringify(backup.tables) === JSON.stringify(backupB.tables));

  // the same backup format works across builds (standalone uses identical code
  // via shared/, proven by scripts/smoke.mjs cross-engine round-trip)
  console.log(`\nALL SERVER CHECKS PASSED (${passed} assertions)`);
} finally {
  await browser.close();
  for (const s of servers) s.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
