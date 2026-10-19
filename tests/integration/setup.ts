// Fail loudly instead of skipping: integration tests never run against an
// implicit database, and never silently pass without one.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("NOT EXECUTED: TEST_DATABASE_URL is not set. Run `npm run test:integration`.");
}
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  throw new Error("Refusing to run: DATABASE_URL must point at the test database (use `npm run test:integration`).");
}
