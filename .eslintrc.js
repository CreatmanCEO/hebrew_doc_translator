module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  ignorePatterns: [
    'node_modules/',
    'vitest.config.js',
    'playwright.config.js',
    'packages/client/**',
    'packages/api/uploads/**',
    'coverage/',
    'dist/',
    'build/',
    '**/__mocks__/**',
    // legacy code, будет удалён/переписан в P1
    'packages/api/src/services/**',
    'packages/api/src/documentProcessor.js',
    'packages/api/src/documentGenerator.js',
    'packages/api/src/middleware/**',
    'packages/api/src/models/**',
    'packages/api/src/api/health.js',
    'scripts/**',
    'tests/integration/**',
  ],
  rules: {
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
};
