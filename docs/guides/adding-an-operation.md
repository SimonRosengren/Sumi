# Adding an operation

An operation is something a client can do, e.g. "move ticket".

1. Add request/response zod schemas to `packages/contract`.
2. Implement the service method in `packages/core`, including the activity log entry. Add tests.
3. Expose it as an HTTP route in `packages/api`, validating with the contract schemas.
4. Add a CLI command in `packages/cli` with `--json` output.
5. Add an MCP tool in `packages/mcp`. Keep the description short and the response concise.
6. Update the web app if humans need it.
7. Update `docs/domain.md` if entities or invariants changed. Add an ADR if a decision was made.
