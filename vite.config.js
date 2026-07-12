import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

// Two build targets from one codebase:
//   vite build                    -> dist-server     (talks to the Express RPC)
//   vite build --mode standalone  -> dist-standalone (sql.js in the browser, PWA)
// VITE_BASE lets the Pages workflow set the /<repo-name>/ subpath.
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  const base = process.env.VITE_BASE || '/';
  const outDir = standalone ? 'dist-standalone' : 'dist-server';

  const plugins = [react(), tailwindcss()];
  if (standalone) {
    plugins.push(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        name: 'Vitals',
        short_name: 'Vitals',
        description: 'Household health tracking — private, offline, on this device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android share target: shared text (a WhatsApp-forwarded sync bundle)
        // lands on the Import screen.
        share_target: {
          action: `${base}import`,
          method: 'GET',
          params: { text: 'text' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,ico,webmanifest}'],
        // the sql.js wasm is ~1.2 MB; make sure it is precached for offline
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }));
    plugins.push({
      // GitHub Pages serves 404.html for unknown paths; a copy of index.html
      // makes deep links work on a first visit, before any service worker.
      name: 'spa-404-fallback',
      closeBundle() {
        const idx = path.resolve(outDir, 'index.html');
        if (fs.existsSync(idx)) fs.copyFileSync(idx, path.resolve(outDir, '404.html'));
      },
    });
  }

  return {
    base,
    plugins,
    define: {
      // Statically defined so the dead branch (and sql.js/wasm with it) is
      // tree-shaken out of the server build.
      'import.meta.env.VITE_STANDALONE': JSON.stringify(standalone),
    },
    build: { outDir, emptyOutDir: true },
    // dev convenience: `npm run dev` + `npm run server` side by side
    server: { proxy: { '/api': 'http://localhost:8787' } },
  };
});
