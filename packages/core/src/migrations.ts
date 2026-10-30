import type { Db } from "mongodb";

/**
 * A schema or data change that must run once per database (ADR 0032).
 * Must be idempotent: two instances starting together may both run it, and a crash
 * before it is recorded means it runs again. Write against the raw `db`, not the
 * typed collections, because the document types describe the current shape only.
 */
export interface Migration {
  /** Unique and never changed once released. Convention: a zero-padded sequence number and a slug. */
  id: string;
  up(db: Db): Promise<void>;
}

/**
 * Append only. Never edit or reorder a released migration; add a new one.
 * Indexes belong here too, so changing one is explicit (create the new one, drop the old).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001-indexes",
    async up(db) {
      await Promise.all([
        db
          .collection("users")
          .createIndex(
            { githubId: 1 },
            { unique: true, partialFilterExpression: { githubId: { $exists: true } } },
          ),
        db.collection("tickets").createIndex({ projectKey: 1, status: 1, number: 1 }),
        db.collection("activity").createIndex({ ticketKey: 1, createdAt: -1 }),
        db.collection("activity").createIndex({ projectKey: 1, createdAt: -1 }),
      ]);
    },
  },
];

interface MigrationDoc {
  _id: string;
  appliedAt: Date;
}

/**
 * Runs the migrations this database has not seen yet, in order, recording each one after it succeeds.
 * Throws (so the app does not start) if one fails, or if the database has applied migrations this
 * code does not know: it was upgraded by a newer version and must not be served by an older one.
 * Returns the ids it applied.
 */
export async function runMigrations(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<string[]> {
  const ids = migrations.map((m) => m.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) throw new Error(`Duplicate migration id ${duplicate}`);

  const log = db.collection<MigrationDoc>("migrations");
  const applied = new Set((await log.find().toArray()).map((doc) => doc._id));
  const unknown = [...applied].filter((id) => !ids.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `Database has migrations this version does not know (${unknown.join(", ")}). ` +
        "It was upgraded by a newer version of Sumi; upgrade this one instead of running it.",
    );
  }

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    try {
      await migration.up(db);
    } catch (err) {
      throw new Error(`Migration ${migration.id} failed`, { cause: err });
    }
    await log.updateOne(
      { _id: migration.id },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
    ran.push(migration.id);
  }
  return ran;
}
