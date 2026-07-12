// Static server that simulates GitHub Pages for the standalone build:
// serves dist-standalone under the /vitals/ subpath and answers every
// unknown path with HTTP 404 + the contents of 404.html (Pages semantics).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-standalone');
const PREFIX = '/vitals/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createPagesServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const notFound = () => {
      const body = fs.readFileSync(path.join(DIST, '404.html'));
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    };
    if (!p.startsWith(PREFIX) && p !== PREFIX.slice(0, -1)) return notFound();
    if (p === PREFIX.slice(0, -1)) p = PREFIX;
    let rel = p.slice(PREFIX.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return notFound();
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4180);
  createPagesServer().listen(port, () => console.log(`Simulated Pages at http://localhost:${port}${PREFIX}`));
}
