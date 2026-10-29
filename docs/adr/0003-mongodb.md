# 3. MongoDB as the database

- Status: accepted
- Date: 2026-10-29

## Context

The team chose MongoDB. We also want live board updates, which need Mongo change streams, and change streams require a replica set.

## Decision

Use MongoDB. Local development runs a single-node replica set via docker compose. Live updates use change streams pushed to clients over SSE.

## Consequences

Local setup needs the replica set initialised, which the compose healthcheck does. Production later needs a replica set too. SSE is simpler than websockets and enough for server-to-client pushes.
