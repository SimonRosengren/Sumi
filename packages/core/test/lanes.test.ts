import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_LANES, type User } from "@sumi/contract";
import { ConflictError, NotFoundError, ValidationError } from "../src";
import { seed, useCore } from "./helpers";

const core = useCore();
let alice: User;
let bot: User;

beforeAll(async () => {
  ({ alice, bot } = await seed(core()));
});

const defaults = () => DEFAULT_LANES.map(({ id, name }) => ({ id, name }));
const ids = (lanes: readonly { id: string }[]) => lanes.map((l) => l.id);
const lanesOf = async (key: string) => (await core().boards.get(`${key}-general`)).lanes;

async function project(key: string) {
  await core().projects.create(alice.id, { key, name: key });
}

describe("lanes", () => {
  it("start as the default five", async () => {
    await project("LDEF");
    expect(await lanesOf("LDEF")).toEqual(DEFAULT_LANES);
  });

  it("can be renamed and reordered without changing their ids", async () => {
    await project("LREN");
    const lane = (id: string) => ({ id, name: DEFAULT_LANES.find((l) => l.id === id)?.name ?? id });
    const saved = await core().boards.setLanes(alice.id, "LREN-general", {
      lanes: [lane("todo"), { ...lane("backlog"), name: "Icebox" }, lane("in_progress"), lane("done"), lane("in_review")],
    });
    expect(saved.lanes.map((l) => `${l.id}:${l.name}`)).toEqual([
      "todo:Todo",
      "backlog:Icebox",
      "in_progress:In progress",
      "done:Done",
      "in_review:In review",
    ]);
    expect(await lanesOf("LREN")).toEqual(saved.lanes);
  });

  it("get an id made from their name when added", async () => {
    await project("LADD");
    const saved = await core().boards.setLanes(alice.id, "LADD-general", {
      lanes: [...defaults(), { name: "QA / Staging" }, { name: "QA staging" }, { name: "!!!" }],
    });
    expect(ids(saved.lanes).slice(5)).toEqual(["qa_staging", "qa_staging_2", "lane"]);
  });

  it("never reuse the id of an existing lane", async () => {
    await project("LDUP");
    const saved = await core().boards.setLanes(alice.id, "LDUP-general", { lanes: [...defaults(), { name: "Done" }] });
    expect(ids(saved.lanes).at(-1)).toBe("done_2");
  });

  it("can be removed when empty, but not while they hold tickets", async () => {
    await project("LDEL");
    const t = await core().tickets.create(alice.id, { projectKey: "LDEL", title: "x", status: "todo" });
    const withoutTodo = defaults().filter((l) => l.id !== "todo");
    await expect(core().boards.setLanes(alice.id, "LDEL-general", { lanes: withoutTodo })).rejects.toBeInstanceOf(ConflictError);
    expect(await lanesOf("LDEL")).toEqual(DEFAULT_LANES);

    await core().tickets.move(alice.id, t.key, { status: "done" });
    const saved = await core().boards.setLanes(alice.id, "LDEL-general", { lanes: withoutTodo });
    expect(ids(saved.lanes)).toEqual(["backlog", "in_progress", "in_review", "done"]);
  });

  it("are validated", async () => {
    await project("LBAD");
    const set = (lanes: { id?: string; name: string }[]) => core().boards.setLanes(alice.id, "LBAD-general", { lanes });
    await expect(set([])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ name: "   " }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ name: "x".repeat(41) }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set(Array.from({ length: 21 }, (_, i) => ({ name: `L${i}` })))).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ id: "nope", name: "Nope" }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ id: "todo", name: "A" }, { id: "todo", name: "B" }])).rejects.toBeInstanceOf(ValidationError);
    await expect(core().boards.setLanes(alice.id, "NOPE", { lanes: [{ name: "A" }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().boards.setLanes("missing", "LBAD-general", { lanes: [{ name: "A" }] })).rejects.toBeInstanceOf(NotFoundError);
    expect(await lanesOf("LBAD")).toEqual(DEFAULT_LANES);
  });

  it("are recorded in the activity log, and an unchanged list is not", async () => {
    await project("LLOG");
    await core().boards.setLanes(bot.id, "LLOG-general", { lanes: defaults() });
    expect((await core().activity.list({ projectKey: "LLOG" })).map((e) => e.action).sort()).toEqual(["board.created", "project.created"]);

    await core().boards.setLanes(bot.id, "LLOG-general", { lanes: [{ id: "todo", name: "Ready" }] });
    const [entry] = await core().activity.list({ projectKey: "LLOG", limit: 1 });
    expect(entry).toMatchObject({
      actorId: bot.id,
      action: "board.lanes_updated",
      data: { boardId: "LLOG-general", lanes: [{ id: "todo", name: "Ready" }] },
    });
  });
});

