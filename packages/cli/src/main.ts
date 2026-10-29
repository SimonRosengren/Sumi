#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { run } from "./cli";

// Load the repo's .env (SUMI_URL, SUMI_TOKEN) if present. Variables already set win.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // no .env file: rely on the real environment
}

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
