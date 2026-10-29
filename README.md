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
```

## Contributing (humans and agents)

Read [AGENTS.md](AGENTS.md) first. Architecture and decisions live in [docs/](docs/README.md).

## License

MIT
