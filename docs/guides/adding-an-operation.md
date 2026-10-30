# Adding an operation

An operation is something a client can do, e.g. "move ticket".

1. Add request/response zod schemas to `packages/contract`.
2. Implement the service method in `packages/core`, including the activity log entry. Add tests.
3. Expose it as an HTTP route in `packages/api`, validating with the contract schemas.
4. Add a method to the typed client in `packages/client`.
5. Add a CLI command in `packages/cli` with `--json` output.
6. Add an MCP tool in `packages/mcp`. Keep the description short and the response concise.
7. Register the client method in `OPERATIONS` (`packages/client/src/operations.ts`) with its CLI command and MCP tool. The only reason to leave a surface out is an operation the web UI does not have and an agent should not or need not do (say why with `{ not: "..." }`). Typecheck and the cli/mcp tests fail otherwise ([ADR 0029](../adr/0029-ui-features-exist-in-cli-and-mcp.md)).
8. Update the web app if humans need it. Anything the web app can do must already have steps 5 to 7.
9. If stored documents change shape (a new required field, a renamed field, a changed index), add a migration to `packages/core/src/migrations.ts` in the same change ([ADR 0032](../adr/0032-versioned-migrations-on-start.md)): append-only, idempotent, written against the raw `db`, with a test in `packages/core/test/migrations.test.ts`.
10. Update `docs/domain.md` if entities or invariants changed. Add an ADR if a decision was made.
