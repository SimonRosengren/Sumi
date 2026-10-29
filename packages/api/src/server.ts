import { serve } from "@hono/node-server";
import { createCore } from "@sumi/core";
import { createApp } from "./app";
import { config } from "./config";

const core = await createCore({ uri: config.mongoUri });
const server = serve({ fetch: createApp(core).fetch, port: config.port }, (info) => {
  console.log(`sumi api listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await core.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
