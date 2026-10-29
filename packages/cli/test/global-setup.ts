import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    apiToken: string;
  }
}

const apiDir = fileURLToPath(new URL("../../api", import.meta.url));

/**
 * The cli may not import core or the database driver, so tests talk to a real
 * API started as a separate process on a throwaway database (see the api
 * package's test-server.ts). Closing its stdin makes it clean up after itself.
 */
export default async function setup(project: TestProject) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/test-server.ts"], {
    cwd: apiDir,
    stdio: ["pipe", "pipe", "inherit"],
  });
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));

  const first = await new Promise<string>((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    lines.once("line", resolve);
    child.once("exit", (code) => reject(new Error(`test-server exited early (code ${code}). Is \`pnpm dev:db\` running?`)));
    setTimeout(() => reject(new Error("test-server did not start within 30s")), 30_000).unref();
  });
  const { url, token } = JSON.parse(first) as { url: string; token: string };
  project.provide("apiUrl", url);
  project.provide("apiToken", token);

  return async () => {
    child.stdin.end();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
    child.kill("SIGTERM");
  };
}
