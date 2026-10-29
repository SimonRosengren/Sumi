# 27. Ticket comments

- Status: accepted
- Date: 2026-10-29

## Context

Humans and agents need to talk on a ticket (SUMI-15). [domain.md](../domain.md) listed comments as undecided. Every mutation must be attributed and recorded in the activity log, and the board already updates live from the activity change stream ([ADR 0019](0019-sse-live-updates.md)).

## Decision

- **A comment is an activity entry**, action `ticket.commented`, with the author as `actorId` and the markdown text in `data.body` (1 to 10,000 characters, trimmed). There is no separate collection: the entry is already attributed, timestamped, written in the same transaction and delivered over SSE, so a second copy of the same fact could only drift.
- **`Comment`** (`id`, `ticketKey`, `authorId`, `body`, `createdAt`) is a view of such an entry. `id` is the entry's id. `core.comments.add(actorId, ticketKey, { body })` and `core.comments.list(ticketKey)` (oldest first, all of them) are the only code that knows the mapping.
- **API:** `POST /tickets/:key/comments` (201) and `GET /tickets/:key/comments`. **Client:** `addComment`, `listComments`. **CLI:** `sumi ticket comment <key> <body>` and `sumi ticket comments <key>`. **MCP:** `add_comment`, and `get_ticket` includes `comments` when there are any, so an agent reads the discussion with the ticket.
- **Web:** a Comments section in the ticket modal, above Activity, with a box to write one (Cmd/Ctrl+Enter sends). Text is shown as plain text like descriptions, not rendered as markdown. A new comment shows at once and other people's appear through the usual live reload. The activity list still shows a "commented" line.
- A comment does not change the ticket, so `updatedAt` stays as it was.
- **Out of scope:** editing and deleting comments (activity is append-only), mentions, notifications, threads.

## Consequences

- Nine MCP tools instead of eight (supersedes the tool count in [ADR 0016](0016-mcp-server-and-shared-client.md)).
- Comment bodies also appear in `GET /activity` and the CLI activity log, as `data.body`.
- Because the log is append-only, a mistaken comment cannot be removed. If deletion is needed later, comments should become their own entity with the activity entry pointing at it.
- Listing is unpaginated; fine for ticket-sized discussions.
