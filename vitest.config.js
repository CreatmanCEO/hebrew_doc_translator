import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.js'],
      exclude: [
        'node_modules',
        'test',
        '**/*.test.js',
        '**/*.config.js'
      ]
    },
    setupFiles: ['./tests/setup.js']
  },
});