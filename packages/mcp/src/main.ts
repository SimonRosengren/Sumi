#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { createClient } from "@sumi/client";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

// Load the repo's .env (SUMI_URL, SUMI_TOKEN) if present. Variables already set win.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // no .env file: rely on the real environment
}

// stdout carries the protocol, so every message to humans goes to stderr.
const token = process.env.SUMI_TOKEN;
if (!token) {
  console.error("SUMI_TOKEN is not set. Create one with `pnpm bootstrap <name>` or `sumi agent create <name>`.");
  process.exit(1);
}

const client = createClient({ url: process.env.SUMI_URL || "http://localhost:3000", token });
await createServer(client).connect(new StdioServerTransport());
