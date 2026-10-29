import { createHmac, timingSafeEqual } from "node:crypto";
import type { ErrorResponse } from "@sumi/contract";
import type { Core } from "@sumi/core";
import { Hono } from "hono";
import { z } from "zod";

export interface GithubWebhookOptions {
  /** The secret configured on the GitHub webhook. Payloads without a valid signature are refused. */
  secret: string;
}

/** The part of GitHub's `pull_request` payload we use. */
const PullRequestPayloadSchema = z.object({
  action: z.string(),
  number: z.number().int().positive(),
  pull_request: z.object({
    title: z.string(),
    merged: z.boolean().optional().default(false),
    draft: z.boolean().optional().default(false),
    head: z.object({ ref: z.string() }),
  }),
  repository: z.object({ full_name: z.string() }),
});

function validSignature(secret: string, body: string, header: string | undefined): boolean {
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * `POST /webhooks/github`: moves tickets when pull requests change (ADR 0022).
 * Authenticated by GitHub's HMAC signature instead of a bearer token.
 */
export function githubWebhook(core: Core, { secret }: GithubWebhookOptions) {
  const app = new Hono();

  app.post("/webhooks/github", async (c) => {
    const body = await c.req.text(); // the signature covers the exact bytes, so read them raw
    if (!validSignature(secret, body, c.req.header("x-hub-signature-256"))) {
      const error: ErrorResponse = { error: { code: "unauthenticated", message: "Invalid webhook signature" } };
      return c.json(error, 401);
    }

    const event = c.req.header("x-github-event");
    if (event === "ping") return c.json({ ok: true });
    if (event !== "pull_request") return c.json({ ignored: event ?? null }, 202);

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
    const parsed = PullRequestPayloadSchema.safeParse(json);
    if (!parsed.success) {
      const error: ErrorResponse = { error: { code: "validation", message: "Unexpected pull_request payload" } };
      return c.json(error, 400);
    }
    const { action, number, pull_request: pr, repository } = parsed.data;
    const tickets = await core.github.syncPullRequest({
      repo: repository.full_name,
      number,
      branch: pr.head.ref,
      title: pr.title,
      action,
      merged: pr.merged,
      draft: pr.draft,
    });
    return c.json({ updated: tickets.map((t) => t.key) });
  });

  return app;
}
