import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "@sumi/contract";
import { NotFoundError, ValidationError } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();
let alice: User;
let bot: User;

beforeAll(async () => {
  ({ alice, bot } = await seed(core()));
  await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Discuss me" });
  await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Other" });
});

describe("comments", () => {
  it("adds comments attributed to the author and lists them oldest first", async () => {
    const first = await core().comments.add(alice.id, "SUMI-1", { body: "  Looks good  " });
    const second = await core().comments.add(bot.id, "SUMI-1", { body: "Working on it\n\n- step 1" });
    expect(first).toMatchObject({ ticketKey: "SUMI-1", authorId: alice.id, body: "Looks good" });

    const list = await core().comments.list("SUMI-1");
    expect(list.map((c) => [c.id, c.authorId, c.body])).toEqual([
      [first.id, alice.id, "Looks good"],
      [second.id, bot.id, "Working on it\n\n- step 1"],
    ]);
    expect(await core().comments.list("SUMI-2")).toEqual([]);
  });

  it("records a ticket.commented activity entry in the ticket's project", async () => {
    const comment = await core().comments.add(alice.id, "SUMI-2", { body: "Logged" });
    const [entry] = await core().activity.list({ ticketKey: "SUMI-2" });
    expect(entry).toMatchObject({
      id: comment.id,
      actorId: alice.id,
      action: "ticket.commented",
      projectKey: "SUMI",
      ticketKey: "SUMI-2",
      data: { body: "Logged" },
    });
  });

  it("does not change the ticket", async () => {
    const before = await core().tickets.get("SUMI-2");
    await core().comments.add(alice.id, "SUMI-2", { body: "Hello" });
    expect(await core().tickets.get("SUMI-2")).toEqual(before);
  });

  it("rejects empty and oversized bodies", async () => {
    await expect(core().comments.add(alice.id, "SUMI-1", { body: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(core().comments.add(alice.id, "SUMI-1", { body: "x".repeat(10_001) })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an unknown ticket or actor", async () => {
    await expect(core().comments.add(alice.id, "SUMI-99", { body: "hi" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().comments.list("SUMI-99")).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().comments.add("nobody", "SUMI-1", { body: "hi" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
