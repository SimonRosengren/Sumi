# 37. Boards within projects

- Status: accepted
- Date: 2026-11-04
- Supersedes: the single-board assumption in [ADR 0028](0028-editable-lanes.md), project-wide browser settings in [ADR 0030](0030-view-settings-stay-in-the-browser.md), and extends project deletion in [ADR 0034](0034-delete-project.md).

## Context

One project needs separate boards, such as Bugs and Features, with a combined view possible later.

## Decision

- Projects own ticket numbering and ordered lanes. All their boards share those lanes.
- Boards are separate documents: stable opaque `id`, `projectKey`, editable `name`, `createdAt`.
- Each ticket belongs to exactly one board in its project. Transfers preserve key, status, comments and history; cross-project transfers are refused.
- Every project starts with a General board. Ticket creation may omit `boardId` only when exactly one board exists.
- Ticket listing and claiming accept an optional `boardId`; omission covers the whole project.
- Board creation, renaming, deletion and ticket transfers are attributed activity entries. Humans and agents may perform them.
- Only empty boards can be deleted; every project retains at least one. Project deletion also deletes its boards.
- Membership changes lock the project document in their transaction, preventing races with board/project deletion.
- Migration `0002-project-boards` creates General boards and backfills tickets. Deterministic board ids and conditional updates allow retries. Existing keys, lanes and history stay intact; migrations do not fabricate user activity.
- The web uses a project selector and board-name tabs. View settings are browser-local per board (`sumi.view.<boardId>`); General inherits legacy project settings. Selection is remembered per project.
- API, client, CLI and MCP expose the same operations. No new dependencies.

## Consequences

- A combined view can query project-wide tickets and group by shared lane ids without copying tickets.
- Board-specific workflows and multiple memberships are outside this model.
- Editing columns affects every board in the project; lane removal checks tickets across all boards.
