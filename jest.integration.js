module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  moduleNameMapper: {
    '^@hdt/shared$': '<rootDir>/packages/shared/src',
    '^@hdt/api/(.*)$': '<rootDir>/packages/api/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  testTimeout: 30000,
  verbose: true,
  passWithNoTests: true,
  collectCoverage: false,
  collectCoverageFrom: [
    'packages/api/src/**/*.js',
    '!packages/api/src/**/*.test.js',
    '!packages/api/src/config/**',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'html', 'lcov'],
};
