# 28. Editable lanes

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0007](0007-fixed-workflow-statuses.md) fixed the board to five statuses. Teams want their own columns, and want to add, rename, remove and reorder them from the board (SUMI-16). Claiming ([ADR 0016](0016-mcp-server-and-shared-client.md)) and the GitHub webhook ([ADR 0022](0022-github-webhook-moves-tickets.md)) refer to specific statuses, so they must keep working when lanes change.

## Decision

- **A lane is `{ id, name }`; a project has an ordered list of them** (`Project.lanes`, 1 to 20, names 1 to 40 characters, not necessarily unique). The position in the list is the position on the board. New projects get `backlog`, `todo`, `in_progress`, `in_review`, `done` (named Backlog, Todo, In progress, In review, Done). Projects stored before this change have no `lanes` field and read as the defaults; nothing is migrated.
- **A ticket's `status` is the id of one of its project's lanes.** The type is a string now, not an enum. The id is made from the name when the lane is created (`QA / Staging` becomes `qa_staging`, with `_2`, `_3`... on a clash) and never changes, so renaming a lane keeps its tickets, history and the id agents use. Creating a ticket without a status puts it in the first lane (it used to be `backlog`). Creating or moving a ticket into a lane the project does not have is a validation error.
- **One operation edits lanes:** `PUT /projects/:key/lanes` with the complete new list (`setLanes` in the client). An entry with an `id` is an existing lane (renamed and/or in its new place), an entry without is a new lane, and an existing lane left out is deleted. A lane that still holds tickets cannot be deleted (409); move them first. Replacing the whole list keeps reordering a single request and one activity entry, `project.lanes_updated` (data: the new lanes). Saving the same list again is a no-op and writes nothing.
- **Claiming and the webhook find lanes by id.** `claim_next` takes from `todo` and moves to `in_progress`; the webhook moves to `in_progress`, `in_review` and `done`. Renaming those lanes changes nothing for them. If a project deleted a lane they need, claiming fails with a conflict that says so, and the webhook still adds the PR to the ticket's links but leaves it where it is.
- **CLI and MCP read lanes, they do not edit them.** `sumi project lanes <key>` lists them; `list_projects` returns them with each project; `move_ticket`, `create_ticket` and `list_tickets` take a lane id. Editing is a human task in the web UI for now.
- **Web:** an "Edit lanes" button turns on edit mode. In it, a lane is dragged by its name (native drag and drop, a custom drag type so it cannot be mistaken for a ticket) and dropped on another lane to take that lane's place; a pen next to the name renames it in place (Enter saves, Escape cancels); a trash button deletes an empty lane; and a slim dashed "+ Add" placeholder at the far right adds a lane named "New lane" and puts the cursor in its name. Reorder and rename show at once and are undone if the server refuses.

## Consequences

- Supersedes [ADR 0007](0007-fixed-workflow-statuses.md): statuses are no longer fixed. One board per project still holds, and so does "any lane can move to any other". Status colors and icons in the web UI exist only for the five default ids; other lanes get a plain circle.
- Two people editing lanes at once: the last save wins. A ticket moved into a lane in the instant it is deleted can be left in a lane that no longer exists. It then does not show on the board; moving it with the CLI to a lane that exists fixes it. We accepted this rather than serialising every move against the project.
- Lane ids are never reused while the lane exists, but a deleted lane's id can come back if someone adds a lane with the same name. Old activity entries then refer to the new lane.
- The first lane, not `backlog`, is the default status, so agents that create tickets without a status follow whatever the team put first.
