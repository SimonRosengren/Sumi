# 32. Versioned migrations on start

- Status: accepted
- Date: 2026-10-30

## Context

[ADR 0023](0023-docker-image-and-compose.md) ships upgrades as `git pull && docker compose up -d --build` and noted that indexes were created on start and there were no migrations. That held while schema changes were additive and could be read lazily (projects without `lanes` read as the default lanes, [ADR 0028](0028-editable-lanes.md)). It does not cover changing an index, renaming or reshaping a field, or backfilling data, and every lazy fallback stays in the code forever.

## Decision

- **Migrations are an ordered, append-only list in `packages/core/src/migrations.ts`**: `{ id, up(db) }`, ids like `0002-slug`. `createCore` runs the ones the database has not applied yet before it returns, so the API, `bootstrap` and the test server all upgrade the database they connect to, and nothing is served until it is current.
- **Applied ids are recorded in a `migrations` collection** (`{ _id, appliedAt }`), each one after it succeeds. A migration that throws stops start-up with its id in the error and is retried on the next start.
- **Migrations must be idempotent and use the raw `db`**, not the typed collections, because document types describe only the current shape. There is no lock: Sumi runs as one app container, and idempotence makes a concurrent start harmless for the kind of change we make.
- **Indexes are migrations too.** The former `ensureIndexes` is now `0001-indexes`; a new or changed index is a new migration. Existing deployments have no log, so they run `0001` once, which finds the indexes already there.
- **Start-up refuses a database that has applied migrations this code does not know.** That means a newer version ran against it; an older image must not serve a schema it does not understand. This is also the only rollback story: restore the `mongodump` backup (see the install guide) and run the older version. There are no `down` migrations.
- Existing lazy reads (`lanesOf`) stay until someone writes a migration that backfills them and removes the fallback.

## Consequences

- Upgrading is still `git pull && docker compose up -d --build`; the new container migrates the database as it starts. Take a backup first when a release adds a migration.
- A change to stored data or indexes ships with its migration in the same change; [adding-an-operation](../guides/adding-an-operation.md) says so.
- Long migrations delay start-up; the compose healthcheck allows 15 s plus retries, so a migration that touches a large collection may need a longer `start_period`. Not a concern at current data sizes.
- Running two app instances against one database is not supported yet; adding a lock is the first step if that changes.
