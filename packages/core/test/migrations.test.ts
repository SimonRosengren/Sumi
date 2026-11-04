import { MongoClient, type Db } from "mongodb";
import { DEFAULT_LANES } from "@sumi/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCore } from "../src";
import { MIGRATIONS, runMigrations, type Migration } from "../src/migrations";

const uri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27018/?replicaSet=rs0&directConnection=true";
const dbName = `sumi_test_${crypto.randomUUID().replaceAll("-", "")}`;

let client: MongoClient;
let n = 0;
beforeAll(async () => {
  client = await new MongoClient(uri).connect();
});
afterAll(async () => {
  for (let i = 0; i <= n; i++) await client.db(`${dbName}_${i}`).dropDatabase();
  await client.close();
});
/** A fresh empty database per test. */
function freshDb(): Db {
  return client.db(`${dbName}_${++n}`);
}

function counting(id: string, runs: string[]): Migration {
  return {
    id,
    async up() {
      runs.push(id);
    },
  };
}

describe("runMigrations", () => {
  it("runs pending migrations in order, once, and records them", async () => {
    const d = freshDb();
    const runs: string[] = [];
    const list = [counting("0001-a", runs), counting("0002-b", runs)];

    expect(await runMigrations(d, list)).toEqual(["0001-a", "0002-b"]);
    expect(await runMigrations(d, list)).toEqual([]);
    expect(runs).toEqual(["0001-a", "0002-b"]);

    const recorded = await d.collection("migrations").find().toArray();
    expect(recorded.map((r) => r._id).sort()).toEqual(["0001-a", "0002-b"]);
    expect(recorded[0]?.appliedAt).toBeInstanceOf(Date);
  });

  it("runs only the migrations added since the last start", async () => {
    const d = freshDb();
    const runs: string[] = [];
    await runMigrations(d, [counting("0001-a", runs)]);
    const ran = await runMigrations(d, [counting("0001-a", runs), counting("0002-b", runs)]);
    expect(ran).toEqual(["0002-b"]);
    expect(runs).toEqual(["0001-a", "0002-b"]);
  });

  it("stops at a failing migration, does not record it, and retries it next start", async () => {
    const d = freshDb();
    const runs: string[] = [];
    let broken = true;
    const flaky: Migration = {
      id: "0002-flaky",
      async up() {
        if (broken) throw new Error("boom");
      },
    };
    const list = [counting("0001-a", runs), flaky, counting("0003-c", runs)];

    await expect(runMigrations(d, list)).rejects.toThrow("Migration 0002-flaky failed");
    expect(runs).toEqual(["0001-a"]);
    expect(await d.collection("migrations").countDocuments()).toBe(1);

    broken = false;
    expect(await runMigrations(d, list)).toEqual(["0002-flaky", "0003-c"]);
  });

  it("refuses a database that a newer version has migrated", async () => {
    const d = freshDb();
    await runMigrations(d, [counting("0001-a", []), counting("0002-b", [])]);
    const runs: string[] = [];
    await expect(runMigrations(d, [counting("0001-a", runs)])).rejects.toThrow(/0002-b/);
    expect(runs).toEqual([]);
  });

  it("rejects duplicate ids", async () => {
    await expect(
      runMigrations(freshDb(), [counting("0001-a", []), counting("0001-a", [])]),
    ).rejects.toThrow("Duplicate migration id 0001-a");
  });
});

