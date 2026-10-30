import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { alice, fakeClient } from "./fixtures";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

async function render() {
  const wrapper = mount(BoardView, { props: { client: fakeClient(), me: alice }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const statuses = (w: Awaited<ReturnType<typeof render>>) => w.findAll("section[data-status]").map((s) => s.attributes("data-status"));
const trigger = (w: Awaited<ReturnType<typeof render>>) => w.get('button[aria-label="View options"]');

/** The menu renders in a portal, outside the wrapper. */
async function open(w: Awaited<ReturnType<typeof render>>) {
  await trigger(w).trigger("click");
  await flushPromises();
}
const menu = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const item = (label: string) =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="checkbox"]')).find((e) => e.textContent?.includes(label));
async function click(el: HTMLElement | undefined) {
  el?.click();
  await flushPromises();
}

describe("view options menu", () => {
  it("lives next to the theme toggle and starts closed", async () => {
    const w = await render();
    expect(menu()).toBeNull();
    expect(trigger(w).element.nextElementSibling?.getAttribute("aria-label")).toMatch(/theme/);
    expect(statuses(w)).toHaveLength(5);
  });

  it("lists every lane with its ticket count, all checked", async () => {
    const w = await render();
    await open(w);
    expect(menu()).not.toBeNull();
    const done = item("Done");
    expect(done?.getAttribute("aria-checked")).toBe("true");
    expect(done?.textContent).toContain("1");
    expect(item("Todo")?.textContent).toContain("0");
    expect(item("Hide empty lanes")?.getAttribute("aria-checked")).toBe("false");
  });

  it("hides and shows a single lane, and remembers it per project", async () => {
    const w = await render();
    await open(w);
    await click(item("Backlog"));
    expect(statuses(w)).toEqual(["todo", "in_progress", "in_review", "done"]);
    expect(item("Backlog")?.getAttribute("aria-checked")).toBe("false");
    expect(trigger(w).classes()).toContain("bg-primary/12");
    expect(JSON.parse(localStorage.getItem("sumi.view") ?? "")).toEqual({ hideEmpty: false, hidden: { SUMI: ["backlog"] } });

    // Another project is not affected.
    await w.findAll("nav button").find((b) => b.text().includes("WEB"))?.trigger("click");
    await flushPromises();
    expect(statuses(w)).toHaveLength(5);
    await w.findAll("nav button").find((b) => b.text().includes("SUMI"))?.trigger("click");
    await flushPromises();
    expect(statuses(w)).not.toContain("backlog");

    await click(item("Backlog"));
    expect(statuses(w)).toHaveLength(5);
  });

  it("hides empty lanes, and keeps showing them while editing lanes", async () => {
    const w = await render();
    await open(w);
    await click(item("Hide empty lanes"));
    expect(statuses(w)).toEqual(["backlog", "in_progress", "done"]);
    expect(JSON.parse(localStorage.getItem("sumi.view") ?? "").hideEmpty).toBe(true);

    await w.get('[aria-label="Edit lanes"]').trigger("click");
    expect(statuses(w)).toHaveLength(5);
    await w.get('[aria-label="Done editing lanes"]').trigger("click");
    expect(statuses(w)).toEqual(["backlog", "in_progress", "done"]);
  });

  it("restores the settings on the next visit", async () => {
    localStorage.setItem("sumi.view", JSON.stringify({ hideEmpty: true, hidden: { SUMI: ["done"] } }));
    const w = await render();
    expect(statuses(w)).toEqual(["backlog", "in_progress"]);
    expect(trigger(w).classes()).toContain("bg-primary/12");
  });

  it("offers a way back when nothing is left to show", async () => {
    const w = await render();
    await open(w);
    await click(item("Hide empty lanes"));
    for (const name of ["Backlog", "In progress", "Done"]) await click(item(name));
    expect(statuses(w)).toEqual([]);
    expect(w.text()).toContain("No lanes to show");

    await w.findAll("button").find((b) => b.text() === "Show everything" && w.element.contains(b.element))?.trigger("click");
    await flushPromises();
    expect(statuses(w)).toHaveLength(5);
    expect(trigger(w).classes()).not.toContain("bg-primary/12");
  });

  it("ignores hidden lanes that no longer exist", async () => {
    localStorage.setItem("sumi.view", JSON.stringify({ hideEmpty: false, hidden: { SUMI: ["deleted"] } }));
    const w = await render();
    expect(statuses(w)).toHaveLength(5);
    expect(trigger(w).classes()).not.toContain("bg-primary/12");
  });
});
