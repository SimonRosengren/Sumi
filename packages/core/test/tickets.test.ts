import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "@sumi/contract";
import { NotFoundError, ValidationError } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();
let alice: User;
let bot: User;

beforeAll(async () => {
  ({ alice, bot } = await seed(core()));
});

describe("create", () => {
  it("issues sequential keys with defaults", async () => {
    await core().projects.create(alice.id, { key: "SEQ", name: "Seq" });
    const a = await core().tickets.create(alice.id, { projectKey: "SEQ", title: "First" });
    const b = await core().tickets.create(alice.id, { projectKey: "SEQ", title: "Second" });
    expect([a.key, b.key]).toEqual(["SEQ-1", "SEQ-2"]);
    expect(a).toMatchObject({ status: "backlog", description: "", links: {}, number: 1 });
    expect(a.assigneeId).toBeUndefined();
  });

  it("issues distinct keys under concurrency", async () => {
    await core().projects.create(alice.id, { key: "CONC", name: "Conc" });
    const tickets = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        core().tickets.create(alice.id, { projectKey: "CONC", title: `t${i}` }),
      ),
    );
    expect(new Set(tickets.map((t) => t.key)).size).toBe(10);
  });

  it("stores optional fields and links", async () => {
    const t = await core().tickets.create(alice.id, {
      projectKey: "SUMI",
      title: "With extras",
      status: "todo",
      assigneeId: bot.id,
      priority: "high",
      links: { repo: "acme/sumi", branch: "feat/x", pr: 7 },
    });
    expect(t).toMatchObject({
      status: "todo",
      assigneeId: bot.id,
      priority: "high",
      links: { repo: "acme/sumi", branch: "feat/x", pr: 7 },
    });
  });

  it("rejects unknown project, assignee and actor, and invalid input", async () => {
    await expect(core().tickets.create(alice.id, { projectKey: "NONE", title: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      core().tickets.create(alice.id, { projectKey: "SUMI", title: "x", assigneeId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().tickets.create("ghost", { projectKey: "SUMI", title: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(core().tickets.create(alice.id, { projectKey: "SUMI", title: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("does not consume a number when creation fails", async () => {
    await core().projects.create(alice.id, { key: "ROLL", name: "Roll" });
    await expect(
      core().tickets.create(alice.id, { projectKey: "ROLL", title: "x", assigneeId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const t = await core().tickets.create(alice.id, { projectKey: "ROLL", title: "ok" });
    expect(t.key).toBe("ROLL-1");
  });
});

describe("get and list", () => {
  it("gets by key and returns null when missing", async () => {
    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Find me" });
    expect(await core().tickets.get(t.key)).toEqual(t);
    expect(await core().tickets.get("SUMI-99999")).toBeNull();
  });

  it("filters by status and assignee, ordered by number", async () => {
    await core().projects.create(alice.id, { key: "LST", name: "List" });
    await core().tickets.create(alice.id, { projectKey: "LST", title: "a", status: "todo" });
    await core().tickets.create(alice.id, { projectKey: "LST", title: "b", status: "done", assigneeId: bot.id });
    await core().tickets.create(alice.id, { projectKey: "LST", title: "c", status: "todo", assigneeId: bot.id });
    const all = await core().tickets.list({ projectKey: "LST" });
    expect(all.map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect((await core().tickets.list({ projectKey: "LST", status: "todo" })).map((t) => t.title)).toEqual([
      "a",
      "c",
    ]);
    expect((await core().tickets.list({ projectKey: "LST", assigneeId: bot.id })).map((t) => t.title)).toEqual([
      "b",
      "c",
    ]);
  });
});

describe("update", () => {
  it("changes only provided fields and clears with null", async () => {
    const t = await core().tickets.create(alice.id, {
      projectKey: "SUMI",
      title: "Old",
      description: "keep",
      assigneeId: bot.id,
      priority: "low",
    });
    const u = await core().tickets.update(bot.id, t.key, { title: "New", assigneeId: null, priority: "high" });
    expect(u).toMatchObject({ title: "New", description: "keep", priority: "high" });
    expect(u.assigneeId).toBeUndefined();
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(t.updatedAt.getTime());

    const cleared = await core().tickets.update(bot.id, t.key, { priority: null });
    expect(cleared.priority).toBeUndefined();
    expect(await core().tickets.get(t.key)).toEqual(cleared);
  });

  it("rejects empty updates, unknown tickets and unknown assignees", async () => {
    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "x" });
    await expect(core().tickets.update(alice.id, t.key, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(core().tickets.update(alice.id, "SUMI-99999", { title: "y" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(core().tickets.update(alice.id, t.key, { assigneeId: "ghost" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("move", () => {
  it("changes status and logs from/to", async () => {
    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Move me" });
    const moved = await core().tickets.move(bot.id, t.key, { status: "in_review" });
    expect(moved.status).toBe("in_review");
    expect((await core().tickets.get(t.key))?.status).toBe("in_review");
    const [entry] = await core().activity.list({ ticketKey: t.key, limit: 1 });
    expect(entry).toMatchObject({ actorId: bot.id, action: "ticket.moved", data: { from: "backlog", to: "in_review" } });
  });

  it("is a no-op without activity when the status is unchanged", async () => {
    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Same" });
    const same = await core().tickets.move(alice.id, t.key, { status: "backlog" });
    expect(same).toEqual(t);
    expect(await core().activity.list({ ticketKey: t.key })).toHaveLength(1);
  });

  it("rejects unknown tickets and invalid statuses", async () => {
    await expect(core().tickets.move(alice.id, "SUMI-99999", { status: "done" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      core().tickets.move(alice.id, "SUMI-1", { status: "nope" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("claimNext", () => {
  it("takes the oldest unassigned todo, assigns it and starts it", async () => {
    await core().projects.create(alice.id, { key: "CLM", name: "Claim" });
    await core().tickets.create(alice.id, { projectKey: "CLM", title: "backlog", status: "backlog" });
    await core().tickets.create(alice.id, { projectKey: "CLM", title: "taken", status: "todo", assigneeId: alice.id });
    const first = await core().tickets.create(alice.id, { projectKey: "CLM", title: "first", status: "todo" });
    await core().tickets.create(alice.id, { projectKey: "CLM", title: "second", status: "todo" });

    const claimed = await core().tickets.claimNext(bot.id, { projectKey: "CLM" });
    expect(claimed).toMatchObject({ key: first.key, status: "in_progress", assigneeId: bot.id });
    const [entry] = await core().activity.list({ ticketKey: first.key, limit: 1 });
    expect(entry).toMatchObject({ actorId: bot.id, action: "ticket.claimed" });
  });

  it("also picks up todo tickets already assigned to the actor", async () => {
    await core().projects.create(alice.id, { key: "MINE", name: "Mine" });
    const t = await core().tickets.create(alice.id, {
      projectKey: "MINE",
      title: "for bot",
      status: "todo",
      assigneeId: bot.id,
    });
    expect((await core().tickets.claimNext(bot.id, { projectKey: "MINE" }))?.key).toBe(t.key);
  });

  it("returns null when nothing is available", async () => {
    await core().projects.create(alice.id, { key: "EMPTY", name: "Empty" });
    expect(await core().tickets.claimNext(bot.id, { projectKey: "EMPTY" })).toBeNull();
  });

  it("never hands the same ticket to two actors", async () => {
    await core().projects.create(alice.id, { key: "RACE", name: "Race" });
    for (let i = 0; i < 3; i++) {
      await core().tickets.create(alice.id, { projectKey: "RACE", title: `t${i}`, status: "todo" });
    }
    const agents = await Promise.all(
      Array.from({ length: 8 }, (_, i) => core().users.create({ kind: "agent", name: `agent${i}` })),
    );
    const results = await Promise.all(
      agents.map((a) => core().tickets.claimNext(a.id, { projectKey: "RACE" })),
    );
    const keys = results.filter((t) => t !== null).map((t) => t.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("activity", () => {
  it("attributes every ticket mutation to its actor, newest first", async () => {
    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Audit" });
    await core().tickets.update(bot.id, t.key, { title: "Audit 2" });
    await core().tickets.move(alice.id, t.key, { status: "todo" });
    const log = await core().activity.list({ ticketKey: t.key });
    expect(log.map((e) => [e.action, e.actorId])).toEqual([
      ["ticket.moved", alice.id],
      ["ticket.updated", bot.id],
      ["ticket.created", alice.id],
    ]);
  });
});
