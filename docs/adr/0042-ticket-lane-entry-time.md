# 42. Store ticket lane entry time

- Status: accepted
- Date: 2026-11-13

## Decision

- Store required `statusSince` on tickets; expose it through the shared contract.
- Set it at creation. Reset it with status changes, claims and transfers to another board, in the mutation's transaction.
- A lane belongs to a board: transferring boards resets time even when lane ids match.
- Preserve it for edits, comments, lane renames and no-op moves/transfers.
- Migration `0004-ticket-status-since` backfills from the latest creation, move, claim or transfer activity; falls back to `createdAt` when history is absent. Never overwrite an existing value.

## Consequences

- Board reads need no activity lookup per ticket.
- CLI and MCP expose the timestamp; the web formats elapsed minutes, hours or days and refreshes every minute.
