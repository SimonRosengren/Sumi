# 19. Live updates: activity change stream over SSE

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0003](0003-mongodb.md) chose Mongo change streams pushed over SSE for live board updates. This records how. Every mutation already writes an activity entry in the same transaction as the change ([ADR 0012](0012-mutations-in-transactions.md)), so the activity collection is a complete, ordered record of everything that changes.

## Decision

- **One source of events: inserts into the `activity` collection.** `core.activity.subscribe(onEntry, onError)` opens a change stream on it and resolves once the stream is open. Because entries are written inside the mutation's transaction, an event is only seen after the change is committed. Future mutations are covered automatically, as long as they log activity (which is already a rule).
- **`GET /events`** (authenticated like every route) is an SSE stream: `ready` once the subscription is live, one `activity` event per entry (an `ActivityEntry` as JSON, all projects), and a `ping` every 25 s so idle connections survive proxies. There is one change stream per open connection. That is fine for a small team; a shared stream with fan-out can replace it behind the same route.
- **Events are not replayed and not resumed.** If the stream breaks, the API closes the connection and the client reconnects. A client must reload its data on every `ready`, which also covers anything missed while it was offline.
- **The client reads the stream with `fetch`, not `EventSource`.** `EventSource` cannot send an `Authorization` header, and putting the token in the URL would leak it into logs and history. `client.watch({ onEntry, onReady, signal })` parses the frames, reconnects with backoff (1 s up to 15 s), and gives up only when aborted or when the token is rejected.
- **The board refetches instead of patching.** An event only says that something changed; the web app reloads projects, users and tickets (debounced 100 ms so a burst becomes one reload; reloads never overlap). It is simpler than merging events into local state and cannot drift from the server. Reloads that finish after the user switched project are discarded.

## Consequences

- Requires a replica set, as already planned. Local development has one.
- Every event makes each open board do three small requests. If that ever hurts, patch tickets from the event data (`ticketKey`, `data`) instead.
- All users see events for all projects, consistent with the current model where every user can read every project. Per-project access control would need filtering in `/events`.
- Closing a browser tab ends its connection, and the API then closes that change stream.
