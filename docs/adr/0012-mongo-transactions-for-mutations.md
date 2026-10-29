# 12. Every mutation runs in a MongoDB transaction

- Status: accepted
- Date: 2026-10-29

## Context

A mutation changes several documents: for example creating a ticket bumps the project counter, inserts the ticket and writes an activity entry. A crash between those writes would break the invariants that keys are never reused and every mutation is logged.

## Decision

Each mutation in core runs in one transaction (client.withSession + withTransaction), which includes its activity log entry. Single-document atomic operations (findOneAndUpdate) are used for counters and for claiming tickets.

## Consequences

Invariants hold even on failure: a failed create does not consume a ticket number. Requires a replica set, which ADR 0003 already mandates. Transactions retry on write conflicts, which is what makes concurrent claims safe.
