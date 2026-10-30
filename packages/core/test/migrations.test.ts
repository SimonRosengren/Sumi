import { MongoClient, type Db } from "mongodb";
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
