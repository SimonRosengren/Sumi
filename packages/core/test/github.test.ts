import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "@sumi/contract";
import { GITHUB_USER_ID, statusForPullRequest, type PullRequestEvent } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();
let alice: User;

beforeAll(async () => {
  ({ alice } = await seed(core()));
  await core().projects.create(alice.id, { key: "GH", name: "GitHub" });
});

const pr = (over: Partial<PullRequestEvent> = {}): PullRequestEvent => ({
  repo: "acme/app",
  number: 5,
  branch: "feature/thing",
  title: "A change",
  action: "opened",
  merged: false,
  draft: false,
  ...over,
});

const make = (over: { title: string; links?: { repo?: string; branch?: string; pr?: number } } & Record<string, unknown>) =>
  core().tickets.create(alice.id, { projectKey: "GH", status: "in_progress", ...over });

describe("statusForPullRequest", () => {
  it.each([
    [{ action: "opened" }, "in_review"],
    [{ action: "reopened" }, "in_review"],
    [{ action: "ready_for_review" }, "in_review"],
    [{ action: "opened", draft: true }, "in_progress"],
    [{ action: "converted_to_draft" }, "in_progress"],
    [{ action: "closed", merged: true }, "done"],
    [{ action: "closed", merged: false }, null],
    [{ action: "synchronize" }, null],
    [{ action: "labeled" }, null],
  ] as const)("%j -> %s", (event, expected) => {
    expect(statusForPullRequest(pr(event))).toBe(expected);
  });
});

describe("syncPullRequest", () => {
  it("moves a ticket named in the branch to review, links the PR, and attributes it to GitHub", async () => {
    const t = await make({ title: "From branch" });
    const [moved] = await core().github.syncPullRequest(pr({ branch: `${t.key.toLowerCase()}-fix`, number: 11 }));
    expect(moved).toMatchObject({
      key: t.key,
      status: "in_review",
      links: { repo: "acme/app", branch: `${t.key.toLowerCase()}-fix`, pr: 11 },
    });

    const user = await core().users.get(GITHUB_USER_ID);
    expect(user).toMatchObject({ kind: "agent", name: "GitHub" });
    const entries = await core().activity.list({ ticketKey: t.key });
    expect(entries.filter((e) => e.actorId === GITHUB_USER_ID).map((e) => e.action).sort()).toEqual([
      "ticket.moved",
      "ticket.updated",
    ]);
  });

  it("finds a ticket by key in the title", async () => {
    const t = await make({ title: "From title" });
    const [moved] = await core().github.syncPullRequest(pr({ title: `Fix the thing (${t.key})`, number: 12 }));
    expect(moved?.key).toBe(t.key);
  });

  it("finds a ticket by its linked PR number or branch, and moves it to done when merged", async () => {
    const byPr = await make({ title: "By PR", links: { repo: "acme/app", pr: 20 } });
    const byBranch = await make({ title: "By branch", links: { repo: "acme/app", branch: "x/linked" } });

    const [a] = await core().github.syncPullRequest(pr({ number: 20, branch: "anything", action: "closed", merged: true }));
    expect(a).toMatchObject({ key: byPr.key, status: "done" });
    const [b] = await core().github.syncPullRequest(
      pr({ number: 21, branch: "x/linked", action: "closed", merged: true }),
    );
    expect(b).toMatchObject({ key: byBranch.key, status: "done", links: { pr: 21 } });
  });

  it("does nothing for events that do not change status, and for unknown tickets", async () => {
    const t = await make({ title: "Untouched" });
    expect(await core().github.syncPullRequest(pr({ branch: t.key, action: "synchronize" }))).toEqual([]);
    expect(await core().github.syncPullRequest(pr({ branch: t.key, action: "closed", merged: false }))).toEqual([]);
    expect(await core().github.syncPullRequest(pr({ branch: "GH-9999", title: "nothing here" }))).toEqual([]);
    expect((await core().tickets.get(t.key))?.status).toBe("in_progress");
  });

  it("ignores a key mention when the ticket is linked to another repo", async () => {
    const t = await make({ title: "Other repo", links: { repo: "acme/other" } });
    expect(await core().github.syncPullRequest(pr({ branch: t.key }))).toEqual([]);
    expect((await core().tickets.get(t.key))?.status).toBe("in_progress");
  });

  it("is idempotent: a repeated event writes no extra activity", async () => {
    const t = await make({ title: "Twice" });
    await core().github.syncPullRequest(pr({ branch: t.key, number: 30 }));
    const before = (await core().activity.list({ ticketKey: t.key })).length;
    await core().github.syncPullRequest(pr({ branch: t.key, number: 30 }));
    expect((await core().activity.list({ ticketKey: t.key })).length).toBe(before);
  });

  it("moves several tickets named by one PR", async () => {
    const a = await make({ title: "A" });
    const b = await make({ title: "B" });
    const moved = await core().github.syncPullRequest(pr({ title: `${a.key} and ${b.key}`, branch: "multi", number: 40 }));
    expect(moved.map((t) => t.key)).toEqual([a.key, b.key]);
  });
});
