# 22. GitHub webhook moves tickets

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0006](0006-github-oauth-and-integration.md) planned a GitHub App and webhooks to move tickets. Tickets already carry `links.repo`, `links.branch` and `links.pr`. The smallest thing that keeps the board honest is reacting to pull request events.

## Decision

- **A plain repository (or organization) webhook, not a GitHub App.** `POST /webhooks/github` accepts `pull_request` events (`ping` is answered, everything else gets 202 and is ignored). It is enabled by `GITHUB_WEBHOOK_SECRET`; without it the route does not exist. Requests are authenticated by GitHub's `X-Hub-Signature-256` HMAC over the raw body (constant-time compare), not by a bearer token. A GitHub App can replace the webhook later behind the same core operation.
- **The rule lives in core** as `core.github.syncPullRequest`, so it is testable without HTTP and any future entry point reuses it. The mapping:

  | PR event | Ticket moves to |
  | --- | --- |
  | `opened`, `reopened`, `ready_for_review` | `in_review` (`in_progress` if the PR is a draft) |
  | `converted_to_draft` | `in_progress` |
  | `closed` and merged | `done` |
  | anything else (`synchronize`, `labeled`, `closed` without merge, ...) | nothing |

- **Which tickets a PR belongs to:** tickets whose links name the same repo and the PR number or the head branch, or tickets whose key appears in the head branch name or the PR title (`SUMI-12`, `sumi-12-fix-login`). A ticket whose links name a different repo is never matched by key. One PR can move several tickets.
- **Matched tickets get `repo`, `branch` and `pr` added to their links**, so the card shows the PR and later events match by link. Moves and link changes are ordinary `ticket.moved` and `ticket.updated` activity.
- **Attribution:** changes are made by a built-in agent user `GitHub` (id `system:github`), created on first use, so the activity log and rule 5 hold. It is a normal agent user: it appears in the assignee list and has no token.
- Moving back is not done: closing a PR without merging leaves the ticket where it is, because the right status (abandoned, or back to work) is a human call.

## Consequences

- Needs a public URL; locally use a tunnel and point the webhook at `<tunnel>/api/webhooks/github`.
- A branch or title that mentions an unrelated real ticket key moves that ticket too. Keys are specific enough (project key plus number) that this is accepted for now.
- The payload is trusted only after the signature check; the secret is shared by every repo that sends to this instance.
- Branch pushes, reviews and checks are not used yet.
