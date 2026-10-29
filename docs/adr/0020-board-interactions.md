# 20. Board interactions: native drag and drop, detail panel

- Status: accepted
- Date: 2026-10-29

## Context

The board was read-only ([ADR 0017](0017-web-stack.md)). Humans need to move tickets and change basic fields without the CLI.

## Decision

- **Native HTML5 drag and drop** (`draggable`, `dragstart`, `drop`), no drag-and-drop library. Columns are fixed statuses and tickets have no manual order ([domain.md](../domain.md)), so the only gesture is "drop a card on a column". A library would add a dependency for a feature the browser already has.
- **Moves are optimistic.** The card changes column at once; the server's answer replaces it. On failure the board reloads from the server and shows the error.
- **A detail panel** (Reka UI `Dialog`, as a right-hand sheet) opens from a card (click or Enter). It shows the ticket and its activity, and edits status, assignee and priority with native `<select>`s. The selects are also the way to move a ticket on touch screens, where HTML5 drag and drop does not work and on keyboards.
- **Not in the panel yet:** editing title, description and links, and creating tickets. Those stay with the CLI and agents until a human needs them in the browser.

## Consequences

- No new dependencies.
- Dragging does not work on touch devices; use the status select in the panel.
- The panel stays current through the live updates ([ADR 0019](0019-sse-live-updates.md)): its ticket comes from the board's list, and its activity reloads when the ticket's `updatedAt` changes.
