import type { ClientSession } from "mongodb";
import { type ActivityAction } from "@sumi/contract";
import type { ActivityDoc, BoardDoc, Collections, Tx } from "./db";
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

/** Throws unless the actor exists and is a human. Used for credential and project management. */
export async function assertHuman(
  cols: Collections,
  id: string,
  session: ClientSession,
  message = "Only humans can manage agents and tokens",
): Promise<void> {
  const actor = await cols.users.findOne({ _id: id }, { session });
  if (!actor) throw new NotFoundError(`Actor ${id} not found`);
  if (actor.kind !== "human") throw new ForbiddenError(message);
}

/** Serializes board membership and lane/status changes against project/board deletion. */
export async function lockProject(cols: Collections, projectKey: string, session: ClientSession): Promise<void> {
  const result = await cols.projects.updateOne({ _id: projectKey }, { $inc: { boardVersion: 1 } }, { session });
  if (result.matchedCount === 0) throw new NotFoundError(`Project ${projectKey} not found`);
}

export async function assertBoard(cols: Collections, projectKey: string, boardId: string, session?: ClientSession): Promise<BoardDoc> {
  const board = await cols.boards.findOne({ _id: boardId, projectKey }, session ? { session } : {});
  if (!board) throw new NotFoundError(`Board ${boardId} not found in project ${projectKey}`);
  return board;
}
