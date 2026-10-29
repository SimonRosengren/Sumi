import type { ClientSession } from "mongodb";
import { DEFAULT_LANES, type ActivityAction, type Lane } from "@sumi/contract";
import type { ActivityDoc, Collections, ProjectDoc, Tx } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";

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
    projectKey?: string;
    ticketKey?: string;
    data?: Record<string, unknown>;
  },
): Promise<ActivityDoc> {
  const doc: ActivityDoc = {
    _id: crypto.randomUUID(),
    actorId: entry.actorId,
    action: entry.action,
    ...(entry.projectKey !== undefined && { projectKey: entry.projectKey }),
    ...(entry.ticketKey !== undefined && { ticketKey: entry.ticketKey }),
    data: entry.data ?? {},
    createdAt: new Date(),
  };
  await cols.activity.insertOne(doc, { session });
  return doc;
}

/** Throws unless the actor exists and is a human. Used for credential management. */
export async function assertHuman(cols: Collections, id: string, session: ClientSession): Promise<void> {
  const actor = await cols.users.findOne({ _id: id }, { session });
  if (!actor) throw new NotFoundError(`Actor ${id} not found`);
  if (actor.kind !== "human") throw new ForbiddenError("Only humans can manage agents and tokens");
}

export function lanesOf(project: ProjectDoc): Lane[] {
  return project.lanes ?? DEFAULT_LANES.map((lane) => ({ ...lane }));
}
