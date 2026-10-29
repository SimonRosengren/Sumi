# Testing

- Test runner: Vitest.
- `core` tests run against a real MongoDB (the docker compose replica set), not mocks. Start it first with `pnpm dev:db`. Each test file creates and drops its own database. Override the connection with `MONGODB_URI` (default `mongodb://localhost:27018/?replicaSet=rs0&directConnection=true`).
- `api` tests call the Hono app in-process (`app.request`) against `core` with a throwaway database, so they also need `pnpm dev:db`. Add a test for every route's success path and its error statuses.
- `cli` and `mcp` tests run against a test API instance.
- Run everything with `pnpm test`.
