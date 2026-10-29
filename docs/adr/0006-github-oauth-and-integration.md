# 6. GitHub OAuth and GitHub integration

- Status: accepted
- Date: 2026-10-29

## Context

The team works in GitHub. Humans need to sign in, and later tickets should move based on signals from GitHub repos.

## Decision

Humans sign in with GitHub OAuth. Agents use API tokens tied to an agent user. Later, a GitHub App and webhooks will move tickets. Tickets can already link to repos, branches and PRs in the data model.

## Consequences

No password handling. Webhooks need a public URL, so local development will need a tunnel. The GitHub integration itself is out of scope until after the CLI, MCP and board exist.
