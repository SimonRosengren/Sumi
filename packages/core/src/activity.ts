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
  };
}
