import type { ClientSession } from "mongodb";
import type { ActivityAction } from "@sumi/contract";
import type { Collections, Tx } from "./db";
import { NotFoundError } from "./errors";

export interface Ctx {
  cols: Collections;
  tx: Tx;
}

export async function assertUserExists(
  cols: Collections,
  id: string,
  session: ClientSession,
  label = "User",
): Promise<void> {
  const count = await cols.users.countDocuments({ _id: id }, { session, limit: 1 });
  if (count === 0) throw new NotFoundError(`${label} ${id} not found`);
}

/** Every mutation calls this inside its transaction (see AGENTS.md rule 5). */
export async function recordActivity(
  cols: Collections,
  session: ClientSession,
  entry: {
    actorId: string;
    action: ActivityAction;
    projectKey: string;
    ticketKey?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await cols.activity.insertOne(
    {
      _id: crypto.randomUUID(),
      actorId: entry.actorId,
      action: entry.action,
      projectKey: entry.projectKey,
      ...(entry.ticketKey !== undefined && { ticketKey: entry.ticketKey }),
      data: entry.data ?? {},
      createdAt: new Date(),
    },
    { session },
  );
}
