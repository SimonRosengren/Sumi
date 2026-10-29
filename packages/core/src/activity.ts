import { ListActivityInputSchema, type ActivityEntry, type ListActivityInput } from "@sumi/contract";
import type { ActivityDoc } from "./db";
import { parse } from "./errors";
import type { Ctx } from "./shared";

function toEntry(doc: ActivityDoc): ActivityEntry {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export function createActivityService({ cols }: Ctx) {
  return {
    /** Newest first. */
    async list(input: ListActivityInput = {}): Promise<ActivityEntry[]> {
      const data = parse(ListActivityInputSchema, input);
      const filter: Partial<Pick<ActivityDoc, "projectKey" | "ticketKey">> = {};
      if (data.projectKey !== undefined) filter.projectKey = data.projectKey;
      if (data.ticketKey !== undefined) filter.ticketKey = data.ticketKey;
      const docs = await cols.activity.find(filter).sort({ createdAt: -1, _id: -1 }).limit(data.limit).toArray();
      return docs.map(toEntry);
    },

    /**
     * Calls `onEntry` for every activity entry written from now on (a Mongo change
     * stream, so it also sees writes made by other processes). Resolves once the
     * stream is open, so anything written after that is delivered. `onError` is
     * called if the stream breaks; it does not resume, the caller re-subscribes.
     * Returns a function that stops the subscription.
     */
    async subscribe(onEntry: (entry: ActivityEntry) => void, onError: (err: unknown) => void): Promise<() => Promise<void>> {
      const stream = cols.activity.watch([{ $match: { operationType: "insert" } }]);
      let stopped = false;
      try {
        const first = await stream.tryNext(); // opens the cursor
        void (async () => {
          try {
            if (first?.operationType === "insert") onEntry(toEntry(first.fullDocument));
            for await (const change of stream) {
              if (change.operationType === "insert") onEntry(toEntry(change.fullDocument));
            }
          } catch (err) {
            if (!stopped) onError(err);
          }
        })();
      } catch (err) {
        await stream.close().catch(() => undefined);
        throw err;
      }
      return async () => {
        stopped = true;
        await stream.close();
      };
    },
  };
}
