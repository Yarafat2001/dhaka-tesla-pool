/**
 * Integration config: exercises the real Express app against a real Postgres,
 * so it is deliberately separate from the fast unit run (`npm test`).
 *
 * Point DATABASE_URL at an isolated schema before running - the suite refuses
 * to start otherwise, so it can never delete demo/seed data:
 *
 *   DATABASE_URL="postgresql://...?schema=test" npx prisma migrate deploy
 *   npm run test:integration
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.integration.test.ts'],
  // One shared database, real transactions and a concurrency test that fires
  // simultaneous requests: serial execution keeps the assertions meaningful.
  maxWorkers: 1,
  testTimeout: 30000,
  verbose: true,
};
