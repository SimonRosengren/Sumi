# 18. `concurrently` for the one-command dev setup

- Status: accepted
- Date: 2026-10-29

## Context

Local development needs MongoDB, the API and the web dev server, which used to mean three terminals.

## Decision

Add `concurrently` as a root dev dependency. `pnpm dev` starts MongoDB (`docker compose up -d --wait`, which waits for the healthcheck and replica set init), then runs the API and the web dev server together with prefixed, colored output. If one of them fails, the other is stopped. `dev:db`, `dev:api` and `dev:web` still work on their own. MongoDB is left running when `pnpm dev` stops (`docker compose stop mongo` to stop it).

## Consequences

- One extra dev dependency. A plain shell script was rejected because it handles Ctrl+C and interleaved logs poorly and does not work on Windows.
- `pnpm dev:db` now blocks until MongoDB is healthy.
