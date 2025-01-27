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
      files: ['tests/**/*.js', 'test/**/*.js', '**/*.test.js', '**/*.spec.js'],
      rules: {
        'node/no-unpublished-require': 'off',
      },
      env: {
        jest: true,
        mocha: true,
      },
    },
  ],
};