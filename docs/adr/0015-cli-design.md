# 15. CLI design: commander, env configuration, JSON output

- Status: accepted
- Date: 2026-10-29

## Context

The CLI is a primary interface for agents ([ADR 0004](0004-http-as-the-only-transport.md)). Agents parse its output, run it non-interactively and often capture stdout and stderr together, so output and failure behaviour must be predictable.

## Decision

- Use `commander` for argument parsing. It gives every command a `--help` that agents can read, and rejects bad usage (unknown commands, invalid choices) before any API call.
- Configuration is environment only: `SUMI_TOKEN` (required) and `SUMI_URL` (default `http://localhost:3000`). The repo's root `.env` is loaded if present; variables already set win. There is no config file and no login command.
- Output is concise text by default. The global `--json` flag prints the API response as JSON on stdout. Errors go to stderr as one line (`error: <message>`), or as `{"error":{"code","message"}}` with `--json`. Exit code is 0 on success and 1 on any failure. Claiming when nothing is available is a success (`{"ticket":null}`).
- The client validates every response with the contract schemas, so contract drift fails loudly.
- `ticket update` merges `--repo/--branch/--pr` into the ticket's current links before sending, because the API replaces the whole links object.
- `none` clears `--assignee` and `--priority` on update.
- The CLI runs from source through its `bin` entry (`pnpm exec sumi`, shebang `tsx`), consistent with [ADR 0014](0014-node-runtime-for-the-api.md). The root package lists `@sumi/cli` as a dev dependency only so pnpm links the binary; nothing imports it.

## Consequences

- Setup for a human is two exports (or a `.env`). A `login` command storing credentials can be added later if that becomes tedious.
- The merge in `ticket update` is a read-then-write, so two concurrent link updates can overwrite each other. Acceptable for the current scale.
- Text output shows user ids, not names, because the API has no way to look users up yet. `--json` is complete either way.
- Publishing the CLI to npm later needs a bundling step and its own ADR.
