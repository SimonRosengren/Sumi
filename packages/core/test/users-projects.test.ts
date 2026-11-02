import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();

describe("users", () => {
  it("creates humans and agents", async () => {
    const human = await core().users.create({ kind: "human", name: "Hanna", githubId: 1 });
    const agent = await core().users.create({ kind: "agent", name: "Claude" });
    expect(human.kind).toBe("human");
    expect(agent.kind).toBe("agent");
    expect(await core().users.get(human.id)).toEqual(human);
    expect(await core().users.get("missing")).toBeNull();
  });

  it("rejects a duplicate GitHub id", async () => {
    await core().users.create({ kind: "human", name: "A", githubId: 42 });
    await expect(core().users.create({ kind: "human", name: "B", githubId: 42 })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("lists users oldest first", async () => {
    const a = await core().users.create({ kind: "human", name: "First" });
    const b = await core().users.create({ kind: "agent", name: "Second" });
    const ids = (await core().users.list()).map((u) => u.id);
    expect(ids.indexOf(a.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it("allows many users without a GitHub id", async () => {
    await core().users.create({ kind: "agent", name: "a1" });
    await core().users.create({ kind: "agent", name: "a2" });
  });
});

describe("signInWithGithub", () => {
  it("creates a human on first sign-in and returns the same one afterwards", async () => {
    const first = await core().users.signInWithGithub({ githubId: 4242, name: "Octo Cat" });
    expect(first).toMatchObject({ kind: "human", name: "Octo Cat", githubId: 4242 });
    expect(await core().users.signInWithGithub({ githubId: 4242, name: "Renamed" })).toEqual(first);
  });

  it("creates one user when the first sign-ins race", async () => {
    const users = await Promise.all(
      Array.from({ length: 5 }, () => core().users.signInWithGithub({ githubId: 777, name: "Racer" })),
    );
    expect(new Set(users.map((u) => u.id)).size).toBe(1);
  });
});

describe("projects", () => {
  it("creates, lists and logs activity", async () => {
    const { alice } = await seed(core());
    expect((await core().projects.list()).map((p) => p.key)).toContain("SUMI");
    const log = await core().activity.list({ projectKey: "SUMI" });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: alice.id, action: "project.created" });
  });

  it("rejects a duplicate key, bad key and unknown actor", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    await core().projects.create(alice.id, { key: "DUP", name: "Dup" });
    await expect(core().projects.create(alice.id, { key: "DUP", name: "Again" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(core().projects.create(alice.id, { key: "bad key", name: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(core().projects.create("nobody", { key: "NOPE", name: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await core().projects.list()).map((p) => p.key)).not.toContain("NOPE");
  });
});

describe("deleting a project", () => {
  it("removes the project, its tickets and its activity, and leaves one entry", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    await core().projects.create(alice.id, { key: "GONE", name: "Gone" });
    await core().projects.create(alice.id, { key: "STAY", name: "Stay" });
    const gone = await core().tickets.create(alice.id, { projectKey: "GONE", title: "Doomed" });
    await core().comments.add(alice.id, gone.key, { body: "bye" });
    const stay = await core().tickets.create(alice.id, { projectKey: "STAY", title: "Kept" });

    await core().projects.delete(alice.id, "GONE");

    expect((await core().projects.list()).map((p) => p.key)).not.toContain("GONE");
    expect(await core().tickets.get(gone.key)).toBeNull();
    await expect(core().comments.list(gone.key)).rejects.toBeInstanceOf(NotFoundError);
    const log = await core().activity.list({ projectKey: "GONE" });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: alice.id, action: "project.deleted", data: { name: "Gone", tickets: 1 } });
    expect(await core().tickets.get(stay.key)).not.toBeNull();
    expect(await core().activity.list({ projectKey: "STAY" })).toHaveLength(2);
  });

  it("lets the key be reused with fresh ticket numbers and no old comments", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    await core().projects.create(alice.id, { key: "AGAIN", name: "One" });
    const first = await core().tickets.create(alice.id, { projectKey: "AGAIN", title: "Old" });
    await core().comments.add(alice.id, first.key, { body: "old comment" });
    await core().projects.delete(alice.id, "AGAIN");

    await core().projects.create(alice.id, { key: "AGAIN", name: "Two" });
    const second = await core().tickets.create(alice.id, { projectKey: "AGAIN", title: "New" });
    expect(second.key).toBe(first.key);
    expect(await core().comments.list(second.key)).toEqual([]);

    await core().projects.delete(alice.id, "AGAIN");
    const log = await core().activity.list({ projectKey: "AGAIN" });
    expect(log.map((e) => e.action)).toEqual(["project.deleted", "project.deleted"]);
  });

  it("is for humans, existing projects and valid keys", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const bot = await core().users.create({ kind: "agent", name: "Bot" });
    await core().projects.create(alice.id, { key: "SAFE", name: "Safe" });
    await expect(core().projects.delete(bot.id, "SAFE")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(core().projects.delete(alice.id, "NOPE")).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().projects.delete(alice.id, "bad key")).rejects.toBeInstanceOf(ValidationError);
    expect((await core().projects.list()).map((p) => p.key)).toContain("SAFE");
  });
});
