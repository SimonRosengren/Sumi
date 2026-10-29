/**
 * Starts the API against a throwaway database on a random port, for black-box
 * tests of clients (cli, mcp) that may not import core or the database driver.
 *
 * Prints one JSON line `{ "url": ..., "token": ... }` to stdout once ready (the
 * token belongs to a seeded human). Drops the database and exits on SIGTERM,
 * SIGINT, or when stdin closes (so it cleans up even if the parent dies).
 */
import { serve } from "@hono/node-server";
import { createCore } from "@sumi/core";
import { createApp } from "./app";
import { config } from "./config";

const core = await createCore({
  uri: config.mongoUri,
  dbName: `sumi_test_${crypto.randomUUID().replaceAll("-", "")}`,
});
const human = await core.users.create({ kind: "human", name: "Tester" });
const token = await core.tokens.create(human.id, human.id);

const server = serve({ fetch: createApp(core).fetch, port: 0 }, (info) => {
  console.log(JSON.stringify({ url: `http://localhost:${info.port}`, token }));
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await core.dropDatabase();
  await core.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("end", shutdown);
process.stdin.resume();
