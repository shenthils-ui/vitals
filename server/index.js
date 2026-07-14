// Vitals local server: Express + better-sqlite3, serving the built frontend
// and exposing all app logic through a single RPC endpoint. Listens on
// 0.0.0.0 so phones on the same Wi-Fi can reach it.
import express from 'express';
import Database from 'better-sqlite3';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../shared/schema.js';
import { call } from '../shared/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.VITALS_DATA_DIR || path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist-server');
const PORT = Number(process.env.PORT || 8787);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'vitals.db'));
db.pragma('journal_mode = WAL');
migrate(db);

const app = express();
app.use(express.json({ limit: '25mb' }));
// Malformed JSON should come back as a normal RPC error envelope, not an HTML
// error page the client would misread as "server unreachable".
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ ok: false, error: 'Invalid request body' });
  }
  next(err);
});

app.post('/api/rpc', (req, res) => {
  const { method, args } = req.body || {};
  try {
    const result = call(db, method, args || {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback for deep links
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (_req, res) => res
    .status(503)
    .send('Frontend not built yet. Run: npm run build'));
}

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Vitals is running.');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const a of lanAddresses()) {
    console.log(`  On your Wi-Fi:     http://${a}:${PORT}   (open this on a phone)`);
  }
  console.log('');
});
