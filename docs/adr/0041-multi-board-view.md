# 41. Multiple selected boards

- Status: accepted
- Date: 2026-11-04
- Supersedes: single selection in [ADR 0039](0039-project-board-tabs.md).
- Extends: board-owned lanes in [ADR 0040](0040-board-owned-lanes.md).

## Decision

- Header tabs are independent checkboxes. Allow multiple projects and an empty selection.
- Remember board ids in browser-local `sumi.boards`; inherit the legacy single selection on first use. Remove deleted ids; if every remembered board disappeared, select the first available board.
- Group selected boards by project, in tab order. Merge exact column names within each project, regardless of lane ids. Same ids with different names remain separate.
- Build column order from boards in tab order. Insert unseen names before the next known column in that board, or last. Earlier boards win conflicting orders. Selection click order never affects layout.
- Apply board-local visibility settings before merging. Sort merged tickets by project ticket number and label cards with their board.
- A merged-column drop maps to the ticket's own board lane. Unavailable columns and cross-project drops are refused. Transfers remain explicit.
- Creation picks a board and uses its lanes. Lane editing temporarily shows one explicitly chosen board; Done restores selection and the combined view.
- Fetch selected boards through existing `listTickets` filters. Ticket detail uses the ticket's board for lanes and its project for transfer choices.
- Selection, grouping and ordering are browser presentation settings. CLI and MCP already expose the underlying list, create, move, lane-edit and transfer operations. No new API, dependency or domain mutation.

## Consequences

- Renaming a board lane can split or join a displayed column without changing any other board's workflow.
- Identically named columns in different projects remain separate.
