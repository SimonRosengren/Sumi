# Adding an operation

An operation is something a client can do, e.g. "move ticket".

1. Add request/response zod schemas to `packages/contract`.
2. Implement the service method in `packages/core`, including the activity log entry. Add tests.
3. Expose it as an HTTP route in `packages/api`, validating with the contract schemas.
4. Add a method to the typed client in `packages/client`.
5. Add a CLI command in `packages/cli` with `--json` output.
6. Add an MCP tool in `packages/mcp` only if an agent needs it to do its work. Keep the description short and the response concise.
7. Update the web app if humans need it.
8. Update `docs/domain.md` if entities or invariants changed. Add an ADR if a decision was made.
