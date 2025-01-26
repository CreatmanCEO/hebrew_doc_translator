module.exports = {
  root: true,
  env: {
    node: true,
    es2024: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module'
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'node/no-unsupported-features/es-syntax': [
      'error',
      { version: '>=18.0.0', ignores: ['modules'] }
    ],
    'node/no-missing-import': 'off',
    'node/no-unpublished-import': 'off'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      }
    }
  ]
}