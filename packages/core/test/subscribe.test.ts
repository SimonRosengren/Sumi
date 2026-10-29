import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ActivityEntry, User } from "@sumi/contract";
import { seed, useCore } from "./helpers";

const core = useCore();
let alice: User;

beforeAll(async () => {
  ({ alice } = await seed(core()));
});

describe("activity.subscribe", () => {
  it("delivers entries written after it resolves, and nothing after unsubscribing", async () => {
    const seen: ActivityEntry[] = [];
    const stop = await core().activity.subscribe((e) => seen.push(e), (err) => { throw err; });

    const t = await core().tickets.create(alice.id, { projectKey: "SUMI", title: "Live" });
    await core().tickets.move(alice.id, t.key, { status: "todo" });
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen.map((e) => [e.action, e.ticketKey, e.projectKey])).toEqual([
      ["ticket.created", "SUMI-1", "SUMI"],
      ["ticket.moved", "SUMI-1", "SUMI"],
    ]);
    expect(seen[1]?.actorId).toBe(alice.id);

    await stop();
    await core().tickets.move(alice.id, t.key, { status: "done" });
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toHaveLength(2);
  });

  it("does not replay entries written before subscribing", async () => {
    const seen: ActivityEntry[] = [];
    const stop = await core().activity.subscribe((e) => seen.push(e), (err) => { throw err; });
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);
    await stop();
  });
});
