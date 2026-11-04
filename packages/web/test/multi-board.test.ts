import { type Board, type SetLanesInput } from "@sumi/contract";
import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { mergeColumns } from "@/lib/board";
import { alice, boards, fakeClient, ticket } from "./fixtures";

const features = boards[0]!;
const bugs: Board = { ...features, id: "bugs", name: "Bugs", lanes: [
  { id: "triage", name: "Backlog" }, { id: "ready", name: "Todo" },
  { id: "blocked", name: "Blocked" }, { id: "shipped", name: "Done" },
] };
const data = [
  ticket({ key: "SUMI-1", title: "Feature", status: "backlog" }),
  ticket({ key: "SUMI-2", title: "Bug", boardId: bugs.id, status: "triage" }),
  ticket({ key: "WEB-1", title: "Website", status: "backlog" }),
];
let wrapper: VueWrapper;
beforeEach(() => localStorage.clear());
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ""; });
function client() {
  return fakeClient({
    listBoards: vi.fn(async (key: string) => key === "SUMI" ? [features, bugs] : boards.filter((b) => b.projectKey === key)),
    listTickets: vi.fn(async ({ boardId }: { boardId: string }) => data.filter((t) => t.boardId === boardId)),
    moveTicket: vi.fn(async (key: string, { status }: { status: string }) => ({ ...data.find((t) => t.key === key)!, status })),
    setLanes: vi.fn(async (id: string, { lanes }: SetLanesInput) => ({
      ...(id === bugs.id ? bugs : features), lanes: lanes.map((l) => ({ id: l.id ?? l.name.toLowerCase(), name: l.name })),
    })),
  });
}
async function render(api = client()) {
  wrapper = mount(BoardView, { props: { client: api, me: alice }, attachTo: document.body });
  await flushPromises();
  return api;
}
const tabs = () => wrapper.findAll('nav[aria-label="Boards"] [role="checkbox"]');
async function toggle(name: string) {
  await tabs().find((t) => t.text() === name)!.trigger("click");
  await flushPromises();
}
const portal = () => new DOMWrapper(document.body);
const column = (project: string, name: string) => wrapper.findAll(`[data-project="${project}"] section[data-status]`).find((c) => c.get("h2").text() === name)!;
async function drop(key: string, project: string, name: string) {
  const transfer = { getData: (type: string) => type === "text/plain" ? key : "", types: ["text/plain"] };
  await column(project, name).get("[data-dropzone]").trigger("drop", { dataTransfer: transfer });
  await flushPromises();
}

describe("merged column ordering", () => {
  it("matches names across distinct ids and inserts new columns before the next shared column", () => {
    const first = { ...features, lanes: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] };
    const merged = mergeColumns([first, bugs], data);
    expect(merged.map((c) => c.lane.name)).toEqual(["Backlog", "Todo", "Blocked", "Done"]);
    expect(merged.find((c) => c.lane.name === "Todo")?.sources).toEqual([
      { boardId: features.id, laneId: "todo" }, { boardId: bugs.id, laneId: "ready" },
    ]);
  });
  it("keeps different names separate even when ids match; earlier boards win conflicting orders", () => {
    const first = { ...features, lanes: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] };
    const second = { ...bugs, lanes: [{ id: "done", name: "Done" }, { id: "todo", name: "Todo" }, { id: "other", name: "Other" }] };
    expect(mergeColumns([first, second], []).map((c) => c.lane.name)).toEqual(["Todo", "Done", "Other"]);
    expect(mergeColumns([first, { ...second, lanes: [{ id: "todo", name: "Ready" }] }], []).map((c) => c.lane.name)).toEqual(["Todo", "Done", "Ready"]);
  });
});

