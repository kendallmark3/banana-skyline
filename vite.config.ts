import { defineConfig } from 'vitest/config';

// base './' keeps the build portable: it works from any static path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
