# 23. Docker image and compose

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0014](0014-node-runtime-for-the-api.md) left open how the API runs in production, and [ADR 0017](0017-web-stack.md) left open how `/api` is served for the web app. The install story should be one command for a small team.

## Decision

- **One image, one process.** The API serves the built web app at `/` (with `index.html` as the fallback for client-side routes) and itself under `/api`, exactly the layout the Vite dev server proxies. The browser always talks to `/api` on its own origin, so there is no CORS and no second container. This mode is on when `SUMI_WEB_DIR` is set (the image sets it); without it the API stays at `/` for development, so the CLI default `http://localhost:3000` still works there.
- **No build step for the API: the image runs it with `tsx`**, as in development, which settles ADR 0014's open question. Bundling would save image size (about 670 MB now, because it carries the full workspace install) at the cost of a build pipeline for four internal packages; not worth it yet.
- The image runs as the unprivileged `node` user and starts `tsx` directly, not through `pnpm`, which would try to re-check `node_modules` and fail without write access.
- **`docker compose up -d --build`** starts MongoDB (the existing single-node replica set) and the app. The app reaches Mongo with `directConnection=true` on the compose network, because the replica set advertises `localhost`. The port is published on `127.0.0.1` only and Mongo has no authentication, so sharing the instance means putting a TLS reverse proxy in front of the app. `pnpm dev:db` still starts only Mongo.
- The GitHub settings are passed through from the environment (`.env` next to the compose file) with empty defaults.
- No registry image is published yet; the image is built from the checkout.

## Consequences

- The deployed URLs differ from development by the `/api` prefix: use `SUMI_URL=http://host:3000/api` for the CLI and MCP server against a container.
- The first user is created with `docker compose exec sumi npm run bootstrap -- <name>`, or by signing in with GitHub.
- Backups are `mongodump` of the `sumi` database; there is nothing else to back up.
- Upgrading is `git pull && docker compose up -d --build`. Indexes are created on start; there are no migrations yet.
