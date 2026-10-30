# 30. View settings stay in the browser

- Status: accepted
- Date: 2026-10-30

## Context

People want to change how the board looks without changing the board: hide a lane they never use, hide lanes with no tickets. These are preferences of one person looking at the board, not facts about the project. [ADR 0029](0029-ui-features-exist-in-cli-and-mcp.md) says everything a human can do in the web UI also exists in the CLI and MCP, so this needs an explicit answer.

## Decision

- **A "View options" menu in the header**, next to the theme toggle, with "Hide empty lanes" and one checkbox per lane ("Show lanes", with ticket counts). A "Show everything" button resets it. The button is tinted while a setting is hiding something.
- **Settings are stored in `localStorage` (`sumi.view`) and never sent to the server**: `{ hideEmpty, hidden: { <project key>: [lane id] } }`. "Hide empty lanes" applies to every project, hidden lanes are per project (lane ids differ). Ids of lanes that no longer exist are ignored. Like the theme and the selected project, they are per browser, not per account.
- **Edit lanes mode shows every lane**, so a hidden or empty lane can still be renamed, moved or removed.
- **Hidden lanes are a view, not a state of the ticket.** Tickets in a hidden lane still exist, still count in the menu, and can still be moved to it from the ticket detail's status select. Only dragging onto a hidden or (with "Hide empty lanes") empty lane is impossible, because there is nothing to drop on.
- **This is not an operation, so rule 7 does not apply.** There is no client method, CLI command or MCP tool for it, and `OPERATIONS` needs no entry. The CLI and MCP always return every ticket and every lane; filtering for an agent is done with arguments it already has (`list_tickets` takes a status).

## Consequences

- No API, contract or database change, so nothing to migrate and nothing to keep in sync with agents.
- Settings do not follow you to another browser. If that is wanted later, they can move to a per-user preference in the API; that would be a new operation and need a CLI command and MCP tool then.
- A teammate can hide a lane and forget; the tinted button and the "No lanes to show" message are the only hints that the board is filtered.
