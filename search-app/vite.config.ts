import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Dev-server-only (never touches `vite build`/production, where Vercel serves api/*.ts as real
    // Functions per vercel.json). `vercel dev` is the "correct" local emulator and was tried first,
    // but its own Vite integration chokes on this project's index.html unrelated to anything here --
    // see scripts/dev-api-server.mjs's own comment for the full story. Run that script alongside
    // `npm run dev` (`npm run dev:api`) to exercise api/consultant.ts locally through this proxy.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // The entry otherwise bundles React and the whole Coveo commerce engine into one ~870 kB
        // file. Splitting the vendors lets the browser fetch them in parallel and keeps them
        // cached across app-code-only deploys; @coveo/headless (the content-search build, used
        // only by lazy routes) is left to Rollup so it stays out of the entry request entirely.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-coveo-commerce': ['@coveo/headless/commerce'],
        },
      },
    },
  },
});
