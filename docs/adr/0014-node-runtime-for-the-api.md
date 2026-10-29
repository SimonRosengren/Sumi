# 14. Run the API with @hono/node-server and tsx

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0011](0011-internal-packages-export-typescript-source.md) left open how executables run TypeScript source. Node 22.12 cannot run `.ts` files without flags.

## Decision

Serve Hono with `@hono/node-server`. Run `api` (and later `cli` and `mcp`) directly from source with `tsx`, loading `.env` through Node's `--env-file-if-exists`. Install scripts of dependencies are disabled by default (`allowBuilds` in `pnpm-workspace.yaml`); esbuild, which tsx uses, is set to false because its binary ships in a platform package and its postinstall is only a check.

## Consequences

No build step in development, and a fresh `pnpm install` succeeds without approving scripts. Production still needs a decision (bundle with a build step, or run with tsx in the Docker image); that belongs to the Docker milestone. A new dependency that needs a build script must be reviewed and added to `allowBuilds` explicitly.
