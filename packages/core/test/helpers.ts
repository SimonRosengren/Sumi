import { afterAll, beforeAll } from "vitest";
import { createCore, type Core } from "../src";

const uri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27018/?replicaSet=rs0&directConnection=true";

/** Gives each test file its own throwaway database on the local dev Mongo (`pnpm dev:db`). */
export function useCore(): () => Core {
  let core: Core | undefined;
  beforeAll(async () => {
    core = await createCore({ uri, dbName: `sumi_test_${crypto.randomUUID().replaceAll("-", "")}` });
  });
  afterAll(async () => {
    await core?.dropDatabase();
    await core?.close();
  });
  return () => {
    if (!core) throw new Error("core not initialised");
    return core;
  };
}

export async function seed(core: Core) {
  const alice = await core.users.create({ kind: "human", name: "Alice" });
  const bot = await core.users.create({ kind: "agent", name: "Bot" });
  await core.projects.create(alice.id, { key: "SUMI", name: "Sumi" });
  return { alice, bot };
}
