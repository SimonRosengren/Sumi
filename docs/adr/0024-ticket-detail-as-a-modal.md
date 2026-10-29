# 24. Ticket detail as a modal

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0020](0020-board-interactions.md) opened the ticket detail as a right-hand sheet. It is the same Reka UI `Dialog`, but a side sheet reads as a navigation panel, and a centered modal gives the ticket more room and a clearer focus.

## Decision

The ticket detail opens as a centered modal (Reka UI `Dialog`, unchanged behaviour: opens on click or Enter, closes on Escape, the close button or the overlay). Content and editing are as in ADR 0020. This supersedes only the "right-hand sheet" presentation in that ADR; the rest of it stands.

## Consequences

Presentation only: no API, contract or state change. `docs/design.md` describes the new look.
