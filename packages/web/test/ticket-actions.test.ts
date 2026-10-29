import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { alice, fakeClient } from "./fixtures";

let wrapper: VueWrapper | undefined;

beforeEach(() => localStorage.clear());
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});

async function render(client = fakeClient()) {
  wrapper = mount(BoardView, { props: { client, me: alice }, attachTo: document.body });
  await flushPromises();
  return { wrapper, client };
}

const column = (status: string) => wrapper!.get(`[data-status="${status}"]`);
const detail = () => document.body.querySelector<HTMLElement>('[data-testid="ticket-detail"]');

/** A minimal DataTransfer: happy-dom's does not carry data between events. */
function dataTransfer() {
  const data = new Map<string, string>();
  return { setData: (k: string, v: string) => void data.set(k, v), getData: (k: string) => data.get(k) ?? "", effectAllowed: "" };
}

async function drag(key: string, to: string) {
  const dt = dataTransfer();
  await column("backlog").get(`[data-key="${key}"]`).trigger("dragstart", { dataTransfer: dt });
  await column(to).get("[data-dropzone]").trigger("dragover", { dataTransfer: dt });
  await column(to).get("[data-dropzone]").trigger("drop", { dataTransfer: dt });
  await flushPromises();
}

describe("drag and drop", () => {
  it("moves a ticket to the column it is dropped on", async () => {
    const { client } = await render();
    await drag("SUMI-1", "in_review");
    expect(client.moveTicket).toHaveBeenCalledWith("SUMI-1", { status: "in_review" });
    expect(column("in_review").text()).toContain("Backlog one");
    expect(column("backlog").text()).not.toContain("Backlog one");
  });

  it("does nothing when dropped on its own column", async () => {
    const { client } = await render();
    await drag("SUMI-1", "backlog");
    expect(client.moveTicket).not.toHaveBeenCalled();
  });

  it("puts the ticket back and shows the error when the server refuses", async () => {
    const moveTicket = vi.fn(async () => Promise.reject(new Error("Ticket SUMI-1 not found")));
    await render(fakeClient({ moveTicket }));
    await drag("SUMI-1", "done");
    expect(wrapper!.get('[role="alert"]').text()).toBe("Ticket SUMI-1 not found");
    expect(column("backlog").text()).toContain("Backlog one");
    expect(column("done").text()).not.toContain("Backlog one");
  });
});

describe("ticket detail", () => {
  const open = async (key: string) => {
    await wrapper!.get(`[data-key="${key}"]`).trigger("click");
    await flushPromises();
  };

  it("opens from a card and shows the ticket", async () => {
    const { client } = await render();
    expect(detail()).toBeNull();
    await open("SUMI-2");
    expect(detail()?.textContent).toContain("Doing it");
    expect(detail()?.textContent).toContain("#7");
    expect(detail()?.textContent).toContain("No description.");
    expect(client.listActivity).toHaveBeenCalledWith({ ticketKey: "SUMI-2" });
  });

  it("lists the ticket's history in readable form", async () => {
    const listActivity = vi.fn(async () => [
      { id: "a2", actorId: "u2", action: "ticket.moved", ticketKey: "SUMI-2", data: { from: "todo", to: "in_progress" }, createdAt: new Date("2026-01-02T10:00:00Z") },
      { id: "a1", actorId: "u1", action: "ticket.created", ticketKey: "SUMI-2", data: {}, createdAt: new Date("2026-01-01T10:00:00Z") },
    ]);
    await render(fakeClient({ listActivity }));
    await open("SUMI-2");
    const text = detail()?.textContent ?? "";
    expect(text).toContain("Claude moved from Todo to In progress");
    expect(text).toContain("Alice Andersson created this ticket");
  });

  it("changes status, assignee and priority", async () => {
    const { client } = await render();
    await open("SUMI-1");

    const set = async (id: string, value: string) => {
      const el = detail()!.querySelector<HTMLSelectElement>(`#${id}`)!;
      el.value = value;
      el.dispatchEvent(new Event("change"));
      await flushPromises();
    };
    await set("detail-status", "todo");
    expect(client.moveTicket).toHaveBeenCalledWith("SUMI-1", { status: "todo" });
    expect(column("todo").text()).toContain("Backlog one");

    await set("detail-assignee", "u2");
    expect(client.updateTicket).toHaveBeenCalledWith("SUMI-1", { assigneeId: "u2" });

    await set("detail-priority", "high");
    expect(client.updateTicket).toHaveBeenCalledWith("SUMI-1", { priority: "high" });

    await set("detail-assignee", "");
    expect(client.updateTicket).toHaveBeenCalledWith("SUMI-1", { assigneeId: null });
    await set("detail-priority", "");
    expect(client.updateTicket).toHaveBeenCalledWith("SUMI-1", { priority: null });
  });

  it("closes with the close button", async () => {
    await render();
    await open("SUMI-1");
    document.body.querySelector<HTMLElement>('[aria-label="Close"]')!.click();
    await flushPromises();
    expect(detail()).toBeNull();
  });

  it("opens from the keyboard", async () => {
    await render();
    await wrapper!.get('[data-key="SUMI-3"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(detail()?.textContent).toContain("Finished");
  });
});
