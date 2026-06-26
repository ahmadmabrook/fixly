/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
    env: {
      // Mapbox tests need hasMapbox=true. The real token is a build-time secret
      // (VITE_MAPBOX_TOKEN); in test/CI we use a dummy pk.* so the guard passes.
      VITE_MAPBOX_TOKEN: process.env.VITE_MAPBOX_TOKEN || 'pk.test_dummy_token',
    },
  },
});
