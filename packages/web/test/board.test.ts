import { describe, expect, it } from "vitest";
import { DEFAULT_LANES } from "@sumi/contract";
import { describeActivity, groupByStatus, initials, moveLane } from "@/lib/board";
import { ticket } from "./fixtures";

describe("groupByStatus", () => {
  it("returns every status, in order within a column", () => {
    const groups = groupByStatus([
      ticket({ key: "A-1", title: "a", status: "done" }),
      ticket({ key: "A-2", title: "b" }),
      ticket({ key: "A-3", title: "c", status: "done" }),
    ], [...DEFAULT_LANES]);
    expect(Object.keys(groups)).toEqual(["backlog", "todo", "in_progress", "in_review", "done"]);
    expect(groups.done?.map((t) => t.key)).toEqual(["A-1", "A-3"]);
    expect(groups.backlog?.map((t) => t.key)).toEqual(["A-2"]);
    expect(groups.todo).toEqual([]);
  });
});

describe("groupByStatus with custom lanes", () => {
  it("follows the given lanes and leaves out tickets in unknown ones", () => {
    const lanes = [{ id: "review", name: "Review" }, { id: "shipped", name: "Shipped" }];
    const groups = groupByStatus(
      [ticket({ key: "A-1", title: "a", status: "shipped" }), ticket({ key: "A-2", title: "b", status: "gone" })],
      lanes,
    );
    expect(Object.keys(groups)).toEqual(["review", "shipped"]);
    expect(groups.shipped?.map((t) => t.key)).toEqual(["A-1"]);
  });
});

describe("moveLane", () => {
  const lanes = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
  const ids = (l: typeof lanes) => l.map((x) => x.id).join("");

  it("puts the dragged lane where the target is", () => {
    expect(ids(moveLane(lanes, "a", "b"))).toBe("bacd");
    expect(ids(moveLane(lanes, "c", "b"))).toBe("acbd");
    expect(ids(moveLane(lanes, "a", "d"))).toBe("bcda");
    expect(ids(moveLane(lanes, "d", "a"))).toBe("dabc");
  });

  it("returns the same list when nothing changes", () => {
    expect(moveLane(lanes, "b", "b")).toBe(lanes);
    expect(moveLane(lanes, "b", "x")).toBe(lanes);
    expect(moveLane(lanes, "x", "b")).toBe(lanes);
  });
});

describe("describeActivity", () => {
  it("names lanes, falling back to their id", () => {
    const entry = (data: Record<string, unknown>) =>
      ({ id: "e", actorId: "u", action: "ticket.moved", data, createdAt: new Date() }) as never;
    const lanes = [{ id: "qa", name: "In QA" }];
    expect(describeActivity(entry({ from: "qa", to: "gone" }), lanes)).toBe("moved from In QA to gone");
  });
});

describe("initials", () => {
  it.each([
    ["Simon Rosengren", "SR"],
    ["Ada Augusta King", "AK"],
    ["Claude", "CL"],
    ["  spaced   out  ", "SO"],
    ["x", "X"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
