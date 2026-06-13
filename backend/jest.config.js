/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  // dotenv loads backend/.env (DATABASE_URL/JWT_SECRET/...); the setup file
  // then silences logging for clean test output. Order matters.
  setupFiles: ['dotenv/config', '<rootDir>/jest.setup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
};