describe("tickets and lanes", () => {
  it("keeps each board's names, order and lane removals independent", async () => {
    await project("LOCAL");
    const bugs = await core().boards.create(alice.id, { projectKey: "LOCAL", name: "Bugs" });
    await core().tickets.create(alice.id, { projectKey: "LOCAL", boardId: bugs.id, title: "Bug", status: "todo" });
    const general = await core().boards.setLanes(alice.id, "LOCAL-general", {
      lanes: [{ id: "done", name: "Shipped" }, { name: "Inbox" }],
    });
    expect(general.lanes).toEqual([{ id: "done", name: "Shipped" }, { id: "inbox", name: "Inbox" }]);
    expect((await core().boards.get(bugs.id)).lanes).toEqual(DEFAULT_LANES);
    await expect(core().boards.setLanes(alice.id, bugs.id, { lanes: [{ id: "done", name: "Done" }] })).rejects.toBeInstanceOf(ConflictError);
    const t = await core().tickets.create(alice.id, { projectKey: "LOCAL", boardId: general.id, title: "Feature" });
    expect(t.status).toBe("done");
    await expect(core().tickets.move(alice.id, t.key, { status: "todo" })).rejects.toBeInstanceOf(ValidationError);
    await expect(core().tickets.create(alice.id, { projectKey: "LOCAL", boardId: bugs.id, title: "Wrong lane", status: "inbox" })).rejects.toBeInstanceOf(ValidationError);
    const fresh = await core().boards.create(alice.id, { projectKey: "LOCAL", name: "Fresh" });
    expect(fresh.lanes).toEqual(DEFAULT_LANES);
  });

  it("transfers to the destination's first lane when the source status is missing", async () => {
    await project("MAP");
    const bugs = await core().boards.create(alice.id, { projectKey: "MAP", name: "Bugs" });
    await core().boards.setLanes(alice.id, bugs.id, { lanes: [{ name: "Triage" }, { name: "Fixed" }] });
    const before = await core().tickets.create(alice.id, { projectKey: "MAP", boardId: "MAP-general", title: "Transfer", status: "in_review" });
    const after = await core().tickets.transfer(alice.id, before.key, { boardId: bugs.id });
    expect(after).toMatchObject({ key: before.key, status: "triage", boardId: bugs.id });
    expect((await core().activity.list({ ticketKey: before.key }))[0]).toMatchObject({
      action: "ticket.transferred", data: { fromStatus: "in_review", toStatus: "triage" },
    });
  });

  it("claims only from boards with both required lanes, including project-wide claims", async () => {
    await project("ELIGIBLE");
    const bugs = await core().boards.create(alice.id, { projectKey: "ELIGIBLE", name: "Bugs" });
    await core().boards.setLanes(alice.id, "ELIGIBLE-general", { lanes: defaults().filter((l) => l.id !== "in_progress") });
    await core().tickets.create(alice.id, { projectKey: "ELIGIBLE", boardId: "ELIGIBLE-general", title: "Skip", status: "todo" });
    const ready = await core().tickets.create(alice.id, { projectKey: "ELIGIBLE", boardId: bugs.id, title: "Claim", status: "todo" });
    expect((await core().tickets.claimNext(bot.id, { projectKey: "ELIGIBLE" }))?.key).toBe(ready.key);
    expect(await core().tickets.claimNext(bot.id, { projectKey: "ELIGIBLE" })).toBeNull();
    await expect(core().tickets.claimNext(bot.id, { projectKey: "ELIGIBLE", boardId: "ELIGIBLE-general" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("applies GitHub status changes according to each board's lanes", async () => {
    await project("BOARDGH");
    const bugs = await core().boards.create(alice.id, { projectKey: "BOARDGH", name: "Bugs" });
    await core().boards.setLanes(alice.id, bugs.id, { lanes: defaults().filter((l) => l.id !== "in_review") });
    const links = { repo: "acme/boards", pr: 8 };
    const feature = await core().tickets.create(alice.id, { projectKey: "BOARDGH", boardId: "BOARDGH-general", title: "Feature", status: "todo", links });
    const bug = await core().tickets.create(alice.id, { projectKey: "BOARDGH", boardId: bugs.id, title: "Bug", status: "todo", links });
    const synced = await core().github.syncPullRequest({ repo: "acme/boards", number: 8, branch: "work", title: "PR", action: "opened", merged: false, draft: false });
    expect(synced.find((t) => t.key === feature.key)?.status).toBe("in_review");
    expect(synced.find((t) => t.key === bug.key)).toMatchObject({ status: "todo", links: { branch: "work" } });
  });

  it("serializes lane removal against ticket creation and moves", async () => {
    await project("LANERACE");
    const outcomes = await Promise.allSettled([
      core().boards.setLanes(alice.id, "LANERACE-general", { lanes: defaults().filter((l) => l.id !== "todo") }),
      core().tickets.create(alice.id, { projectKey: "LANERACE", title: "Race", status: "todo" }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const laneIds = new Set((await core().boards.get("LANERACE-general")).lanes.map((l) => l.id));
    for (const ticket of await core().tickets.list({ projectKey: "LANERACE" })) expect(laneIds.has(ticket.status)).toBe(true);

    await project("MOVERACE");
    const ticket = await core().tickets.create(alice.id, { projectKey: "MOVERACE", title: "Move race" });
    const moves = await Promise.allSettled([
      core().boards.setLanes(alice.id, "MOVERACE-general", { lanes: defaults().filter((l) => l.id !== "todo") }),
      core().tickets.move(alice.id, ticket.key, { status: "todo" }),
    ]);
    expect(moves.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await core().tickets.get(ticket.key);
    expect((await core().boards.get("MOVERACE-general")).lanes.some((l) => l.id === current?.status)).toBe(true);
  });

  it("start in the board's first lane unless told otherwise", async () => {
    await project("LTK");
    await core().boards.setLanes(alice.id, "LTK-general", { lanes: [{ name: "Inbox" }, { name: "Doing" }] });
    const a = await core().tickets.create(alice.id, { projectKey: "LTK", title: "a" });
    const b = await core().tickets.create(alice.id, { projectKey: "LTK", title: "b", status: "doing" });
    expect([a.status, b.status]).toEqual(["inbox", "doing"]);
  });

  it("cannot be created or moved into a lane the board does not have, and a failed create keeps its number", async () => {
    await project("LNO");
    await expect(
      core().tickets.create(alice.id, { projectKey: "LNO", title: "x", status: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const t = await core().tickets.create(alice.id, { projectKey: "LNO", title: "y" });
    expect(t.key).toBe("LNO-1");
    await expect(core().tickets.move(alice.id, t.key, { status: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(core().tickets.move(alice.id, "LNO-9", { status: "done" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keep claiming working after a rename, and fail clearly once a lane it needs is gone", async () => {
    await project("LCL");
    const renamed = defaults().map((l) => (l.id === "todo" ? { ...l, name: "Ready" } : l));
    await core().boards.setLanes(alice.id, "LCL-general", { lanes: renamed });
    const ready = await core().tickets.create(alice.id, { projectKey: "LCL", title: "ready", status: "todo" });
    expect((await core().tickets.claimNext(bot.id, { projectKey: "LCL" }))?.key).toBe(ready.key);

    await core().tickets.move(alice.id, ready.key, { status: "done" });
    await core().boards.setLanes(alice.id, "LCL-general", { lanes: renamed.filter((l) => l.id !== "in_progress") });
    expect(await core().tickets.claimNext(bot.id, { projectKey: "LCL" })).toBeNull();
    await expect(core().tickets.claimNext(bot.id, { projectKey: "LCL", boardId: "LCL-general" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("are left where they are by the GitHub webhook when the target lane is gone", async () => {
    await project("LGH");
    const t = await core().tickets.create(alice.id, { projectKey: "LGH", title: "pr", status: "todo" });
    await core().boards.setLanes(alice.id, "LGH-general", { lanes: defaults().filter((l) => l.id !== "in_review") });
    const [synced] = await core().github.syncPullRequest({
      repo: "acme/app", number: 1, branch: t.key, title: "x", action: "opened", merged: false, draft: false,
    });
    expect(synced).toMatchObject({ key: t.key, status: "todo", links: { repo: "acme/app", pr: 1 } });
  });
});
