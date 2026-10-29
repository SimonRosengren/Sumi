# Domain

## Entities

- **User**: `kind` is `human` or `agent`. Humans sign in with GitHub (`githubId`, only logins on the allow-list) or with a token. Agents authenticate with API tokens. Ids are UUID strings.
- **Project**: name and short `key` (e.g. `SUMI`, 2-10 uppercase letters/digits), and its ordered `lanes`. One board per project. The key is its id.
- **Lane**: a board column, `{ id, name }`. The id is chosen when the lane is created and never changes; the name can ([ADR 0028](adr/0028-editable-lanes.md)).
- **Ticket**: key (`SUMI-12`), title, description (markdown), status (the id of a lane in its project), assignee (optional), priority (optional `low|medium|high`), links. The key is its id.
- **Links**: optional `repo` (`owner/name`), `branch`, `pr` (number, within `repo`). Updating `links` replaces the whole object.
- **ActivityEntry**: append-only record of who (`actorId`) did what (`action`), with the project, optional ticket and action-specific `data`. Actions: `project.created`, `project.lanes_updated`, `ticket.created`, `ticket.updated`, `ticket.moved`, `ticket.claimed`, `ticket.commented`, `agent.created`, `token.created`, `token.revoked`. `projectKey` is absent for the last three.
- **Comment**: a note on a ticket (`authorId`, markdown `body`, `createdAt`). Stored as a `ticket.commented` activity entry, so it is attributed and live by construction; cannot be edited or deleted ([ADR 0027](adr/0027-ticket-comments.md)).
- **Token**: credential for one user. Stored as a hash only; the plaintext is shown once. Listed by a public `id` (a hash prefix that cannot authenticate) and revocable by any human ([ADR 0021](adr/0021-github-sign-in-and-token-management.md)).

Deliberately not modelled yet: labels, sprints, estimates, custom fields, attachments, notifications.

## Lanes and statuses

A project starts with five lanes: `backlog -> todo -> in_progress -> in_review -> done` (ids; names are Backlog, Todo, In progress, In review, Done). Humans can add, rename, remove and reorder them ([ADR 0028](adr/0028-editable-lanes.md)). A ticket's status is the id of one of its project's lanes; a ticket created without one goes to the first lane.

Any lane can move to any other (it is a Kanban board). Moving a ticket to its current lane is a no-op and writes no activity. A lane with tickets in it cannot be removed. Claiming and the GitHub webhook refer to the lanes `todo`, `in_progress`, `in_review` and `done` by id, so renaming them is safe but deleting them disables that behaviour.

## Invariants

- Ticket keys are unique per project and never reused.
- Every mutation writes an ActivityEntry with the acting user, in the same transaction as the change. The one exception is creating a user, which is done by the system (sign-in, token setup) and has no actor.
- The actor and any assignee must be existing users.
- Only humans can create agents and create, list and revoke tokens. Agents cannot.
- A failed create does not consume a ticket number.
- "Claim next" is atomic: two agents can never claim the same ticket. It takes the lowest-numbered ticket in the `todo` lane that is unassigned or already assigned to the claimer, assigns it to them and moves it to `in_progress`. Priority does not affect order yet.
- Tickets can reference GitHub repos, branches and PRs. A GitHub pull request webhook moves matching tickets (`in_review` on open, `done` on merge, when the project still has those lanes) as the built-in agent user `GitHub`, and adds the PR to their links ([ADR 0022](adr/0022-github-webhook-moves-tickets.md)).
