# Install and run

For a team instance. For development see the README.

## Run it

```sh
git clone <this repo> sumi && cd sumi
docker compose up -d --build     # MongoDB + Sumi, board and API on http://localhost:3000
```

Create the first user, either:

- `docker compose exec sumi npm run bootstrap -- "Your Name"` prints an API token (shown once). Open the board and paste it, or
- set up GitHub sign-in (below) and click "Continue with GitHub".

The board is at `http://localhost:3000`, the API at `http://localhost:3000/api`. Details and reasons: [ADR 0023](../adr/0023-docker-image-and-compose.md).

The port (`SUMI_PORT`, default 3000) is published on `127.0.0.1` only and MongoDB has no authentication. To share it with the team, put a reverse proxy with TLS in front (Caddy, nginx, Tailscale serve...) and set `SUMI_PUBLIC_URL` to the public address. Do not expose port 3000 over plain HTTP: tokens would travel unencrypted.

Settings go in a `.env` file next to `docker-compose.yml` (see `.env.example`). Restart with `docker compose up -d` after changing it.

## GitHub sign-in

1. Create an OAuth app at https://github.com/settings/developers. Homepage: your `SUMI_PUBLIC_URL`. Callback URL: `<SUMI_PUBLIC_URL>/api/auth/github/callback`.
2. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SUMI_PUBLIC_URL` and `GITHUB_ALLOWED_LOGINS` (comma-separated GitHub logins that may sign in). The allow-list is required.

Anyone not on the list is turned away. Rationale: [ADR 0021](../adr/0021-github-sign-in-and-token-management.md).

## Move tickets from GitHub pull requests

In the repository (or organization) settings add a webhook: payload URL `<public url>/api/webhooks/github`, content type `application/json`, a secret of your choice (also set as `GITHUB_WEBHOOK_SECRET`), and only the "Pull requests" event. GitHub needs to reach the URL; for a local instance use a tunnel.

A PR moves the ticket whose key is in its branch name or title (`SUMI-12`, `sumi-12-fix-login`) or whose links name the repo and PR or branch: opened to In review, merged to Done. See [ADR 0022](../adr/0022-github-webhook-moves-tickets.md).

## Use it from the CLI and agents

From a checkout, with `pnpm install` done. The URL ends in `/api` against a container:

```sh
export SUMI_URL=http://localhost:3000/api
export SUMI_TOKEN=sumi_...                    # from bootstrap, or `sumi token create`
pnpm exec sumi agent create claude            # a token for an agent, shown once
```

MCP server configuration is in the README. Lost or leaked tokens: `sumi token list [--user <id>]`, then `sumi token revoke <id>`.

## Operate it

- Data lives in the `mongo-data` volume. Back up with `docker compose exec mongo mongodump --port 27018 --db sumi --archive > sumi.archive`.
- Upgrade with `git pull && docker compose up -d --build`. The new container applies any pending database migrations before it serves (recorded in the `migrations` collection; [ADR 0032](../adr/0032-versioned-migrations-on-start.md)). Take a backup first if the release adds one. If start-up fails with "Migration ... failed", the log says which; it is retried on the next start. A database upgraded by a newer version is refused by an older one: restore the backup instead.
- Logs: `docker compose logs -f sumi`.
