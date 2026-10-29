# 5. Vue 3 for the web UI

- Status: accepted
- Date: 2026-10-29

## Context

The web UI is a Kanban board that is a client of the API.

## Decision

Use Vue 3 with Vite. Add Pinia only if shared state requires it.

## Consequences

Matches the team's preference. The API remains framework-agnostic.
