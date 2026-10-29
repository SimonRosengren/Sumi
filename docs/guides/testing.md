# Testing

- Test runner: Vitest.
- `core` tests run against a real MongoDB (the docker compose replica set), not mocks. Start it first with `pnpm dev:db`. Each test file creates and drops its own database. Override the connection with `MONGODB_URI` (default `mongodb://localhost:27018/?replicaSet=rs0&directConnection=true`).
- `api` tests call the Hono app in-process (`app.request`) against `core` with a throwaway database, so they also need `pnpm dev:db`. Add a test for every route's success path and its error statuses. Streaming routes (`/events`) are tested by reading the response body of `app.request`.
- `client` tests (`packages/client/test`) use a fake `fetch`, so they need no API or database. `watch` is tested that way: frame parsing, reconnecting with fake timers, auth failure, abort.
- `cli` and `mcp` may not import `core` or the database driver, so their tests run against a real API started as a separate process: a vitest `globalSetup` spawns `packages/api/src/test-server.ts`, which serves the API on a random port with a throwaway database and a seeded human token, and drops the database when its stdin closes. The cli tests call `run()` in-process against that URL; the mcp tests connect a real MCP client to `createServer()` through an in-memory transport, plus one test that spawns the real stdio entry point. Use distinct project keys per test, since the database is shared within a run.
- Run everything with `pnpm test`.
- `web` component tests (Vitest, happy-dom, `@vue/test-utils`) use a fake `Client` from `packages/web/test/fixtures.ts`, so they do not need the API or MongoDB. They cannot judge layout or color: for UI changes also look at the running board (see [design.md](../design.md)).
