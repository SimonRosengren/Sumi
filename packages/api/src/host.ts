import { serveStatic } from "@hono/node-server/serve-static";
import type { ErrorResponse } from "@sumi/contract";
import { Hono } from "hono";
import type { App } from "./app";

/**
 * Without `webDir` (development) this is just the API at `/`; the Vite dev server serves the
 * board and proxies `/api` here. With `webDir` (deployed, ADR 0023) one server does both:
 * the API under `/api`, and the built web app at `/` with `index.html` as the fallback for
 * client-side routes. Either way the browser talks to `/api` on its own origin.
 */
export function createHost(api: App, webDir?: string): Pick<Hono, "fetch"> {
  if (!webDir) return api;
  const host = new Hono();
  host.route("/api", api);
  // An unknown API path must stay a JSON 404, not fall through to the web app below.
  host.all("/api/*", (c) => {
    const body: ErrorResponse = { error: { code: "not_found", message: "Route not found" } };
    return c.json(body, 404);
  });
  host.use("/*", serveStatic({ root: webDir }));
  host.get("*", serveStatic({ root: webDir, path: "index.html" }));
  return host;
}
