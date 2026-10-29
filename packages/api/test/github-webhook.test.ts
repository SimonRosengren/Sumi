import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { GITHUB_USER_ID } from "@sumi/core";
import { useApi } from "./helpers";

const SECRET = "whsec";
const api = useApi({ githubWebhook: { secret: SECRET } });

beforeAll(async () => {
  await api().call("POST", "/projects", { body: { key: "HOOK", name: "Hooks" } });
});

const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

async function deliver(event: string, payload: unknown, opts: { signature?: string | null } = {}) {
  const body = JSON.stringify(payload);
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  const res = await api().app.request("/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      ...(signature ? { "x-hub-signature-256": signature } : {}),
    },
    body,
  });
  return { status: res.status, body: await res.json() };
}

const pullRequest = (over: Record<string, unknown> = {}, pr: Record<string, unknown> = {}) => ({
  action: "opened",
  number: 3,
  pull_request: { title: "Work", merged: false, draft: false, head: { ref: "feat/work" }, ...pr },
  repository: { full_name: "acme/app" },
  ...over,
});

describe("POST /webhooks/github", () => {
  it("moves the ticket named in the branch as the PR opens and merges", async () => {
    const t = (await api().call("POST", "/tickets", { body: { projectKey: "HOOK", title: "Ship", status: "in_progress" } })).body;
    const branch = `${t.key}-ship`;

    const opened = await deliver("pull_request", pullRequest({ number: 8 }, { head: { ref: branch } }));
    expect(opened).toEqual({ status: 200, body: { updated: [t.key] } });
    let now = (await api().call("GET", `/tickets/${t.key}`)).body;
    expect(now).toMatchObject({ status: "in_review", links: { repo: "acme/app", branch, pr: 8 } });

    const merged = await deliver(
      "pull_request",
      pullRequest({ action: "closed", number: 8 }, { merged: true, head: { ref: branch } }),
    );
    expect(merged.body).toEqual({ updated: [t.key] });
    now = (await api().call("GET", `/tickets/${t.key}`)).body;
    expect(now.status).toBe("done");

    const history = (await api().call("GET", `/activity?ticketKey=${t.key}`)).body as { actorId: string }[];
    expect(history.some((e) => e.actorId === GITHUB_USER_ID)).toBe(true);
  });

  it("answers ping and ignores other events", async () => {
    expect(await deliver("ping", { zen: "Keep it logically awesome." })).toEqual({ status: 200, body: { ok: true } });
    expect(await deliver("push", { ref: "refs/heads/main" })).toEqual({ status: 202, body: { ignored: "push" } });
  });

  it("refuses missing, wrong and mismatched signatures", async () => {
    const payload = pullRequest();
    for (const signature of [null, "sha256=deadbeef", sign(JSON.stringify(payload), "other-secret")]) {
      const res = await deliver("pull_request", payload, { signature });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    }
  });

  it("rejects a pull_request payload it cannot read", async () => {
    const res = await deliver("pull_request", { action: "opened" });
    expect(res.status).toBe(400);
  });
});
