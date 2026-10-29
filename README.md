# Sumi

A slimmed-down ticket management system, designed for agentic workflows first. Agents get an MCP server and a CLI; humans get a Kanban board.

Status: early development. See [docs/roadmap.md](docs/roadmap.md).

## Requirements

- Node.js 22.12+
- pnpm
- Docker (for the local MongoDB)

## Getting started

```sh
pnpm install
pnpm dev:db        # starts MongoDB (single-node replica set) via docker compose
cp .env.example .env
pnpm bootstrap <your-name>   # creates the first user and prints an API token (shown once)
pnpm dev:api                 # API on http://localhost:3000
```

Put the token in `.env` as `SUMI_TOKEN` (or export it), then use the CLI:

```sh
pnpm exec sumi whoami
pnpm exec sumi project create SUMI "Sumi"
pnpm exec sumi ticket create SUMI "My first ticket" --status todo
pnpm exec sumi ticket list SUMI
pnpm exec sumi --help        # all commands; add --json for machine-readable output
```

## Contributing (humans and agents)

Read [AGENTS.md](AGENTS.md) first. Architecture and decisions live in [docs/](docs/README.md).

## License

MIT