describe("MIGRATIONS", () => {
  it("copies project lanes to every board, preserves existing board lanes and is retry-safe", async () => {
    const d = freshDb();
    await runMigrations(d, MIGRATIONS.slice(0, 2));
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const custom = [{ id: "inbox", name: "Inbox" }, { id: "done", name: "Shipped" }];
    await d.collection<{ _id: string; name: string; lastNumber: number; createdAt: Date; lanes?: typeof custom }>("projects").insertMany([
      { _id: "CUSTOM", name: "Custom", lastNumber: 7, lanes: custom, createdAt },
      { _id: "DEFAULT", name: "Default", lastNumber: 0, createdAt },
    ]);
    const boards = d.collection<{ _id: string; projectKey: string; name: string; createdAt: Date; lanes?: typeof custom }>("boards");
    await boards.insertMany([
      { _id: "features", projectKey: "CUSTOM", name: "Features", createdAt },
      { _id: "bugs", projectKey: "CUSTOM", name: "Bugs", createdAt },
      { _id: "already", projectKey: "CUSTOM", name: "Already", lanes: [{ id: "ready", name: "Ready" }], createdAt },
      { _id: "default", projectKey: "DEFAULT", name: "Default", createdAt },
    ]);
    await d.collection("tickets").insertOne({ key: "CUSTOM-7", boardId: "features", status: "inbox" });
    await d.collection("activity").insertOne({ action: "project.lanes_updated", data: { lanes: custom } });
    const ticketsBefore = await d.collection("tickets").find().toArray();
    const historyBefore = await d.collection("activity").find().toArray();
    const migration = MIGRATIONS[2]!;
    await Promise.all([migration.up(d), migration.up(d)]);
    await migration.up(d);
    expect((await boards.findOne({ _id: "features" }))?.lanes).toEqual(custom);
    expect((await boards.findOne({ _id: "bugs" }))?.lanes).toEqual(custom);
    expect((await boards.findOne({ _id: "default" }))?.lanes).toEqual(DEFAULT_LANES);
    expect((await boards.findOne({ _id: "already" }))?.lanes).toEqual([{ id: "ready", name: "Ready" }]);
    expect(await d.collection("projects").countDocuments({ lanes: { $exists: true } })).toBe(0);
    expect(await d.collection("tickets").find().toArray()).toEqual(ticketsBefore);
    expect(await d.collection("activity").find().toArray()).toEqual(historyBefore);
    expect(await runMigrations(d)).toEqual([migration.id]);
    expect(await runMigrations(d)).toEqual([]);
  });

  it("backfills General boards without changing ticket keys, workflows, history or existing membership", async () => {
    const d = freshDb();
    await runMigrations(d, MIGRATIONS.slice(0, 1));
    const createdAt = new Date("2026-01-01T00:00:00Z");
    await d.collection<{ _id: string; name: string; lastNumber: number; createdAt: Date; lanes?: { id: string; name: string }[] }>("projects").insertMany([
      { _id: "LEGACY", name: "Legacy", lastNumber: 9, lanes: [{ id: "inbox", name: "Inbox" }], createdAt },
      { _id: "DEFAULT", name: "Default", lastNumber: 0, createdAt },
    ]);
    const tickets = d.collection<{ _id: string; projectKey: string; boardId?: string; status: string }>("tickets");
    await tickets.insertMany([
      { _id: "LEGACY-9", projectKey: "LEGACY", status: "inbox" },
      { _id: "LEGACY-8", projectKey: "LEGACY", boardId: "already-assigned", status: "inbox" },
    ]);
    await d.collection("activity").insertOne({ action: "ticket.commented", ticketKey: "LEGACY-9", data: { body: "Keep me" } });
    const projectsBefore = await d.collection("projects").find().toArray();
    const historyBefore = await d.collection("activity").find().toArray();

    const migration = MIGRATIONS[1]!;
    await Promise.all([migration.up(d), migration.up(d)]);
    await migration.up(d); // restart after a crash before recording the migration
    expect(await d.collection("boards").countDocuments()).toBe(2);
    expect(await tickets.findOne({ _id: "LEGACY-9" })).toEqual({ _id: "LEGACY-9", projectKey: "LEGACY", boardId: "LEGACY-general", status: "inbox" });
    expect((await tickets.findOne({ _id: "LEGACY-8" }))?.boardId).toBe("already-assigned");
    expect(await d.collection("projects").find().toArray()).toEqual(projectsBefore);
    expect(await d.collection("activity").find().toArray()).toEqual(historyBefore);
    expect(await runMigrations(d, MIGRATIONS.slice(0, 2))).toEqual([migration.id]);
    expect(await runMigrations(d, MIGRATIONS.slice(0, 2))).toEqual([]);
  });

  it("have unique, sorted ids", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("createCore applies them to an empty database", async () => {
    const name = `${dbName}_core`;
    const core = await createCore({ uri, dbName: name });
    try {
      const raw = client.db(name);
      const recorded = await raw.collection("migrations").find().toArray();
      expect(recorded.map((r) => r._id)).toEqual(MIGRATIONS.map((m) => m.id));
      const indexes = await raw.collection("users").indexes();
      expect(indexes.some((i) => i.unique && "githubId" in i.key)).toBe(true);
    } finally {
      await core.dropDatabase();
      await core.close();
    }
  });

  it("an existing database from before migrations (indexes, no log) upgrades cleanly", async () => {
    const d = freshDb();
    await d.collection("tickets").createIndex({ projectKey: 1, status: 1, number: 1 });
    expect(await runMigrations(d)).toEqual(MIGRATIONS.map((m) => m.id));
  });
});
