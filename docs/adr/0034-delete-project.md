# 34. Delete a project

- Status: accepted
- Date: 2026-10-30

## Context

Projects could be created and their lanes edited, but never removed, so a demo or mistaken project stayed on the board for good. Removing one touches several rules: activity is "append-only" ([domain](../domain.md)), comments are stored as activity entries ([ADR 0027](0027-ticket-comments.md)), and ticket keys are never reused within a project.

## Decision

- **`DELETE /projects/:key`** (`deleteProject` in the client, `sumi project delete <key>`) removes the project, all its tickets and all its activity entries, comments included, in one transaction. It is humans only and cannot be undone.
- **One `project.deleted` entry remains** (data: `name`, `tickets` count), attributed to the actor, so the deletion itself is recorded. Deleting a project never removes earlier `project.deleted` entries for the same key.
- **The project's other activity is deleted, not kept.** Comments are activity entries keyed by ticket key. If they stayed, creating a project with the same key again would give new `KEY-1` tickets the old comments. Deleting them keeps a key's history consistent with what exists. Past activity of a deleted project is the one exception to "append-only".
- **The key can be reused**, and numbering starts again at 1, because the counter lives on the deleted project document.
- **Not in the MCP server and not in the web UI.** It is destructive and irreversible, so agents do not get it (same reasoning as `createProject`, which is also CLI-only). Rule 7 ([ADR 0029](0029-ui-features-exist-in-cli-and-mcp.md)) only requires that UI features exist for agents, not the reverse.

## Consequences

- The activity log for a deleted project is just its deletion entry. Anyone who needs the history must back it up first.
- Other clients with the board open see the project disappear on next load; there is no live event that removes it.
