import { TicketKeySchema, ProjectKeySchema, type ActivityEntry } from "@sumi/contract";
import { z } from "zod";
import type { ActivityDoc } from "./db";
import { parse } from "./errors";
import type { Ctx } from "./shared";

const ListActivityInputSchema = z.object({
  projectKey: ProjectKeySchema.optional(),
  ticketKey: TicketKeySchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

function toEntry(doc: ActivityDoc): ActivityEntry {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export function createActivityService({ cols }: Ctx) {
  return {
    /** Newest first. */
    async list(input: z.input<typeof ListActivityInputSchema> = {}): Promise<ActivityEntry[]> {
      const data = parse(ListActivityInputSchema, input);
      const filter: Partial<Pick<ActivityDoc, "projectKey" | "ticketKey">> = {};
      if (data.projectKey !== undefined) filter.projectKey = data.projectKey;
      if (data.ticketKey !== undefined) filter.ticketKey = data.ticketKey;
      const docs = await cols.activity.find(filter).sort({ createdAt: -1, _id: -1 }).limit(data.limit).toArray();
      return docs.map(toEntry);
    },
  };
}
