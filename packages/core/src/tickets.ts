import {
  ClaimNextInputSchema,
  CreateTicketInputSchema,
  ListTicketsInputSchema,
  MoveTicketInputSchema,
  TicketKeySchema,
  TransferTicketInputSchema,
  UpdateTicketInputSchema,
  type ClaimNextInput,
  type CreateTicketInput,
  type ListTicketsInput,
  type MoveTicketInput,
  type Ticket,
  type TransferTicketInput,
  type UpdateTicketInput,
} from "@sumi/contract";
import type { Filter, UpdateFilter } from "mongodb";
import type { BoardDoc, TicketDoc } from "./db";
import { ConflictError, NotFoundError, ValidationError, parse } from "./errors";
import { assertBoard, assertUserExists, lockProject, recordActivity, type Ctx } from "./shared";

function toTicket(doc: TicketDoc): Ticket {
  const { _id, ...rest } = doc;
  return { key: _id, ...rest };
}

/** Lanes that claiming moves tickets between. They are found by id, so renaming a lane does not break it. */
export const CLAIM_FROM = "todo";
export const CLAIM_TO = "in_progress";

function assertLane(board: BoardDoc, status: string): void {
  const lanes = board.lanes;
  if (!lanes.some((l) => l.id === status)) {
    throw new ValidationError(`Board ${board._id} has no lane ${status} (lanes: ${lanes.map((l) => l.id).join(", ")})`);
  }
}

