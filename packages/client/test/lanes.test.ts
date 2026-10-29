import type { Lane } from "@sumi/contract";
import { describe, expect, it } from "vitest";
import { placeLane } from "../src";

const lanes: Lane[] = ["a", "b", "c", "d"].map((id) => ({ id, name: id }));
const ids = (l: Lane[]) => l.map((x) => x.id).join("");

describe("placeLane", () => {
  it("puts a lane at a 1-based position", () => {
    expect(ids(placeLane(lanes, "a", 2))).toBe("bacd");
    expect(ids(placeLane(lanes, "d", 1))).toBe("dabc");
    expect(ids(placeLane(lanes, "b", 4))).toBe("acdb");
  });

  it("clamps to the ends", () => {
    expect(ids(placeLane(lanes, "a", 99))).toBe("bcda");
    expect(ids(placeLane(lanes, "d", 0))).toBe("dabc");
  });

  it("returns the same list when nothing changes or the lane is unknown", () => {
    expect(placeLane(lanes, "b", 2)).toBe(lanes);
    expect(placeLane(lanes, "x", 1)).toBe(lanes);
  });
});
