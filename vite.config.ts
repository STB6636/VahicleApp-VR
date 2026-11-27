import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCloudflarePages = process.env.CF_PAGES === '1';
const isBrowserRouterBuild =
  isCloudflarePages || String(process.env.VITE_ROUTER_MODE || '').trim().toLowerCase() === 'browser';

/**
 * Cloudflare Pages disables automatic SPA fallback (`index.html`) when a root `404.html`
 * exists in `dist/`. Strip `dist/404.html` for Cloudflare Pages / BrowserRouter builds
 * while keeping it for GitHub Pages HashRouter builds.
 */
function strip404ForCloudflareSpa() {
  return {
    name: 'strip-404-for-cloudflare-spa',
    closeBundle() {
      if (!isBrowserRouterBuild) return;
      const out404 = path.resolve(__dirname, 'dist', '404.html');
      if (fs.existsSync(out404)) {
        fs.unlinkSync(out404);
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || (isCloudflarePages ? '/' : './'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any, tailwindcss() as any, strip404ForCloudflareSpa() as any],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-tanstack';
          }
          if (id.includes('node_modules/sweetalert2')) {
            return 'vendor-swal';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5174/',
      },
    },
    globals: true,
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
});
