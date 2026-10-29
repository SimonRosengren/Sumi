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
const lanesOf = async (key: string) => (await core().projects.list()).find((p) => p.key === key)?.lanes;

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
    const saved = await core().projects.setLanes(alice.id, "LREN", {
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
    const saved = await core().projects.setLanes(alice.id, "LADD", {
      lanes: [...defaults(), { name: "QA / Staging" }, { name: "QA staging" }, { name: "!!!" }],
    });
    expect(ids(saved.lanes).slice(5)).toEqual(["qa_staging", "qa_staging_2", "lane"]);
  });

  it("never reuse the id of an existing lane", async () => {
    await project("LDUP");
    const saved = await core().projects.setLanes(alice.id, "LDUP", { lanes: [...defaults(), { name: "Done" }] });
    expect(ids(saved.lanes).at(-1)).toBe("done_2");
  });

  it("can be removed when empty, but not while they hold tickets", async () => {
    await project("LDEL");
    const t = await core().tickets.create(alice.id, { projectKey: "LDEL", title: "x", status: "todo" });
    const withoutTodo = defaults().filter((l) => l.id !== "todo");
    await expect(core().projects.setLanes(alice.id, "LDEL", { lanes: withoutTodo })).rejects.toBeInstanceOf(ConflictError);
    expect(await lanesOf("LDEL")).toEqual(DEFAULT_LANES);

    await core().tickets.move(alice.id, t.key, { status: "done" });
    const saved = await core().projects.setLanes(alice.id, "LDEL", { lanes: withoutTodo });
    expect(ids(saved.lanes)).toEqual(["backlog", "in_progress", "in_review", "done"]);
  });

  it("are validated", async () => {
    await project("LBAD");
    const set = (lanes: { id?: string; name: string }[]) => core().projects.setLanes(alice.id, "LBAD", { lanes });
    await expect(set([])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ name: "   " }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ name: "x".repeat(41) }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set(Array.from({ length: 21 }, (_, i) => ({ name: `L${i}` })))).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ id: "nope", name: "Nope" }])).rejects.toBeInstanceOf(ValidationError);
    await expect(set([{ id: "todo", name: "A" }, { id: "todo", name: "B" }])).rejects.toBeInstanceOf(ValidationError);
    await expect(core().projects.setLanes(alice.id, "NOPE", { lanes: [{ name: "A" }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().projects.setLanes("missing", "LBAD", { lanes: [{ name: "A" }] })).rejects.toBeInstanceOf(NotFoundError);
    expect(await lanesOf("LBAD")).toEqual(DEFAULT_LANES);
  });

  it("are recorded in the activity log, and an unchanged list is not", async () => {
    await project("LLOG");
    await core().projects.setLanes(bot.id, "LLOG", { lanes: defaults() });
    expect((await core().activity.list({ projectKey: "LLOG" })).map((e) => e.action)).toEqual(["project.created"]);

    await core().projects.setLanes(bot.id, "LLOG", { lanes: [{ id: "todo", name: "Ready" }] });
    const [entry] = await core().activity.list({ projectKey: "LLOG", limit: 1 });
    expect(entry).toMatchObject({
      actorId: bot.id,
      action: "project.lanes_updated",
      data: { lanes: [{ id: "todo", name: "Ready" }] },
    });
  });
});

describe("tickets and lanes", () => {
  it("start in the project's first lane unless told otherwise", async () => {
    await project("LTK");
    await core().projects.setLanes(alice.id, "LTK", { lanes: [{ name: "Inbox" }, { name: "Doing" }] });
    const a = await core().tickets.create(alice.id, { projectKey: "LTK", title: "a" });
    const b = await core().tickets.create(alice.id, { projectKey: "LTK", title: "b", status: "doing" });
    expect([a.status, b.status]).toEqual(["inbox", "doing"]);
  });

  it("cannot be created or moved into a lane the project does not have, and a failed create keeps its number", async () => {
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
    await core().projects.setLanes(alice.id, "LCL", { lanes: renamed });
    const ready = await core().tickets.create(alice.id, { projectKey: "LCL", title: "ready", status: "todo" });
    expect((await core().tickets.claimNext(bot.id, { projectKey: "LCL" }))?.key).toBe(ready.key);

    await core().tickets.move(alice.id, ready.key, { status: "done" });
    await core().projects.setLanes(alice.id, "LCL", { lanes: renamed.filter((l) => l.id !== "in_progress") });
    await expect(core().tickets.claimNext(bot.id, { projectKey: "LCL" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("are left where they are by the GitHub webhook when the target lane is gone", async () => {
    await project("LGH");
    const t = await core().tickets.create(alice.id, { projectKey: "LGH", title: "pr", status: "todo" });
    await core().projects.setLanes(alice.id, "LGH", { lanes: defaults().filter((l) => l.id !== "in_review") });
    const [synced] = await core().github.syncPullRequest({
      repo: "acme/app", number: 1, branch: t.key, title: "x", action: "opened", merged: false, draft: false,
    });
    expect(synced).toMatchObject({ key: t.key, status: "todo", links: { repo: "acme/app", pr: 1 } });
  });
});
