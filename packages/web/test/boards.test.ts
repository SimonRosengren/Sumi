import { DEFAULT_LANES, type Board, type SetLanesInput } from "@sumi/contract";
import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { alice, boards, fakeClient, ticket } from "./fixtures";

const general: Board = { id: "SUMI-general", projectKey: "SUMI", name: "General", lanes: [...DEFAULT_LANES], createdAt: new Date() };
const bugs: Board = { ...general, id: "bugs", name: "Bugs" };
let wrapper: VueWrapper;
beforeEach(() => localStorage.clear());
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ""; });

function client() {
  const data = [ticket({ key: "SUMI-1", title: "General ticket" }), ticket({ key: "SUMI-2", title: "Bug ticket", boardId: bugs.id })];
  return fakeClient({
    listBoards: vi.fn(async (key: string) => key === "SUMI" ? [general, bugs] : boards.filter((b) => b.projectKey === key)),
    listTickets: vi.fn(async ({ boardId }: { boardId: string }) => data.filter((t) => t.boardId === boardId)),
  });
}
async function render(api = client()) {
  wrapper = mount(BoardView, { props: { client: api, me: alice }, attachTo: document.body });
  await flushPromises();
  return api;
}
async function select(name: string) {
  for (const tab of wrapper.findAll('nav[aria-label="Boards"] button')) {
    if (tab.attributes("aria-checked") === "true" && tab.text() !== `SUMI ${name}`) await tab.trigger("click");
  }
  const tab = wrapper.findAll('nav[aria-label="Boards"] button').find((b) => b.text() === `SUMI ${name}`)!;
  if (tab.attributes("aria-checked") !== "true") await tab.trigger("click");
  await flushPromises();
}
const portal = () => new DOMWrapper(document.body);

describe("project boards", () => {
  it("edits only the selected board's columns and restores each board's layout on switching", async () => {
    const api = client();
    api.listBoards = vi.fn(async (key) => key === "SUMI"
      ? [general, { ...bugs, lanes: [{ id: "triage", name: "Triage" }, { id: "fixed", name: "Fixed" }] }]
      : boards.filter((b) => b.projectKey === key));
    api.setLanes = vi.fn(async (id: string, { lanes }: SetLanesInput) => ({
      ...general, id, lanes: lanes.map((l) => ({ id: l.id ?? l.name.toLowerCase(), name: l.name })),
    }));
    await render(api);
    await wrapper.get('[aria-label="Edit lanes"]').trigger("click");
    await wrapper.get('[aria-label="Rename Todo"]').trigger("click");
    await wrapper.get('input[aria-label="Lane name"]').setValue("Ready");
    await wrapper.get('input[aria-label="Lane name"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(api.setLanes).toHaveBeenCalledWith(general.id, expect.anything());
    await select("Bugs");
    expect(wrapper.findAll("section[data-status]").map((s) => s.attributes("data-status"))).toEqual(["triage", "fixed"]);
    expect(wrapper.find('[aria-label="Done editing lanes"]').exists()).toBe(false);
    await select("General");
    expect(wrapper.get('[data-status="todo"] h2').text()).toBe("Ready");
  });

  it("shows every project–board pair in header tabs, scopes tickets and restores selection", async () => {
    const api = await render();
    expect(wrapper.findAll('header nav[aria-label="Boards"] button').map((b) => b.text())).toEqual(["SUMI General", "SUMI Bugs", "WEB General"]);
    expect(wrapper.find('[aria-label="Project"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Create board"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edit board"]').exists()).toBe(false);
    expect(wrapper.find('[data-key="SUMI-1"]').exists()).toBe(true);
    await select("Bugs");
    expect(api.listTickets).toHaveBeenLastCalledWith({ projectKey: "SUMI", boardId: bugs.id });
    expect(wrapper.find('[data-key="SUMI-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-key="SUMI-2"]').exists()).toBe(true);
    expect(localStorage.getItem("sumi.board.SUMI")).toBe(bugs.id);
    wrapper.unmount();
    const reopened = await render();
    expect(reopened.listTickets).toHaveBeenLastCalledWith({ projectKey: "SUMI", boardId: bugs.id });
  });

  it("ignores a slow ticket response after switching boards", async () => {
    const api = await render();
    let finish!: () => void;
    vi.mocked(api.listTickets).mockImplementation(async ({ boardId }) => {
      if (boardId === bugs.id) await new Promise<void>((resolve) => { finish = resolve; });
      return [ticket({ key: boardId === bugs.id ? "SUMI-2" : "SUMI-1", title: boardId === bugs.id ? "Stale bug" : "Current general", boardId: boardId! })];
    });
    await select("Bugs");
    await select("General");
    finish();
    await flushPromises();
    expect(wrapper.text()).toContain("Current general");
    expect(wrapper.text()).not.toContain("Stale bug");
  });

  it("falls back when the remembered board has been deleted", async () => {
    localStorage.setItem("sumi.board.SUMI", "deleted");
    const api = await render();
    expect(api.listTickets).toHaveBeenLastCalledWith({ projectKey: "SUMI", boardId: general.id });
    expect(localStorage.getItem("sumi.board.SUMI")).toBe(general.id);
  });

  it("refreshes tabs after CLI or MCP board changes and falls back after deletion", async () => {
    const api = client();
    await render(api);
    await select("Bugs");
    const features = { ...general, id: "features", name: "Features" };
    vi.mocked(api.listBoards).mockImplementation(async (key) => key === "SUMI" ? [general, features] : boards.filter((b) => b.projectKey === key));
    await wrapper.get('[aria-label="Refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('nav[aria-label="Boards"] button').map((b) => b.text())).toEqual(["SUMI General", "SUMI Features", "WEB General"]);
    expect(wrapper.get('nav [aria-checked="true"]').text()).toBe("SUMI General");
    expect(api.listTickets).toHaveBeenLastCalledWith({ projectKey: "SUMI", boardId: general.id });
  });

  it("transfers from ticket detail and removes the ticket from the source board", async () => {
    const api = client();
    api.transferTicket = vi.fn(async (key, { boardId }) => ticket({ key, title: "General ticket", boardId }));
    await render(api);
    await wrapper.get('[data-key="SUMI-1"]').trigger("click");
    await flushPromises();
    await portal().get("#detail-board").setValue(bugs.id);
    await flushPromises();
    expect(api.transferTicket).toHaveBeenCalledWith("SUMI-1", { boardId: bugs.id });
    expect(wrapper.find('[data-key="SUMI-1"]').exists()).toBe(false);
    expect(portal().find('[data-testid="ticket-detail"]').exists()).toBe(false);
  });

  it("keeps hidden and empty-lane settings independent between boards", async () => {
    await render();
    await wrapper.get('[aria-label="View options"]').trigger("click");
    await flushPromises();
    const hideEmpty = portal().findAll('[role="checkbox"]').find((e) => e.text().includes("Hide empty lanes"))!;
    await hideEmpty.trigger("click");
    await flushPromises();
    expect(wrapper.findAll("section[data-status]")).toHaveLength(1);
    await select("Bugs");
    expect(wrapper.findAll("section[data-status]")).toHaveLength(5);
    await select("General");
    expect(wrapper.findAll("section[data-status]")).toHaveLength(1);
  });
});
