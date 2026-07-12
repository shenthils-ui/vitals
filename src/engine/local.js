// Standalone engine: sql.js (SQLite as WebAssembly) running entirely in the
// browser, persisted to IndexedDB — debounced after writes and flushed on
// visibilitychange/pagehide. All data lives on this device.
import { migrate } from '../../shared/schema.js';
import { wrapSqlJs } from '../../shared/sqljs-shim.js';
import { call } from '../../shared/api.js';

const IDB_NAME = 'vitals-db';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main';
const PERSIST_DEBOUNCE_MS = 400;

let dbPromise = null;
let rawDb = null;
let persistTimer = null;
let dirty = false;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbLoad() {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(bytes) {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushNow() {
  if (!dirty || !rawDb) return;
  dirty = false;
  await idbSave(rawDb.export());
}

function schedulePersist() {
  dirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { flushNow().catch(console.error); }, PERSIST_DEBOUNCE_MS);
}

async function init() {
  // Dynamic imports keep sql.js and its wasm out of the server build.
  const [{ default: initSqlJs }, wasmMod] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmMod.default });
  const saved = await idbLoad();
  rawDb = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
  const db = wrapSqlJs(rawDb, schedulePersist);
  migrate(db);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow().catch(console.error);
  });
  window.addEventListener('pagehide', () => { flushNow().catch(console.error); });
  return db;
}

export async function localCall(method, args = {}) {
  if (!dbPromise) dbPromise = init();
  const db = await dbPromise;
  return call(db, method, args);
}

// Deterministic persistence hook for the verification scripts.
if (typeof window !== 'undefined') window.__vitalsFlush = flushNow;
