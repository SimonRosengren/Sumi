import { DEFAULT_LANES } from "@sumi/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { loadView, saveView, visibleLanes } from "@/lib/view";
import { ticket } from "./fixtures";

beforeEach(() => localStorage.clear());

const lanes = [...DEFAULT_LANES];
const columns = {
  backlog: [ticket({ key: "A-1", title: "x" })],
  todo: [],
  in_progress: [],
  in_review: [],
  done: [ticket({ key: "A-2", title: "y", status: "done" })],
};
const ids = (l: typeof lanes) => l.map((x) => x.id);

describe("visibleLanes", () => {
  it("shows everything by default", () => {
    expect(ids(visibleLanes(lanes, columns, [], false))).toEqual(["backlog", "todo", "in_progress", "in_review", "done"]);
  });

  it("drops hidden lanes and keeps the order of the rest", () => {
    expect(ids(visibleLanes(lanes, columns, ["todo", "backlog"], false))).toEqual(["in_progress", "in_review", "done"]);
  });

  it("drops lanes without tickets when asked, and treats a missing column as empty", () => {
    expect(ids(visibleLanes(lanes, columns, [], true))).toEqual(["backlog", "done"]);
    expect(ids(visibleLanes(lanes, {}, [], true))).toEqual([]);
  });

  it("combines both", () => {
    expect(ids(visibleLanes(lanes, columns, ["done"], true))).toEqual(["backlog"]);
  });
});

describe("loadView and saveView", () => {
  it("defaults when nothing is stored", () => {
    expect(loadView()).toEqual({ hideEmpty: false, hidden: {} });
  });

  it("round-trips", () => {
    saveView({ hideEmpty: true, hidden: { SUMI: ["todo"] } });
    expect(loadView()).toEqual({ hideEmpty: true, hidden: { SUMI: ["todo"] } });
  });

  it("ignores garbage", () => {
    for (const bad of ["{", "null", "42", '{"hideEmpty":"yes","hidden":{"A":"todo","B":[1,"done"]}}']) {
      localStorage.setItem("sumi.view", bad);
      const view = loadView();
      expect(view.hideEmpty).toBe(false);
      expect(Object.values(view.hidden).flat().every((x) => typeof x === "string")).toBe(true);
    }
    localStorage.setItem("sumi.view", '{"hidden":{"B":[1,"done"]}}');
    expect(loadView().hidden).toEqual({ B: ["done"] });
  });
});
