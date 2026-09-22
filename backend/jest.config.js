/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // API/DB integration tests need a live Postgres - they run via
  // `npm run test:integration` (jest.integration.config.js) instead.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  verbose: true,
};
