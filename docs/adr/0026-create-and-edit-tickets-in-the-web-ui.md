# 26. Create and edit tickets in the web UI

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0020](0020-board-interactions.md) left creating tickets and editing title and description out of the web UI "until a human needs them in the browser". They do (SUMI-8).

## Decision

- **Create:** a "New ticket" button in the header opens a modal (title, description, status; the project is the selected one). Assignee and priority are set afterwards in the detail modal, so the form stays small. The new ticket appears in its column at once; the live update would otherwise add it a moment later.
- **Edit:** the detail modal gets an edit mode (pencil button) for title and description, saved together with Save. Only changed fields are sent. Editing is a draft, not live: live updates do not overwrite it, and when the server refuses the draft stays open.
- Both forms use the existing contract (`createTicket`, `updateTicket`); validation limits mirror the contract's (title required, 200 characters; description 20,000).
- Links stay editable only through the CLI and agents.

## Consequences

- No new dependencies, no API or contract change.
- Supersedes only the "Not in the panel yet" bullet of ADR 0020.
- If two people edit the same ticket, the last save wins for the fields it changed.
