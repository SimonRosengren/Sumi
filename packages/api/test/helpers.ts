import { afterAll, beforeAll } from "vitest";
import { createCore, type Core } from "@sumi/core";
import { createApp } from "../src";

const uri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27018/?replicaSet=rs0&directConnection=true";

export interface Harness {
  core: Core;
  app: ReturnType<typeof createApp>;
  /** Token of a seeded human, "Alice". */
  token: string;
  aliceId: string;
  /** Calls the API in-process, like an HTTP client would. */
  call(method: string, path: string, opts?: { token?: string | null; body?: unknown }): Promise<{
    status: number;
    body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }>;
}

/** Gives each test file its own throwaway database on the local dev Mongo (`pnpm dev:db`). */
export function useApi(): () => Harness {
  let h: Harness | undefined;
  beforeAll(async () => {
    const core = await createCore({ uri, dbName: `sumi_test_${crypto.randomUUID().replaceAll("-", "")}` });
    const app = createApp(core);
    const alice = await core.users.create({ kind: "human", name: "Alice" });
    const token = await core.tokens.create(alice.id, alice.id);
    h = {
      core,
      app,
      token,
      aliceId: alice.id,
      async call(method, path, opts = {}) {
        const authToken = opts.token === undefined ? token : opts.token;
        const res = await app.request(path, {
          method,
          headers: {
            ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
            ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        });
        return { status: res.status, body: await res.json() };
      },
    };
  });
  afterAll(async () => {
    await h?.core.dropDatabase();
    await h?.core.close();
  });
  return () => {
    if (!h) throw new Error("harness not initialised");
    return h;
  };
}
