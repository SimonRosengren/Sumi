import { beforeAll, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();
let actor: string;
beforeAll(async () => { actor = (await seed(core())).alice.id; });

async function project(key: string) {
  await core().projects.create(actor, { key, name: key });
  return (await core().boards.list(key))[0]!;
}

describe("boards", () => {
  it("starts with General, creates and renames stable boards, and attributes changes", async () => {
    const general = await project("BOARD");
    expect(general).toMatchObject({ name: "General", projectKey: "BOARD" });
    const bugs = await core().boards.create(actor, { projectKey: "BOARD", name: " Bugs " });
    expect(await core().boards.rename(actor, bugs.id, { name: "Defects" })).toMatchObject({ id: bugs.id, name: "Defects" });
    const before = await core().activity.list({ projectKey: "BOARD" });
    await core().boards.rename(actor, bugs.id, { name: "Defects" });
    expect(await core().activity.list({ projectKey: "BOARD" })).toEqual(before);
    expect(before).toContainEqual(expect.objectContaining({ actorId: actor, action: "board.renamed", data: { boardId: bugs.id, from: "Bugs", to: "Defects" } }));
    expect(await core().boards.list("BOARD")).toHaveLength(2);
    await expect(core().boards.create(actor, { projectKey: "BOARD", name: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(core().boards.create(actor, { projectKey: "NONE", name: "Bugs" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().boards.rename("missing", bugs.id, { name: "No" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires an explicit board with multiple boards and keeps project-wide numbering", async () => {
    const general = await project("NUMBER");
    const first = await core().tickets.create(actor, { projectKey: "NUMBER", title: "First" });
    expect(first.boardId).toBe(general.id);
    const bugs = await core().boards.create(actor, { projectKey: "NUMBER", name: "Bugs" });
    await expect(core().tickets.create(actor, { projectKey: "NUMBER", title: "Ambiguous" })).rejects.toBeInstanceOf(ValidationError);
    const other = await project("OTHER");
    await expect(core().tickets.create(actor, { projectKey: "NUMBER", boardId: other.id, title: "Wrong" })).rejects.toBeInstanceOf(NotFoundError);
    const second = await core().tickets.create(actor, { projectKey: "NUMBER", boardId: bugs.id, title: "Second" });
    expect(second.key).toBe("NUMBER-2");
    expect((await core().tickets.list({ projectKey: "NUMBER" })).map((t) => t.key)).toEqual([first.key, second.key]);
    expect(await core().tickets.list({ projectKey: "NUMBER", boardId: bugs.id })).toEqual([second]);
    await expect(core().tickets.list({ projectKey: "NUMBER", boardId: other.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("transfers without losing status, fields, comments or history; rejects cross-project transfer", async () => {
    const general = await project("TRANSFER");
    const bugs = await core().boards.create(actor, { projectKey: "TRANSFER", name: "Bugs" });
    const before = await core().tickets.create(actor, { projectKey: "TRANSFER", boardId: general.id, title: "Keep", status: "in_review", priority: "high", links: { repo: "acme/sumi", pr: 7 } });
    const comment = await core().comments.add(actor, before.key, { body: "History" });
    const after = await core().tickets.transfer(actor, before.key, { boardId: bugs.id });
    expect(after).toEqual({ ...before, boardId: bugs.id, updatedAt: expect.any(Date) });
    expect(await core().comments.list(before.key)).toEqual([comment]);
    const history = await core().activity.list({ ticketKey: before.key });
    expect(history).toContainEqual(expect.objectContaining({ actorId: actor, action: "ticket.transferred", data: { from: general.id, to: bugs.id, fromStatus: "in_review", toStatus: "in_review" } }));
    await core().tickets.transfer(actor, before.key, { boardId: bugs.id });
    expect(await core().activity.list({ ticketKey: before.key })).toEqual(history);
    const other = await project("FOREIGN");
    await expect(core().tickets.transfer(actor, before.key, { boardId: other.id })).rejects.toBeInstanceOf(NotFoundError);
    expect((await core().tickets.get(before.key))?.boardId).toBe(bugs.id);
    await expect(core().boards.setLanes(actor, bugs.id, { lanes: [{ id: "todo", name: "Todo" }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("claims within a board or across the project, atomically", async () => {
    const general = await project("SCOPED");
    const bugs = await core().boards.create(actor, { projectKey: "SCOPED", name: "Bugs" });
    const first = await core().tickets.create(actor, { projectKey: "SCOPED", boardId: general.id, title: "First", status: "todo" });
    const second = await core().tickets.create(actor, { projectKey: "SCOPED", boardId: bugs.id, title: "Second", status: "todo" });
    const claims = await Promise.all(Array.from({ length: 3 }, () => core().tickets.claimNext(actor, { projectKey: "SCOPED", boardId: bugs.id })));
    expect(claims.filter(Boolean).map((t) => t!.key)).toEqual([second.key]);
    expect((await core().tickets.claimNext(actor, { projectKey: "SCOPED" }))?.key).toBe(first.key);
    await expect(core().tickets.claimNext(actor, { projectKey: "SCOPED", boardId: "missing" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses occupied and last-board deletion; project deletion removes boards", async () => {
    const general = await project("DELETE");
    await expect(core().boards.delete(actor, general.id)).rejects.toBeInstanceOf(ConflictError);
    const bugs = await core().boards.create(actor, { projectKey: "DELETE", name: "Bugs" });
    const ticket = await core().tickets.create(actor, { projectKey: "DELETE", boardId: bugs.id, title: "Occupied" });
    await expect(core().boards.delete(actor, bugs.id)).rejects.toBeInstanceOf(ConflictError);
    await core().tickets.transfer(actor, ticket.key, { boardId: general.id });
    await core().boards.delete(actor, bugs.id);
    expect(await core().boards.list("DELETE")).toEqual([general]);
    expect(await core().activity.list({ projectKey: "DELETE" })).toContainEqual(expect.objectContaining({ actorId: actor, action: "board.deleted", data: { boardId: bugs.id, name: "Bugs" } }));
    await core().projects.delete(actor, "DELETE");
    await expect(core().boards.rename(actor, general.id, { name: "Gone" })).rejects.toBeInstanceOf(NotFoundError);
    await core().projects.create(actor, { key: "DELETE", name: "Reused" });
    expect(await core().boards.list("DELETE")).toHaveLength(1);
  });

  it("serializes deletion against ticket creation and transfer", async () => {
    const general = await project("RACE");
    const bugs = await core().boards.create(actor, { projectKey: "RACE", name: "Bugs" });
    const outcomes = await Promise.allSettled([
      core().boards.delete(actor, bugs.id),
      core().tickets.create(actor, { projectKey: "RACE", boardId: bugs.id, title: "Racing" }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const boards = await core().boards.list("RACE");
    for (const ticket of await core().tickets.list({ projectKey: "RACE" })) expect(boards.some((b) => b.id === ticket.boardId)).toBe(true);

    const target = await core().boards.create(actor, { projectKey: "RACE", name: "Target" });
    const ticket = await core().tickets.create(actor, { projectKey: "RACE", boardId: general.id, title: "Transfer race" });
    const transfers = await Promise.allSettled([
      core().boards.delete(actor, target.id),
      core().tickets.transfer(actor, ticket.key, { boardId: target.id }),
    ]);
    expect(transfers.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect((await core().boards.list("RACE")).some((b) => b.id === (transfers[1]?.status === "fulfilled" ? target.id : general.id))).toBe(true);
  });
});
