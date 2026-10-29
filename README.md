# Sumi

**An open-source, self-hosted alternative to Linear, Jira and Trello, built for teams that work with AI coding agents.**

Sumi is a minimal ticket tracker with a Kanban board for humans and an [MCP server](#use-it-from-an-agent-mcp) and CLI for agents (Claude Code, opencode, Cursor and any other MCP client). Humans and agents work the same tickets, and every change is attributed in an activity log. It is small on purpose: one container plus MongoDB, MIT licensed.

If you want sprints, roadmaps and a hundred integrations, use Linear or Jira. If you want a simple board your agents can read and update without scraping a UI or wiring up a heavy API, that is what Sumi is for.

## Why Sumi

- **Agent-first.** The MCP server has eight tools, including `claim_next_ticket`, which atomically hands an agent the next `todo` ticket so two agents never take the same one. Every CLI command supports `--json`.
- **Humans and agents are both users.** Each agent has its own user and token, so the history shows who did what. Revoke one agent without touching the others.
- **A real Kanban board.** Drag and drop, ticket detail modal, light and dark themes, and live updates: when an agent moves a ticket, your board changes without a refresh.
- **GitHub-native.** Sign in with GitHub, and a pull request webhook moves tickets for you (PR opened: In review, merged: Done) when the ticket key is in the branch name or title, such as `SUMI-12-fix-login`.
- **Easy to run.** `docker compose up -d --build` and you have the board and API. No SaaS account, no per-seat pricing, your data stays in your MongoDB.
- **Easy to read and change.** TypeScript everywhere, one API contract, and every design decision written down as an [ADR](docs/adr/). Small, so it is easy to understand and change.

## What Sumi does not do (yet)

Fixed workflow (backlog, todo, in progress, in review, done), one board per project, no sprints or cycles, labels, estimates, custom fields, attachments or notifications, and no ticket creation or editing of titles and descriptions in the web UI yet (use the CLI or an agent). See the [roadmap](docs/roadmap.md) and the open tickets. Sumi stays minimal on purpose, so features are added only when needed.

## Quick start (Docker)

```sh
docker compose up -d --build                       # board and API on http://localhost:3000
docker compose exec sumi npm run bootstrap -- "Your Name"   # first user, prints an API token
```

Open http://localhost:3000 and paste the token, or set up "Continue with GitHub". Sharing it, GitHub sign-in, the pull request webhook, backups and upgrades: [docs/guides/install.md](docs/guides/install.md).

## Development

Requirements: Node.js 22.12+, pnpm, and Docker (for the local MongoDB).

```sh
pnpm install
pnpm dev:db        # starts MongoDB (single-node replica set) via docker compose
cp .env.example .env
pnpm bootstrap <your-name>   # creates the first user and prints an API token (shown once)
pnpm dev:api                 # API on http://localhost:3000
```

Or start everything (MongoDB, API and board) with one command: `pnpm dev`. Separately, to open the board:

```sh
pnpm dev:web                 # http://localhost:5173, sign in by pasting your token
```

On the board, drag a card to another column to move it, and click a card for its details and history.

Put the token in `.env` as `SUMI_TOKEN` (or export it), then use the CLI:

```sh
pnpm exec sumi whoami
pnpm exec sumi project create SUMI "Sumi"
pnpm exec sumi ticket create SUMI "My first ticket" --status todo
pnpm exec sumi ticket list SUMI
pnpm exec sumi --help        # all commands; add --json for machine-readable output
```

## Use it from an agent (MCP)

The MCP server speaks stdio and reads the same `SUMI_TOKEN` / `SUMI_URL`. Give each agent its own token (`pnpm exec sumi agent create <name>`) so the activity log shows who did what. Replace `/path/to/sumi` with this checkout.

opencode (`opencode.json`):

```json
{
  "mcp": {
    "sumi": {
      "type": "local",
      "command": ["pnpm", "--dir", "/path/to/sumi", "exec", "sumi-mcp"],
      "environment": { "SUMI_TOKEN": "<agent token>", "SUMI_URL": "http://localhost:3000" }
    }
  }
}
```

Claude Code:

```sh
claude mcp add sumi -e SUMI_TOKEN=<agent token> -- pnpm --dir /path/to/sumi exec sumi-mcp
```

Against the Docker setup use `SUMI_URL=http://localhost:3000/api` (the API lives under `/api` there).

Tools: `whoami`, `list_projects`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `claim_next_ticket`.

## Contributing (humans and agents)

Read [AGENTS.md](AGENTS.md) first. Architecture and decisions live in [docs/](docs/README.md).

## License

MIT
