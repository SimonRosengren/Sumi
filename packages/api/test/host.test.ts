import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createHost } from "../src/host";
import { useApi } from "./helpers";

const api = useApi();

const dir = mkdtempSync(join(tmpdir(), "sumi-web-"));
mkdirSync(join(dir, "assets"));
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Sumi</title>");
writeFileSync(join(dir, "assets", "app.js"), "console.log('hi')");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// serveStatic resolves `root` against the working directory.
const host = () => createHost(api().app, relative(process.cwd(), dir));

describe("createHost", () => {
  it("is just the API when there is no web directory", async () => {
    const res = await createHost(api().app).fetch(new Request("http://x/health"));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves the API under /api and the web app at /", async () => {
    const health = await host().fetch(new Request("http://x/api/health"));
    expect(await health.json()).toEqual({ ok: true });

    const me = await host().fetch(
      new Request("http://x/api/me", { headers: { authorization: `Bearer ${api().token}` } }),
    );
    expect(me.status).toBe(200);

    const index = await host().fetch(new Request("http://x/"));
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("<title>Sumi</title>");

    const asset = await host().fetch(new Request("http://x/assets/app.js"));
    expect(await asset.text()).toBe("console.log('hi')");
  });

  it("falls back to index.html for unknown pages, but keeps API errors as JSON", async () => {
    const page = await host().fetch(new Request("http://x/some/page"));
    expect(await page.text()).toContain("<title>Sumi</title>");

    const missing = await host().fetch(new Request("http://x/api/nope", { headers: { authorization: `Bearer ${api().token}` } }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");

    const unauth = await host().fetch(new Request("http://x/api/me"));
    expect(unauth.status).toBe(401);
  });
});
