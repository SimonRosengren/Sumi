import {
  ClaimNextInputSchema,
  CreateTicketInputSchema,
  ListTicketsInputSchema,
  MoveTicketInputSchema,
  TicketKeySchema,
  UpdateTicketInputSchema,
  type ClaimNextInput,
  type CreateTicketInput,
  type ListTicketsInput,
  type MoveTicketInput,
  type Ticket,
  type UpdateTicketInput,
} from "@sumi/contract";
import type { Filter, UpdateFilter } from "mongodb";
import type { TicketDoc } from "./db";
import { NotFoundError, ValidationError, parse } from "./errors";
import { assertUserExists, recordActivity, type Ctx } from "./shared";

function toTicket(doc: TicketDoc): Ticket {
  const { _id, ...rest } = doc;
  return { key: _id, ...rest };
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

        const now = new Date();
        const doc: TicketDoc = {
          _id: `${data.projectKey}-${project.lastNumber}`,
          projectKey: data.projectKey,
          number: project.lastNumber,
          title: data.title,
          description: data.description,
          status: data.status,
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
          data: { title: doc.title, status: doc.status },
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
      if (data.status !== undefined) filter.status = data.status;
      if (data.assigneeId !== undefined) filter.assigneeId = data.assigneeId;
      const docs = await cols.tickets.find(filter).sort({ number: 1 }).toArray();
      return docs.map(toTicket);
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
     * Atomically takes the oldest `todo` ticket that is unassigned (or already
     * assigned to the actor), assigns it to the actor and moves it to `in_progress`.
     * Returns null when nothing is available. Two actors can never get the same ticket.
     */
    async claimNext(actorId: string, input: ClaimNextInput): Promise<Ticket | null> {
      const { projectKey } = parse(ClaimNextInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const doc = await cols.tickets.findOneAndUpdate(
          {
            projectKey,
            status: "todo",
            $or: [{ assigneeId: { $exists: false } }, { assigneeId: actorId }],
          },
          { $set: { status: "in_progress", assigneeId: actorId, updatedAt: new Date() } },
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
