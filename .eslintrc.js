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
      allowModules: ['bull', '@azure/ai-translator', 'pdf.js-extract', 'mammoth'],
      tryExtensions: ['.js', '.json', '.node']
    }],
    'node/no-extraneous-require': ['error', {
      allowModules: ['axios', 'file-type']
    }],
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
};