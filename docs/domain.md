# Domain

## Entities

- **User**: `kind` is `human` or `agent`. Humans sign in with GitHub (`githubId`). Agents authenticate with API tokens. Ids are UUID strings.
- **Project**: name and short `key` (e.g. `SUMI`, 2-10 uppercase letters/digits). One fixed board per project. The key is its id.
- **Ticket**: key (`SUMI-12`), title, description (markdown), status, assignee (optional), priority (optional `low|medium|high`), links. The key is its id.
- **Links**: optional `repo` (`owner/name`), `branch`, `pr` (number, within `repo`). Updating `links` replaces the whole object.
- **ActivityEntry**: append-only record of who (`actorId`) did what (`action`), with the project, optional ticket and action-specific `data`. Actions: `project.created`, `ticket.created`, `ticket.updated`, `ticket.moved`, `ticket.claimed`, `agent.created`, `token.created`. `projectKey` is absent for the last two.
- **Token**: credential for one user. Stored as a hash only; the plaintext is shown once. Cannot be listed or revoked yet.

Deliberately not modelled yet: labels, sprints, estimates, custom fields, attachments, notifications. Comments are undecided.

## Statuses (fixed in v1)

`backlog -> todo -> in_progress -> in_review -> done`

Any status can move to any other (it is a Kanban board). Moving a ticket to its current status is a no-op and writes no activity. Custom workflows are out of scope.

## Invariants

- Ticket keys are unique per project and never reused.
- Every mutation writes an ActivityEntry with the acting user, in the same transaction as the change. The one exception is creating a user, which is done by the system (sign-in, token setup) and has no actor.
- The actor and any assignee must be existing users.
- Only humans can create agents and tokens. Agents cannot.
- A failed create does not consume a ticket number.
- "Claim next" is atomic: two agents can never claim the same ticket. It takes the lowest-numbered `todo` ticket that is unassigned or already assigned to the claimer, assigns it to them and moves it to `in_progress`. Priority does not affect order yet.
- Tickets can reference GitHub repos, branches and PRs so GitHub signals can move them later.
