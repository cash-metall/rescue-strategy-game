import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // GitHub Actions подставляет VITE_BASE=/rescue-strategy-game/
  // Локально и на nginx — base '/' (корень домена)
  base: process.env.VITE_BASE ?? '/',
  plugins: [svelte()],
  test: {
    // Движок (src/engine) — чистый TS, тестируется в node без DOM.
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
});
