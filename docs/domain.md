# Domain

## Entities

- **User**: `kind` is `human` or `agent`. Humans sign in with GitHub. Agents authenticate with API tokens.
- **Project**: name and short `key` (e.g. `SUMI`). One fixed board per project.
- **Ticket**: key (`SUMI-12`), title, description (markdown), status, assignee (optional), priority (optional), links (repo, branch, PR; optional).
- **ActivityEntry**: append-only record of who changed what and when.

Deliberately not modelled yet: labels, sprints, estimates, custom fields, attachments, notifications. Comments are undecided.

## Statuses (fixed in v1)

`backlog -> todo -> in_progress -> in_review -> done`

Custom workflows are out of scope.

## Invariants

- Ticket keys are unique per project and never reused.
- Every mutation writes an ActivityEntry with the acting user.
- "Claim next ticket" is atomic: two agents can never claim the same ticket.
- Tickets can reference GitHub repos, branches and PRs so GitHub signals can move them later.
