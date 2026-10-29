import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { alice, fakeClient, ticket, tickets } from "./fixtures";

beforeEach(() => localStorage.clear());

async function render(client = fakeClient()) {
  const wrapper = mount(BoardView, { props: { client, me: alice }, attachTo: document.body });
  await flushPromises();
  return { wrapper, client };
}

const column = (w: Awaited<ReturnType<typeof render>>["wrapper"], status: string) =>
  w.get(`[data-status="${status}"]`);

describe("BoardView", () => {
  it("puts each ticket in the column for its status", async () => {
    const { wrapper } = await render();
    expect(column(wrapper, "backlog").text()).toContain("Backlog one");
    expect(column(wrapper, "in_progress").text()).toContain("Doing it");
    expect(column(wrapper, "done").text()).toContain("Finished");
    expect(column(wrapper, "todo").text()).toContain("No tickets");
  });

  it("shows counts, links, priority and assignee kind on cards", async () => {
    const { wrapper } = await render();
    expect(column(wrapper, "done").get("h2").element.nextElementSibling?.textContent).toBe("1");
    const card = column(wrapper, "in_progress").get('[data-key="SUMI-2"]');
    expect(card.text()).toContain("high"); // shown capitalised by CSS
    expect(card.text()).toContain("#7");
    expect(card.text()).toContain("feat/x");
    expect(card.get("[data-kind]").attributes("data-kind")).toBe("agent");
    expect(column(wrapper, "done").get("[data-kind]").attributes("data-kind")).toBe("human");
  });

  it("loads the first project, then switches and remembers the choice", async () => {
    const { wrapper, client } = await render();
    expect(client.listTickets).toHaveBeenCalledWith({ projectKey: "SUMI" });

    const web = wrapper.findAll("nav button").find((b) => b.text().includes("WEB"));
    await web?.trigger("click");
    await flushPromises();
    expect(client.listTickets).toHaveBeenLastCalledWith({ projectKey: "WEB" });
    expect(column(wrapper, "todo").text()).toContain("Landing page");
    expect(wrapper.text()).not.toContain("Backlog one");
    expect(localStorage.getItem("sumi.project")).toBe("WEB");

    const reopened = await render();
    expect(reopened.client.listTickets).toHaveBeenCalledWith({ projectKey: "WEB" });
  });

  it("falls back to the first project when the remembered one is gone", async () => {
    localStorage.setItem("sumi.project", "GONE");
    const { client } = await render();
    expect(client.listTickets).toHaveBeenCalledWith({ projectKey: "SUMI" });
  });

  it("shows an empty state when there are no projects", async () => {
    const { wrapper } = await render(fakeClient({ listProjects: vi.fn(async () => []) }));
    expect(wrapper.text()).toContain("No projects yet");
  });

  it("shows API errors instead of an empty board", async () => {
    const { wrapper } = await render(
      fakeClient({ listProjects: vi.fn(async () => Promise.reject(new Error("Cannot reach the API"))) }),
    );
    expect(wrapper.get('[role="alert"]').text()).toBe("Cannot reach the API");
  });

  it("refreshes on demand and emits sign-out", async () => {
    const { wrapper, client } = await render();
    await wrapper.get('[aria-label="Refresh"]').trigger("click");
    await flushPromises();
    expect(client.listTickets).toHaveBeenCalledTimes(2);

    await wrapper.get('[aria-label="Sign out"]').trigger("click");
    expect(wrapper.emitted("signOut")).toHaveLength(1);
  });

  describe("editing lanes", () => {
    const edit = async (client = fakeClient()) => {
      const r = await render(client);
      await r.wrapper.get('[aria-label="Edit lanes"]').trigger("click");
      return r;
    };
    const names = (w: Awaited<ReturnType<typeof render>>["wrapper"]) => w.findAll("section[data-status]").map((s) => s.attributes("data-status"));

    /** A minimal DataTransfer: happy-dom's does not carry data between events. */
    function dataTransfer() {
      const data = new Map<string, string>();
      return {
        setData: (k: string, v: string) => void data.set(k, v),
        getData: (k: string) => data.get(k) ?? "",
        get types() { return [...data.keys()]; },
        effectAllowed: "",
      };
    }

    it("shows no lane controls until edit mode is on, and hides them again with Done", async () => {
      const { wrapper } = await render();
      expect(wrapper.find('[aria-label="Add lane"]').exists()).toBe(false);
      expect(wrapper.find('[aria-label="Rename Todo"]').exists()).toBe(false);
      expect(wrapper.find("[data-lane-handle][draggable=true]").exists()).toBe(false);

      await wrapper.get('[aria-label="Edit lanes"]').trigger("click");
      expect(wrapper.find('[aria-label="Add lane"]').exists()).toBe(true);
      expect(wrapper.find('[aria-label="Rename Todo"]').exists()).toBe(true);
      expect(wrapper.find("[data-lane-handle][draggable=true]").exists()).toBe(true);

      await wrapper.get('[aria-label="Done editing lanes"]').trigger("click");
      expect(wrapper.find('[aria-label="Add lane"]').exists()).toBe(false);
      expect(wrapper.find('[aria-label="Edit lanes"]').exists()).toBe(true);
    });

    it("renames a lane from the pen: Enter saves, Escape cancels", async () => {
      const { wrapper, client } = await edit();
      await wrapper.get('[aria-label="Rename Todo"]').trigger("click");
      const input = wrapper.get('input[aria-label="Lane name"]');
      expect(document.activeElement).toBe(input.element);
      expect((input.element as HTMLInputElement).value).toBe("Todo");

      await input.setValue("  Ready  ");
      await input.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(client.setLanes).toHaveBeenCalledTimes(1);
      const [key, body] = vi.mocked(client.setLanes).mock.calls[0] as unknown as [string, { lanes: { id: string; name: string }[] }];
      expect(key).toBe("SUMI");
      expect(body.lanes.map((l) => `${l.id}:${l.name}`)).toEqual([
        "backlog:Backlog", "todo:Ready", "in_progress:In progress", "in_review:In review", "done:Done",
      ]);
      expect(wrapper.get('[data-status="todo"] h2').text()).toBe("Ready");
      expect(wrapper.find('input[aria-label="Lane name"]').exists()).toBe(false);

      await wrapper.get('[aria-label="Rename Backlog"]').trigger("click");
      await wrapper.get('input[aria-label="Lane name"]').setValue("Nope");
      await wrapper.get('input[aria-label="Lane name"]').trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(client.setLanes).toHaveBeenCalledTimes(1);
      expect(wrapper.get('[data-status="backlog"] h2').text()).toBe("Backlog");
    });

    it("does not save an empty or unchanged name", async () => {
      const { wrapper, client } = await edit();
      await wrapper.get('[aria-label="Rename Todo"]').trigger("click");
      await wrapper.get('input[aria-label="Lane name"]').setValue("   ");
      await wrapper.get('input[aria-label="Lane name"]').trigger("keydown", { key: "Enter" });
      await wrapper.get('[aria-label="Rename Todo"]').trigger("click");
      await wrapper.get('input[aria-label="Lane name"]').trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(client.setLanes).not.toHaveBeenCalled();
      expect(wrapper.get('[data-status="todo"] h2').text()).toBe("Todo");
    });

    it("adds a lane at the far right and puts the cursor in its name", async () => {
      const { wrapper, client } = await edit();
      await wrapper.get('[aria-label="Add lane"]').trigger("click");
      await flushPromises();

      const [, body] = vi.mocked(client.setLanes).mock.calls[0] as unknown as [string, { lanes: { id?: string; name: string }[] }];
      expect(body.lanes.at(-1)).toEqual({ name: "New lane" });
      expect(names(wrapper).at(-1)).toBe("new_lane");
      const input = wrapper.get('[data-status="new_lane"] input[aria-label="Lane name"]');
      expect(document.activeElement).toBe(input.element);
    });

    it("reorders lanes by dragging one by its name onto another", async () => {
      const { wrapper, client } = await edit();
      const dt = dataTransfer();
      await wrapper.get('[data-status="done"] [data-lane-handle]').trigger("dragstart", { dataTransfer: dt });
      await wrapper.get('[data-status="todo"]').trigger("dragover", { dataTransfer: dt });
      await wrapper.get('[data-status="todo"]').trigger("drop", { dataTransfer: dt });
      await flushPromises();

      expect(names(wrapper)).toEqual(["backlog", "done", "todo", "in_progress", "in_review"]);
      const [, body] = vi.mocked(client.setLanes).mock.calls[0] as unknown as [string, { lanes: { id: string }[] }];
      expect(body.lanes.map((l) => l.id)).toEqual(["backlog", "done", "todo", "in_progress", "in_review"]);
    });

    it("keeps a lane drag from moving tickets, and ignores the drag outside edit mode", async () => {
      const { wrapper, client } = await render();
      const dt = dataTransfer();
      dt.setData("application/x-sumi-lane", "done");
      await wrapper.get('[data-status="todo"]').trigger("drop", { dataTransfer: dt });
      await wrapper.get('[data-status="todo"] [data-dropzone]').trigger("drop", { dataTransfer: dt });
      await flushPromises();
      expect(client.setLanes).not.toHaveBeenCalled();
      expect(client.moveTicket).not.toHaveBeenCalled();
    });

    it("deletes an empty lane but not one that holds tickets", async () => {
      const { wrapper, client } = await edit();
      expect(wrapper.get('[aria-label="Delete Backlog"]').attributes("disabled")).toBeDefined();
      await wrapper.get('[aria-label="Delete Todo"]').trigger("click");
      await flushPromises();
      const [, body] = vi.mocked(client.setLanes).mock.calls[0] as unknown as [string, { lanes: { id: string }[] }];
      expect(body.lanes.map((l) => l.id)).toEqual(["backlog", "in_progress", "in_review", "done"]);
      expect(wrapper.find('[data-status="todo"]').exists()).toBe(false);
    });

    it("shows the server's refusal and restores the lanes", async () => {
      const setLanes = vi.fn(async () => Promise.reject(new Error("Lane Todo still has 1 ticket; move them first")));
      const { wrapper } = await edit(fakeClient({ setLanes }));
      await wrapper.get('[aria-label="Delete Todo"]').trigger("click");
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toContain("still has 1 ticket");
      expect(wrapper.find('[data-status="todo"]').exists()).toBe(true);
    });

    it("lays the board out from the project's own lanes", async () => {
      const lanes = [{ id: "inbox", name: "Inbox" }, { id: "done", name: "Shipped" }];
      const listProjects = vi.fn(async () => [{ key: "SUMI", name: "Sumi", lanes, createdAt: new Date() }]);
      const { wrapper } = await render(fakeClient({ listProjects }));
      expect(names(wrapper)).toEqual(["inbox", "done"]);
      expect(column(wrapper, "done").text()).toContain("Shipped");
      expect(column(wrapper, "done").text()).toContain("Finished");
    });
  });

  describe("live updates", () => {
    type WatchOpts = { onEntry: (e: unknown) => void; onReady: () => void; signal: AbortSignal };
    const opts = (client: Awaited<ReturnType<typeof render>>["client"]) =>
      vi.mocked(client.watch).mock.calls[0]?.[0] as unknown as WatchOpts;

    it("starts watching once loaded and stops when the board goes away", async () => {
      const { wrapper, client } = await render();
      expect(client.watch).toHaveBeenCalledTimes(1);
      expect(opts(client).signal.aborted).toBe(false);
      wrapper.unmount();
      expect(opts(client).signal.aborted).toBe(true);
    });

    it("shows a ticket that appears on the server without a manual refresh", async () => {
      const listTickets = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([ticket({ key: "SUMI-9", title: "Made by an agent", status: "todo" })]);
      const { wrapper, client } = await render(fakeClient({ listTickets }));
      expect(wrapper.text()).not.toContain("Made by an agent");

      vi.useFakeTimers();
      try {
        opts(client).onEntry({});
        await vi.advanceTimersByTimeAsync(200);
      } finally {
        vi.useRealTimers();
      }
      await flushPromises();
      expect(column(wrapper, "todo").text()).toContain("Made by an agent");
    });

    it("reloads once for a burst of events", async () => {
      const { client } = await render();
      const before = vi.mocked(client.listTickets).mock.calls.length;
      vi.useFakeTimers();
      try {
        for (let i = 0; i < 5; i++) opts(client).onEntry({});
        await vi.advanceTimersByTimeAsync(200);
      } finally {
        vi.useRealTimers();
      }
      await flushPromises();
      expect(vi.mocked(client.listTickets).mock.calls.length - before).toBe(1);
    });

    it("reloads when the connection (re)opens, to catch up on missed changes", async () => {
      const { client } = await render();
      const before = vi.mocked(client.listTickets).mock.calls.length;
      opts(client).onReady();
      await flushPromises();
      expect(vi.mocked(client.listTickets).mock.calls.length - before).toBe(1);
    });

    it("does not overlap reloads, and runs once more if asked meanwhile", async () => {
      let release!: () => void;
      let running = 0;
      let maxRunning = 0;
      const listTickets = vi.fn(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise<void>((r) => (release = r));
        running--;
        return [];
      });
      const { client } = await render(fakeClient({ listTickets: vi.fn(async () => []) }));
      // Swap in a slow implementation for the refreshes below.
      vi.mocked(client.listTickets).mockImplementation(listTickets);

      opts(client).onReady();
      opts(client).onReady();
      opts(client).onReady();
      await flushPromises();
      expect(listTickets).toHaveBeenCalledTimes(1);
      release();
      await flushPromises();
      expect(listTickets).toHaveBeenCalledTimes(2); // one catch-up run, not three
      release();
      await flushPromises();
      expect(maxRunning).toBe(1);
    });

    it("drops a stale reload that finishes after switching project", async () => {
      let finishSumi!: () => void;
      const listTickets = vi.fn(async ({ projectKey }: { projectKey: string }) => {
        if (projectKey === "SUMI" && listTickets.mock.calls.length > 1) {
          await new Promise<void>((r) => (finishSumi = r));
        }
        return tickets[projectKey] ?? [];
      });
      const { wrapper, client } = await render(fakeClient({ listTickets }));

      opts(client).onReady(); // slow reload of SUMI starts
      await flushPromises();
      const web = wrapper.findAll("nav button").find((b) => b.text().includes("WEB"));
      await web?.trigger("click");
      await flushPromises();
      finishSumi();
      await flushPromises();

      expect(column(wrapper, "todo").text()).toContain("Landing page");
      expect(wrapper.text()).not.toContain("Backlog one");
    });
  });
});
