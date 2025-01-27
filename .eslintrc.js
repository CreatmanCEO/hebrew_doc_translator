module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'node/no-missing-require': ['error', {
      allowModules: ['bull', 'pdf.js-extract', 'mammoth'],
      tryExtensions: ['.js', '.json', '.node']
    }],
    'node/no-extraneous-require': ['error', {
      allowModules: ['mime-types']
    }],
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
  overrides: [
    {
      // Тестовые файлы
      files: [
        'tests/**/*.js',
        'test/**/*.js',
        '**/*.test.js',
        '**/*.spec.js',
        'tests/setup.js'
      ],
      rules: {
        'node/no-unpublished-require': 'off',
        'node/no-unpublished-import': 'off'
      },
      env: {
        jest: true,
        mocha: true,
      },
    },
    {
      // Конфигурационные файлы
      files: [
        '*.config.js',
        '.eslintrc.js',
        'vitest.*.js',
        'playwright.*.js'
      ],
      rules: {
        'node/no-unpublished-import': 'off',
        'node/no-unpublished-require': 'off',
        'node/no-unsupported-features/es-syntax': 'off',
        'node/no-missing-import': 'off'
      },
      parserOptions: {
        sourceType: 'module'
      }
    }
  ]
};