# Testing

- Test runner: Vitest.
- `core` tests run against a real MongoDB (the docker compose replica set), not mocks.
- `api` tests exercise routes over HTTP against `core` with a test database.
- `cli` and `mcp` tests run against a test API instance.
- Run everything with `pnpm test`.