export function createTicketService({ cols, tx }: Ctx) {
  const notFound = (key: string) => new NotFoundError(`Ticket ${key} not found`);

  return {
    async create(actorId: string, input: CreateTicketInput): Promise<Ticket> {
      const data = parse(CreateTicketInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        if (data.assigneeId !== undefined) {
          await assertUserExists(cols, data.assigneeId, session, "Assignee");
        }
        // Atomic increment: concurrent creators get distinct numbers, and numbers are never reused.
        const project = await cols.projects.findOneAndUpdate(
          { _id: data.projectKey },
          { $inc: { lastNumber: 1 } },
          { returnDocument: "after", session },
        );
        if (!project) throw new NotFoundError(`Project ${data.projectKey} not found`);
        let boardId = data.boardId;
        if (boardId === undefined) {
          const boards = await cols.boards.find({ projectKey: data.projectKey }, { session }).limit(2).toArray();
          if (boards.length !== 1) throw new ValidationError("Choose a boardId when a project has multiple boards");
          boardId = boards[0]!._id;
        }
        const board = await assertBoard(cols, data.projectKey, boardId, session);
        const status = data.status ?? board.lanes[0]?.id;
        if (status === undefined) throw new ConflictError(`Board ${boardId} has no lanes`);
        assertLane(board, status);

        const now = new Date();
        const doc: TicketDoc = {
          _id: `${data.projectKey}-${project.lastNumber}`,
          projectKey: data.projectKey,
          boardId,
          number: project.lastNumber,
          title: data.title,
          description: data.description,
          status,
          ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
          ...(data.priority !== undefined && { priority: data.priority }),
          links: data.links,
          createdAt: now,
          updatedAt: now,
        };
        await cols.tickets.insertOne(doc, { session });
        await recordActivity(cols, session, {
          actorId,
          action: "ticket.created",
          projectKey: doc.projectKey,
          ticketKey: doc._id,
          data: { title: doc.title, status: doc.status, boardId },
        });
        return toTicket(doc);
      });
    },

    async get(key: string): Promise<Ticket | null> {
      const doc = await cols.tickets.findOne({ _id: parse(TicketKeySchema, key) });
      return doc ? toTicket(doc) : null;
    },

    async list(input: ListTicketsInput): Promise<Ticket[]> {
      const data = parse(ListTicketsInputSchema, input);
      const filter: Filter<TicketDoc> = { projectKey: data.projectKey };
      if (data.boardId !== undefined) {
        await assertBoard(cols, data.projectKey, data.boardId);
        filter.boardId = data.boardId;
      }
      if (data.status !== undefined) filter.status = data.status;
      if (data.assigneeId !== undefined) filter.assigneeId = data.assigneeId;
      const docs = await cols.tickets.find(filter).sort({ number: 1 }).toArray();
      return docs.map(toTicket);
    },

    /** Preserves status when the destination has it; otherwise uses its first lane. */
    async transfer(actorId: string, key: string, input: TransferTicketInput): Promise<Ticket> {
      parse(TicketKeySchema, key);
      const { boardId } = parse(TransferTicketInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const before = await cols.tickets.findOne({ _id: key }, { session });
        if (!before) throw notFound(key);
        await lockProject(cols, before.projectKey, session);
        const board = await assertBoard(cols, before.projectKey, boardId, session);
        if (before.boardId === boardId) return toTicket(before);
        const status = board.lanes.some((l) => l.id === before.status) ? before.status : board.lanes[0]?.id;
        if (!status) throw new ConflictError(`Board ${boardId} has no lanes`);
        const updatedAt = new Date();
        await cols.tickets.updateOne({ _id: key }, { $set: { boardId, status, updatedAt } }, { session });
        await recordActivity(cols, session, {
          actorId, action: "ticket.transferred", projectKey: before.projectKey, ticketKey: key,
          data: { from: before.boardId, to: boardId, fromStatus: before.status, toStatus: status },
        });
        return toTicket({ ...before, boardId, status, updatedAt });
      });
    },

    /** Changes only the provided fields. `links` replaces the whole links object. */
    async update(actorId: string, key: string, input: UpdateTicketInput): Promise<Ticket> {
      parse(TicketKeySchema, key);
      const data = parse(UpdateTicketInputSchema, input);
      const fields = Object.keys(data);
      if (fields.length === 0) throw new ValidationError("No fields to update");

      const $set: Partial<TicketDoc> = { updatedAt: new Date() };
      const $unset: Record<string, ""> = {};
      if (data.title !== undefined) $set.title = data.title;
      if (data.description !== undefined) $set.description = data.description;
      if (data.links !== undefined) $set.links = data.links;
      if (data.assigneeId === null) $unset.assigneeId = "";
      else if (data.assigneeId !== undefined) $set.assigneeId = data.assigneeId;
      if (data.priority === null) $unset.priority = "";
      else if (data.priority !== undefined) $set.priority = data.priority;

      const update: UpdateFilter<TicketDoc> = { $set };
      if (Object.keys($unset).length > 0) update.$unset = $unset;

      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        if (typeof data.assigneeId === "string") {
          await assertUserExists(cols, data.assigneeId, session, "Assignee");
        }
        const doc = await cols.tickets.findOneAndUpdate({ _id: key }, update, {
          returnDocument: "after",
          session,
        });
        if (!doc) throw notFound(key);
        await recordActivity(cols, session, {
          actorId,
          action: "ticket.updated",
          projectKey: doc.projectKey,
          ticketKey: key,
          data: { fields },
        });
        return toTicket(doc);
      });
    },

    /** Any status can move to any other. Moving to the current status is a no-op. */
    async move(actorId: string, key: string, input: MoveTicketInput): Promise<Ticket> {
      parse(TicketKeySchema, key);
      const { status } = parse(MoveTicketInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const ticket = await cols.tickets.findOne({ _id: key }, { session });
        if (!ticket) throw notFound(key);
        await lockProject(cols, ticket.projectKey, session);
        assertLane(await assertBoard(cols, ticket.projectKey, ticket.boardId, session), status);
        const before = await cols.tickets.findOneAndUpdate(
          { _id: key, status: { $ne: status } },
          { $set: { status, updatedAt: new Date() } },
          { returnDocument: "before", session },
        );
        if (!before) {
          const current = await cols.tickets.findOne({ _id: key }, { session });
          if (!current) throw notFound(key);
          return toTicket(current);
        }
        const after: TicketDoc = { ...before, status, updatedAt: new Date() };
        await recordActivity(cols, session, {
          actorId,
          action: "ticket.moved",
          projectKey: before.projectKey,
          ticketKey: key,
          data: { from: before.status, to: status },
        });
        return toTicket(after);
      });
    },

    /**
     * Atomically takes the oldest ticket in the `todo` lane that is unassigned (or already
     * assigned to the actor), assigns it to the actor and moves it to `in_progress`.
     * Returns null when nothing is available. Two actors can never get the same ticket.
     * Skips boards without both lanes; an explicitly selected board must have both.
     */
    async claimNext(actorId: string, input: ClaimNextInput): Promise<Ticket | null> {
      const { projectKey, boardId } = parse(ClaimNextInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        await lockProject(cols, projectKey, session);
        if (boardId !== undefined) await assertBoard(cols, projectKey, boardId, session);
        const eligible = await cols.boards.find({
          projectKey, ...(boardId !== undefined && { _id: boardId }), "lanes.id": { $all: [CLAIM_FROM, CLAIM_TO] },
        }, { session }).toArray();
        if (boardId !== undefined && eligible.length === 0) {
          throw new ConflictError(`Board ${boardId} needs todo and in_progress lanes to claim tickets`);
        }
        const doc = await cols.tickets.findOneAndUpdate(
          {
            projectKey,
            boardId: { $in: eligible.map((b) => b._id) },
            status: CLAIM_FROM,
            $or: [{ assigneeId: { $exists: false } }, { assigneeId: actorId }],
          },
          { $set: { status: CLAIM_TO, assigneeId: actorId, updatedAt: new Date() } },
          { sort: { number: 1 }, returnDocument: "after", session },
        );
        if (!doc) return null;
        await recordActivity(cols, session, {
          actorId,
          action: "ticket.claimed",
          projectKey,
          ticketKey: doc._id,
        });
        return toTicket(doc);
      });
    },
  };
}
