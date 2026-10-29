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

const dialog = () => document.body.querySelector<HTMLElement>('[data-testid="new-ticket"]');

async function type(selector: string, value: string, root: ParentNode = document.body) {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event("input"));
  await flushPromises();
}

async function press(selector: string) {
  document.body.querySelector<HTMLElement>(selector)!.click();
  await flushPromises();
}

describe("creating tickets", () => {
  const openDialog = async () => {
    await wrapper!.get('[aria-label="New ticket"]').trigger("click");
    await flushPromises();
  };
  const submit = async () => {
    dialog()!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushPromises();
  };

  it("creates a ticket in the selected project and shows it in its column", async () => {
    const { client } = await render();
    await openDialog();
    expect(dialog()?.textContent).toContain("SUMI");
    await type("#new-title", "  Fresh idea ");
    await type("#new-description", "More detail");
    const status = dialog()!.querySelector<HTMLSelectElement>("#new-status")!;
    status.value = "todo";
    status.dispatchEvent(new Event("change"));
    await submit();

    expect(client.createTicket).toHaveBeenCalledWith({
      projectKey: "SUMI",
      title: "Fresh idea",
      description: "More detail",
      status: "todo",
    });
    expect(dialog()).toBeNull();
    expect(column("todo").text()).toContain("Fresh idea");
  });

  it("will not submit without a title", async () => {
    const { client } = await render();
    await openDialog();
    const create = dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(create.disabled).toBe(true);
    await type("#new-title", "   ");
    await submit();
    expect(client.createTicket).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the error when the server refuses", async () => {
    const createTicket = vi.fn(async () => Promise.reject(new Error("Project SUMI not found")));
    await render(fakeClient({ createTicket }));
    await openDialog();
    await type("#new-title", "Fresh idea");
    await submit();
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe("Project SUMI not found");
    expect((dialog()!.querySelector("#new-title") as HTMLInputElement).value).toBe("Fresh idea");
  });

  it("starts empty every time it opens", async () => {
    await render();
    await openDialog();
    await type("#new-title", "Draft");
    await press('[data-testid="new-ticket"] [aria-label="Close"]');
    await openDialog();
    expect((dialog()!.querySelector("#new-title") as HTMLInputElement).value).toBe("");
  });
});

describe("editing title and description", () => {
  const edit = async (key: string) => {
    await wrapper!.get(`[data-key="${key}"]`).trigger("click");
    await flushPromises();
    await press('[aria-label="Edit title and description"]');
  };

  it("saves only what changed", async () => {
    const { client } = await render();
    await edit("SUMI-1");
    await type("#edit-title", " Renamed ");
    await press('button[type="submit"][form="edit-ticket"]');
    expect(client.updateTicket).toHaveBeenCalledWith("SUMI-1", { title: "Renamed" });
    expect(detail()?.textContent).toContain("Renamed");
    expect(detail()?.querySelector("#edit-title")).toBeNull();

    await press('[aria-label="Edit title and description"]');
    await type("#edit-description", "Now with words");
    await press('button[type="submit"][form="edit-ticket"]');
    expect(client.updateTicket).toHaveBeenLastCalledWith("SUMI-1", { description: "Now with words" });
    expect(detail()?.textContent).toContain("Now with words");
  });

  it("makes no request when nothing changed, and cancel discards the draft", async () => {
    const { client } = await render();
    await edit("SUMI-1");
    await press('button[type="submit"][form="edit-ticket"]');
    expect(client.updateTicket).not.toHaveBeenCalled();

    await press('[aria-label="Edit title and description"]');
    await type("#edit-title", "Discard me");
    const cancel = [...detail()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    cancel.click();
    await flushPromises();
    expect(client.updateTicket).not.toHaveBeenCalled();
    expect(detail()?.textContent).toContain("Backlog one");
  });

  it("stays in edit mode with the draft when saving fails", async () => {
    const updateTicket = vi.fn(async () => Promise.reject(new Error("Nope")));
    await render(fakeClient({ updateTicket }));
    await edit("SUMI-1");
    await type("#edit-title", "Renamed");
    await press('button[type="submit"][form="edit-ticket"]');
    expect((detail()!.querySelector("#edit-title") as HTMLInputElement).value).toBe("Renamed");
    expect(wrapper!.get('[role="alert"]').text()).toBe("Nope");
  });
});

describe("comments", () => {
  const open = async (key: string) => {
    await wrapper!.get(`[data-key="${key}"]`).trigger("click");
    await flushPromises();
  };
  const textarea = () => detail()!.querySelector<HTMLTextAreaElement>("#new-comment")!;
  const submit = async () => {
    detail()!.querySelector<HTMLFormElement>("#new-comment")!.closest("form")!.dispatchEvent(new Event("submit"));
    await flushPromises();
  };

  it("lists the ticket's comments with their authors", async () => {
    const listComments = vi.fn(async () => [
      { id: "c1", ticketKey: "SUMI-2", authorId: "u2", body: "On it\n- step", createdAt: new Date("2026-01-02T10:00:00Z") },
    ]);
    const { client } = await render(fakeClient({ listComments }));
    await open("SUMI-2");
    expect(client.listComments).toHaveBeenCalledWith("SUMI-2");
    const items = detail()!.querySelectorAll('[data-testid="comment"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain("Claude");
    expect(items[0]!.textContent).toContain("On it\n- step");
  });

  it("posts a comment, shows it at once and clears the box", async () => {
    const { client } = await render();
    await open("SUMI-1");
    expect(detail()!.textContent).toContain("No comments yet.");
    textarea().value = "  Looks good  ";
    textarea().dispatchEvent(new Event("input"));
    await submit();
    expect(client.addComment).toHaveBeenCalledWith("SUMI-1", { body: "Looks good" });
    expect(detail()!.querySelectorAll('[data-testid="comment"]')).toHaveLength(1);
    expect(detail()!.textContent).toContain("Alice Andersson");
    expect(textarea().value).toBe("");
  });

  it("keeps the text and shows the message when the server refuses", async () => {
    const addComment = vi.fn(async () => Promise.reject(new Error("Ticket SUMI-1 not found")));
    await render(fakeClient({ addComment }));
    await open("SUMI-1");
    textarea().value = "Hello";
    textarea().dispatchEvent(new Event("input"));
    await submit();
    expect(detail()!.querySelector('[role="alert"]')?.textContent).toBe("Ticket SUMI-1 not found");
    expect(textarea().value).toBe("Hello");
  });

  it("does not post an empty comment", async () => {
    const { client } = await render();
    await open("SUMI-1");
    await submit();
    expect(client.addComment).not.toHaveBeenCalled();
  });

  it("reloads comments when the server reports a change", async () => {
    const { client } = await render();
    await open("SUMI-1");
    const calls = vi.mocked(client.listComments).mock.calls.length;
    const { onEntry } = vi.mocked(client.watch).mock.calls[0]![0];
    vi.useFakeTimers();
    onEntry({ id: "a", actorId: "u2", action: "ticket.commented", ticketKey: "SUMI-1", data: {}, createdAt: new Date() });
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    await flushPromises();
    expect(vi.mocked(client.listComments).mock.calls.length).toBeGreaterThan(calls);
  });
});
