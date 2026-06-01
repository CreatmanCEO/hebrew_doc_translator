import { defineConfig } from 'vitest/config';

// Server-side test config (Node environment). Kept separate from the root
// vitest.config.js (jsdom + React, for the client) so server unit/integration
// tests run without the React plugin or a browser DOM.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.{test,spec}.{js,mjs}'],
    exclude: ['node_modules', 'dist', 'tests/e2e', 'tests/integration'],
  },
});
