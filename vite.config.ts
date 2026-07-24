import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: '/rescue-strategy-game/',
  plugins: [svelte()],
  test: {
    // Движок (src/engine) — чистый TS, тестируется в node без DOM.
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
});
