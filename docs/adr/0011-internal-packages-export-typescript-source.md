# 11. Internal packages export TypeScript source

- Status: accepted
- Date: 2026-10-29

## Context

contract and core are only consumed inside this monorepo. A build step per library adds config, ordering and stale-output problems for agents.

## Decision

Internal packages point their package.json exports at src/index.ts and have no build step. Typechecking uses tsc --noEmit with Bundler module resolution (extensionless imports). Executables (api, cli, mcp) run through a TypeScript-aware runner or bundler, decided when each is created.

## Consequences

No build ordering between packages and no stale dist. Packages cannot be consumed outside the monorepo as-is. Publishing cli to npm later needs a bundling step, which will get its own ADR.
