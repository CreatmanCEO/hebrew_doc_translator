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
      allowModules: ['bull', 'pdf.js-extract', 'mammoth', 'hebrew-transliteration', 'openai'],
      tryExtensions: ['.js', '.json', '.node']
    }],
    'node/no-extraneous-require': ['error', {
      allowModules: ['axios', 'file-type', 'hebrew-transliteration', 'openai']
    }],
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
};