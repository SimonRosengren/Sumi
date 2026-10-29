import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../src";
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

  it("allows many users without a GitHub id", async () => {
    await core().users.create({ kind: "agent", name: "a1" });
    await core().users.create({ kind: "agent", name: "a2" });
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
