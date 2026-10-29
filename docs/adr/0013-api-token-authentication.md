# 13. API token authentication

- Status: accepted
- Date: 2026-10-29

## Context

Every API call must be attributed to a user. Agents and the CLI need a credential they can hold in config, and GitHub sign-in ([ADR 0006](0006-github-oauth-and-integration.md)) is not built yet but the API must be usable and testable now.

## Decision

Clients send `Authorization: Bearer <token>`. A token belongs to one user (human or agent). Tokens are `sumi_` plus 256 random bits and are stored only as a SHA-256 hash; the plaintext is returned once at creation. A fast unsalted hash is sufficient because the tokens are high-entropy random values, not passwords. Only humans can create agents and tokens, and both are recorded in the activity log. The first human is created with `pnpm bootstrap <name>`. GitHub OAuth will later add browser sessions for humans on top of this; it does not replace tokens.

## Consequences

Agents and the CLI can authenticate today, and every request resolves to an attributed user. Tokens cannot be listed or revoked yet, so a leaked token stays valid until revocation is added; that is the next auth gap to close. A human who first signs in with GitHub will be a different user from the bootstrap human, so linking them needs a decision when OAuth is built.
