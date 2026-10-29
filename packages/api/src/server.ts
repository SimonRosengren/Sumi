import { serve } from "@hono/node-server";
import { createCore } from "@sumi/core";
import { createApp } from "./app";
import { config, githubOptions } from "./config";

const github = githubOptions(); // fails fast on a half-configured GitHub sign-in
const core = await createCore({ uri: config.mongoUri });
const app = createApp(core, github ? { github } : {});
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`sumi api listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await core.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
