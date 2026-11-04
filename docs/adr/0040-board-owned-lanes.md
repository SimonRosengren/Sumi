# 40. Board-owned lanes

- Status: accepted
- Date: 2026-11-04
- Supersedes: project-owned lanes in [ADR 0028](0028-editable-lanes.md), lane addressing in [ADR 0029](0029-ui-features-exist-in-cli-and-mcp.md), shared columns and status-preserving transfers in [ADR 0037](0037-project-boards.md).

## Decision

- `Board.lanes` owns column ids, names and order. Projects retain ticket numbering.
- New boards start with the five default lanes.
- Migration `0003-board-lanes` copies each project's current lanes to every board missing lanes, then removes project lanes. Retries preserve existing board lanes, ticket status and history.
- Lane edits affect one board. Removal checks only that board's tickets.
- `GET /boards/:id` reads a board; `PUT /boards/:id/lanes` replaces its lanes. The project-lanes endpoint is removed.
- CLI: `sumi board get <id>` and `sumi board lane list|add|rename|move|remove <board-id>`. MCP: `get_board`; lane tools take `boardId` instead of `projectKey`.
- Lane changes emit `board.lanes_updated` with `boardId` and lanes. Legacy project-lane activity remains readable.
- Transfers keep status if the destination has that id; otherwise use its first lane. Transfer activity records old and new statuses.
- Project-wide claiming skips boards without both `todo` and `in_progress`; scoped claims require both. GitHub checks each ticket's board for the target lane.
- Lane edits, creation, moves, transfers and claims share the existing project transaction lock, preventing invalid statuses during concurrent changes.

## Consequences

- Features and Bugs can have independent workflows.
- Clients must update with the API; project-lane addressing is removed.
- A future combined view must account for different lane sets.
