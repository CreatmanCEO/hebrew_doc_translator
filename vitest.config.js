import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/api/**/*.{test,spec}.{js,jsx}',
      'packages/shared/**/*.{test,spec}.{js,jsx}',
      'tests/unit/**/*.{test,spec}.{js,jsx}',
    ],
    exclude: [
      '**/node_modules/**',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'tests/e2e',
      'tests/integration',
      // Pre-rewrite tests targeted code that is being deleted in P0 — see MIGRATION_PLAN §2.
      'tests/services/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.{test,spec}.{js,jsx}',
        '**/*.d.ts',
      ],
    },
    alias: {
      '@hdt/shared': path.resolve(__dirname, './packages/shared/src'),
      '@hdt/api': path.resolve(__dirname, './packages/api/src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
