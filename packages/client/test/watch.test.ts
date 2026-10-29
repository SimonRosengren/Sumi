import { describe, expect, it, vi } from "vitest";
import { createClient } from "../src";

const entry = {
  id: "a1",
  actorId: "u1",
  action: "ticket.moved",
  projectKey: "SUMI",
  ticketKey: "SUMI-1",
  data: { from: "todo", to: "done" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** A response whose body delivers the given chunks, then ends (or stays open). */
function sse(chunks: string[], { keepOpen = false } = {}): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(enc.encode(chunk));
        if (!keepOpen) c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("watch", () => {
  it("sends the token in a header, parses frames split across chunks, and ignores pings", async () => {
    const ac = new AbortController();
    const fetch = vi.fn(async () =>
      sse(["event: ready\ndata: \n\nevent: ping\nda", "ta: \n\nevent: activity\ndata: ", `${JSON.stringify(entry)}\n\n`], { keepOpen: true }),
    );
    const client = createClient({ url: "http://x/", token: "sumi_t", fetch: fetch as unknown as typeof globalThis.fetch });
    const onEntry = vi.fn(() => ac.abort());
    const onReady = vi.fn();

    await client.watch({ onEntry, onReady, signal: ac.signal });

    expect(fetch).toHaveBeenCalledWith("http://x/events", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer sumi_t" }) }));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onEntry).toHaveBeenCalledTimes(1);
    expect(onEntry).toHaveBeenCalledWith(expect.objectContaining({ id: "a1", action: "ticket.moved", createdAt: new Date(entry.createdAt) }));
  });

  it("reconnects after the stream ends or fails, and reports ready each time", async () => {
    vi.useFakeTimers();
    try {
      const ac = new AbortController();
      let calls = 0;
      const fetch = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new TypeError("offline");
        return sse(["event: ready\ndata: \n\n"], { keepOpen: calls === 3 });
      });
      const onReady = vi.fn(() => {
        if (onReady.mock.calls.length === 2) ac.abort();
      });
      const client = createClient({ url: "http://x", token: "t", fetch: fetch as unknown as typeof globalThis.fetch });

      const done = client.watch({ onEntry: vi.fn(), onReady, signal: ac.signal });
      await vi.advanceTimersByTimeAsync(60_000);
      await done;

      expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(onReady).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up when the token is rejected", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 401 }));
    const client = createClient({ url: "http://x", token: "bad", fetch: fetch as unknown as typeof globalThis.fetch });
    await client.watch({ onEntry: vi.fn(), signal: new AbortController().signal });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops promptly when aborted while waiting to retry", async () => {
    const ac = new AbortController();
    const fetch = vi.fn(async () => { throw new TypeError("offline"); });
    const client = createClient({ url: "http://x", token: "t", fetch: fetch as unknown as typeof globalThis.fetch });
    const done = client.watch({ onEntry: vi.fn(), signal: ac.signal });
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await done;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
