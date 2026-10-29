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
