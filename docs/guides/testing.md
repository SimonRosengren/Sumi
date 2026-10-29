# Testing

- Test runner: Vitest.
- `core` tests run against a real MongoDB (the docker compose replica set), not mocks. Start it first with `pnpm dev:db`. Each test file creates and drops its own database. Override the connection with `MONGODB_URI` (default `mongodb://localhost:27018/?replicaSet=rs0&directConnection=true`).
- `api` tests exercise routes over HTTP against `core` with a test database.
- `cli` and `mcp` tests run against a test API instance.
- Run everything with `pnpm test`.