describe("multiple selected boards", () => {
  it("toggles independently, merges only within projects and remembers selections in tab order", async () => {
    await render();
    await toggle("WEB General");
    await toggle("SUMI Bugs");
    expect(tabs().every((t) => t.attributes("aria-checked") === "true")).toBe(true);
    expect(column("SUMI", "Backlog").findAll("article").map((c) => c.attributes("data-key"))).toEqual(["SUMI-1", "SUMI-2"]);
    expect(column("SUMI", "Backlog").text()).toContain("Bugs");
    expect(column("WEB", "Backlog").findAll("article").map((c) => c.attributes("data-key"))).toEqual(["WEB-1"]);
    expect(wrapper.findAll("[data-project]").map((s) => s.attributes("data-project"))).toEqual(["SUMI", "WEB"]);
    expect(JSON.parse(localStorage.getItem("sumi.boards")!)).toEqual([features.id, bugs.id, "WEB-general"]);
    wrapper.unmount();
    await render();
    expect(tabs().every((t) => t.attributes("aria-checked") === "true")).toBe(true);
    await toggle("SUMI Bugs");
    expect(wrapper.find('[data-key="SUMI-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-key="SUMI-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-key="WEB-1"]').exists()).toBe(true);
  });

  it("allows an empty selection and restores it on reload", async () => {
    await render();
    await toggle("SUMI General");
    expect(wrapper.text()).toContain("No boards selected");
    expect(wrapper.get('[aria-label="New ticket"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
    const api = await render();
    expect(wrapper.text()).toContain("No boards selected");
    expect(api.listTickets).not.toHaveBeenCalled();
  });

  it("maps drag destinations to the ticket's own lane id and refuses unavailable or cross-project columns", async () => {
    const api = await render();
    await toggle("SUMI Bugs");
    await toggle("WEB General");
    await drop("SUMI-2", "SUMI", "Todo");
    expect(api.moveTicket).toHaveBeenLastCalledWith("SUMI-2", { status: "ready" });
    expect(column("SUMI", "Todo").text()).toContain("Bug");
    await drop("SUMI-1", "SUMI", "Blocked");
    await drop("SUMI-1", "WEB", "Todo");
    expect(api.moveTicket).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toContain("not available");
  });

  it("uses each ticket's board for detail status and same-project transfer choices", async () => {
    await render();
    await toggle("SUMI Bugs");
    await toggle("WEB General");
    await wrapper.get('[data-key="SUMI-2"]').trigger("click");
    await flushPromises();
    expect(portal().get("#detail-status").findAll("option").map((o) => o.attributes("value"))).toEqual(["triage", "ready", "blocked", "shipped"]);
    expect(portal().get("#detail-board").findAll("option").map((o) => o.attributes("value"))).toEqual([features.id, bugs.id]);
  });

  it("creates in an explicitly chosen board with that board's status options", async () => {
    const api = await render();
    await toggle("SUMI Bugs");
    await toggle("WEB General");
    const create = wrapper.get('[aria-label="New ticket in SUMI Bugs"]');
    expect(wrapper.get('[aria-label="Board controls"]').element.contains(create.element)).toBe(true);
    expect(wrapper.find('main [aria-label="SUMI Bugs controls"]').exists()).toBe(false);
    await wrapper.get('[aria-label="New ticket in SUMI Bugs"]').trigger("click");
    await flushPromises();
    expect((portal().get("#new-board").element as HTMLSelectElement).value).toBe(bugs.id);
    expect(portal().get("#new-status").findAll("option").map((o) => o.attributes("value"))).toEqual(["triage", "ready", "blocked", "shipped"]);
    await portal().get("#new-board").setValue("WEB-general");
    await portal().get("#new-title").setValue("New website ticket");
    await portal().get("form").trigger("submit");
    await flushPromises();
    expect(api.createTicket).toHaveBeenCalledWith({ projectKey: "WEB", boardId: "WEB-general", title: "New website ticket", description: "", status: "backlog" });
    expect(wrapper.find('[data-key="WEB-99"]').exists()).toBe(true);
  });

  it("keeps a transferred ticket visible when its destination board is selected", async () => {
    const api = client();
    api.transferTicket = vi.fn(async (key, { boardId }) => ({ ...data.find((t) => t.key === key)!, boardId, status: "backlog" }));
    await render(api);
    await toggle("SUMI Bugs");
    await wrapper.get('[data-key="SUMI-2"]').trigger("click");
    await flushPromises();
    await portal().get("#detail-board").setValue(features.id);
    await flushPromises();
    expect(column("SUMI", "Backlog").findAll("article")).toHaveLength(2);
    expect(portal().get("#detail-status").findAll("option").map((o) => o.attributes("value"))).toEqual(features.lanes.map((l) => l.id));
    expect(portal().find('[data-testid="ticket-detail"]').exists()).toBe(true);
  });

  it("edits one board and returns to the merged view without changing the selection", async () => {
    const api = await render();
    await toggle("SUMI Bugs");
    await wrapper.get('[aria-label="Edit lanes in SUMI Bugs"]').trigger("click");
    expect(wrapper.text()).toContain("Editing SUMI Bugs");
    await wrapper.get('[aria-label="Rename Todo"]').trigger("click");
    await wrapper.get('input[aria-label="Lane name"]').setValue("Ready");
    await wrapper.get('input[aria-label="Lane name"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(api.setLanes).toHaveBeenCalledWith(bugs.id, expect.anything());
    await wrapper.get('[aria-label="Done editing lanes"]').trigger("click");
    expect(column("SUMI", "Todo").exists()).toBe(true);
    expect(column("SUMI", "Ready").exists()).toBe(true);
    expect(tabs().filter((t) => t.attributes("aria-checked") === "true")).toHaveLength(2);
  });

  it("applies board view settings before merging without losing other boards' tickets", async () => {
    localStorage.setItem(`sumi.view.${bugs.id}`, JSON.stringify({ hideEmpty: false, hidden: { [bugs.id]: ["triage"] } }));
    await render();
    await toggle("SUMI Bugs");
    expect(column("SUMI", "Backlog").findAll("article").map((c) => c.attributes("data-key"))).toEqual(["SUMI-1"]);
    const options = wrapper.get('[aria-label="View options for SUMI Bugs"]');
    expect(wrapper.get('[aria-label="Board controls"]').element.contains(options.element)).toBe(true);
    await options.trigger("click");
    await flushPromises();
    await portal().get('[data-lane="triage"]').trigger("click");
    await flushPromises();
    expect(column("SUMI", "Backlog").findAll("article")).toHaveLength(2);
    await portal().get('[data-lane="triage"]').trigger("click");
    await options.trigger("click");
    await toggle("SUMI General");
    expect(wrapper.find('[data-key="SUMI-2"]').exists()).toBe(false);
    await wrapper.get('[aria-label="View options"]').trigger("click");
    await flushPromises();
    expect(portal().get('[data-lane="triage"]').attributes("aria-checked")).toBe("false");
    await portal().get('[data-lane="triage"]').trigger("click");
    await toggle("SUMI General");
    expect(column("SUMI", "Backlog").findAll("article")).toHaveLength(2);
  });

  it("ignores slow responses from deselected boards even after selecting them again", async () => {
    const api = await render();
    let finish!: () => void;
    vi.mocked(api.listTickets).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return [ticket({ key: "SUMI-1", title: "Stale" })];
    });
    await toggle("SUMI Bugs");
    await toggle("SUMI General");
    await toggle("SUMI General");
    finish();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Stale");
    expect(wrapper.find('[data-key="SUMI-2"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Feature");
  });
});
