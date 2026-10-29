/**
 * Creates the first human user and prints an API token for them. Needed because
 * every API call is authenticated and GitHub sign-in is not built yet.
 * Usage: pnpm --filter @sumi/api bootstrap <name>
 */
import { createCore } from "@sumi/core";
import { config } from "./config";

const name = process.argv[2]?.trim();
if (!name) {
  console.error("Usage: pnpm --filter @sumi/api bootstrap <name>");
  process.exit(1);
}

const core = await createCore({ uri: config.mongoUri });
try {
  const user = await core.users.create({ kind: "human", name });
  const token = await core.tokens.create(user.id, user.id);
  console.log(`Created human "${user.name}" (${user.id}).`);
  console.log(`Token (shown once, store it safely):\n${token}`);
} finally {
  await core.close();
}
