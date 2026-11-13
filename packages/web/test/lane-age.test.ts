import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import LaneAge from "@/components/LaneAge.vue";
import { laneAge } from "@/lib/lane-age";

afterEach(() => vi.useRealTimers());

describe("lane age", () => {
  const since = new Date("2026-01-01T00:00:00Z");
  it.each([
    [-60_000, "<1m"],
    [0, "<1m"],
    [59_999, "<1m"],
    [60_000, "1m"],
    [3_599_999, "59m"],
    [3_600_000, "1h"],
    [86_399_999, "23h"],
    [86_400_000, "1d"],
    [259_200_000, "3d"],
  ])("formats %i milliseconds as %s", (elapsed, expected) => {
    expect(laneAge(since, since.getTime() + elapsed)).toBe(expected);
  });

  it("refreshes while open, follows lane changes, and stops its timer on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T00:00:00Z"));
    const wrapper = mount(LaneAge, { props: { since, lane: "In progress" } });
    try {
      expect(wrapper.text()).toBe("3d in In progress");
      expect(wrapper.attributes("datetime")).toBe(since.toISOString());
      await wrapper.setProps({ since: new Date(), lane: "Review" });
      expect(wrapper.text()).toBe("<1m in Review");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(wrapper.text()).toBe("1m in Review");
    } finally {
      wrapper.unmount();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
