# 29. Everything a human can do in the UI, an agent can do in the CLI and MCP

- Status: accepted
- Date: 2026-10-29

## Context

Sumi is agent-first: the CLI and MCP server are the primary interfaces and the Vue board is the human view ([ADR 0004](0004-http-as-the-only-transport.md), [ADR 0016](0016-mcp-server-and-shared-client.md)). That was only a stated intent, and it drifted. [ADR 0028](0028-editable-lanes.md) shipped lane editing in the web UI only and described it as "a human task for now". Looking for the same gap elsewhere found two more: the CLI had no way to list users (needed for assignees) and the MCP server had no way to list users or read the activity log, although the board does both.

## Decision

- **The rule:** every operation a human can do in the web UI also exists as a CLI command (with `--json`) and as an MCP tool, in the same change that adds it to the UI. The CLI and MCP may do more than the UI, never less. An operation is built bottom-up: contract, core, API, client, then CLI and MCP, and the web last ([adding an operation](../guides/adding-an-operation.md)).
- **Exceptions are explicit.** An operation may be left out of a surface only when the UI does not have it and an agent should not or need not do it, for example credential management, which is humans only ([domain.md](../domain.md)). The reason is written down next to the operation.
- **The rule is enforced, not just written** (AGENTS.md rule 7). `OPERATIONS` in `packages/client/src/operations.ts` maps every client method to its CLI command and its MCP tool, or to a reason (`{ not: "..." }`). It is typed `Record<keyof Client, ...>`, so adding a client method without an entry fails `pnpm typecheck`. The `cli` tests check that every named command exists and the `mcp` tests check that every named tool exists and that no tool is missing from the table. A UI feature without a CLI command or MCP tool therefore cannot pass review quietly: it needs a `{ not }` entry with a reason that a reviewer can reject.
- **Lanes:** the client gains `addLane`, `renameLane`, `moveLane` and `removeLane`, each reading the project's lanes, applying one edit and saving with `setLanes` (so, as in the board, the last save wins). The CLI has `sumi project lane list|add|rename|move|remove` and the MCP server has `add_lane`, `rename_lane`, `move_lane` and `remove_lane`; lanes are addressed by id and positions are 1-based. This supersedes the bullet in ADR 0028 saying the CLI and MCP only read lanes, and renames `sumi project lanes <key>` to `sumi project lane list <key>`. The finer-grained operations are what agents use instead of `setLanes` because a rename or move is one clear call and a mistake cannot delete a lane by omission.
- **The other gaps:** `sumi user list`, and the MCP tools `list_users` and `list_activity`.
- **Reordering in the UI** uses the same `placeLane` function (exported by `client`) as `moveLane`, so the two cannot disagree about where a lane lands.

## Consequences

- 15 MCP tools instead of nine (supersedes the counts in [ADR 0016](0016-mcp-server-and-shared-client.md) and [ADR 0027](0027-ticket-comments.md)). Each is still one short description and a concise response.
- Every new UI feature costs a CLI command and an MCP tool. That is the point, and it is cheap because the client method already exists by then.
- Also supersedes "Not exposed: ... the activity log" in ADR 0016: the board shows it, so agents get it. Creating projects and agents stays CLI-only because the web UI does not have them.
- The table says that an operation exists, not that the CLI and MCP behave the same in every detail; their tests still cover that per operation.
