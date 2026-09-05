module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'repositories/**/*.js'
  ]
};
