import { describe, expect, it } from "vitest";
import { groupByStatus, initials } from "@/lib/board";
import { ticket } from "./fixtures";

describe("groupByStatus", () => {
  it("returns every status, in order within a column", () => {
    const groups = groupByStatus([
      ticket({ key: "A-1", title: "a", status: "done" }),
      ticket({ key: "A-2", title: "b" }),
      ticket({ key: "A-3", title: "c", status: "done" }),
    ]);
    expect(Object.keys(groups)).toEqual(["backlog", "todo", "in_progress", "in_review", "done"]);
    expect(groups.done.map((t) => t.key)).toEqual(["A-1", "A-3"]);
    expect(groups.backlog.map((t) => t.key)).toEqual(["A-2"]);
    expect(groups.todo).toEqual([]);
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
