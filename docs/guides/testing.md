# Testing

- Test runner: Vitest.
- `core` tests run against a real MongoDB (the docker compose replica set), not mocks. Start it first with `pnpm dev:db`. Each test file creates and drops its own database. Override the connection with `MONGODB_URI` (default `mongodb://localhost:27018/?replicaSet=rs0&directConnection=true`).
- `api` tests call the Hono app in-process (`app.request`) against `core` with a throwaway database, so they also need `pnpm dev:db`. Add a test for every route's success path and its error statuses.
- `cli` and `mcp` may not import `core` or the database driver, so their tests run against a real API started as a separate process: a vitest `globalSetup` spawns `packages/api/src/test-server.ts`, which serves the API on a random port with a throwaway database and a seeded human token, and drops the database when its stdin closes. The cli tests call `run()` in-process against that URL. Use distinct project keys per test, since the database is shared within a run.
- Run everything with `pnpm test`.
