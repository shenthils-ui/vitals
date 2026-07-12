// Generates the PWA PNG icons (192, 512, maskable) by rendering an inline
// SVG in headless Chromium. Re-run if you change the artwork.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function svg(size, padded) {
  // padded=true keeps the leaf inside the maskable safe zone (inner 80%)
  const s = padded ? 0.62 : 0.82;
  return `<!doctype html><html><body style="margin:0">
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0d9488"/><stop offset="1" stop-color="#115e59"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="${padded ? 0 : 22}" fill="url(#bg)"/>
    <g transform="translate(50 54) scale(${s}) translate(-50 -50)">
      <path d="M50 88 C22 70 14 48 20 30 C36 26 52 34 50 60 C54 38 68 28 82 32 C84 52 74 74 50 88 Z"
            fill="#f0fdfa" opacity="0.96"/>
      <path d="M50 86 C46 66 44 50 34 38" stroke="#0f766e" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <polyline points="28,56 40,56 45,44 52,66 57,52 70,52" fill="none" stroke="#0f766e"
                stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    </g>
  </svg></body></html>`;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  .catch(() => chromium.launch());
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, padded] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size, padded));
  await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
