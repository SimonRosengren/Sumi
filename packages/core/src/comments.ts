import { CreateCommentInputSchema, TicketKeySchema, type Comment, type CreateCommentInput } from "@sumi/contract";
import type { ActivityDoc } from "./db";
import { NotFoundError, parse } from "./errors";
import { assertUserExists, recordActivity, type Ctx } from "./shared";

/** Comments are `ticket.commented` activity entries: the author is the actor and the text is `data.body`. */
function toComment(doc: ActivityDoc & { ticketKey: string }): Comment {
  return {
    id: doc._id,
    ticketKey: doc.ticketKey,
    authorId: doc.actorId,
    body: typeof doc.data.body === "string" ? doc.data.body : "",
    createdAt: doc.createdAt,
  };
}

export function createCommentService({ cols, tx }: Ctx) {
  const notFound = (key: string) => new NotFoundError(`Ticket ${key} not found`);

  return {
    async add(actorId: string, ticketKey: string, input: CreateCommentInput): Promise<Comment> {
      parse(TicketKeySchema, ticketKey);
      const { body } = parse(CreateCommentInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const ticket = await cols.tickets.findOne({ _id: ticketKey }, { session });
        if (!ticket) throw notFound(ticketKey);
        const doc = await recordActivity(cols, session, {
          actorId,
          action: "ticket.commented",
          projectKey: ticket.projectKey,
          ticketKey,
          data: { body },
        });
        return toComment({ ...doc, ticketKey });
      });
    },

    /** Oldest first. */
    async list(ticketKey: string): Promise<Comment[]> {
      parse(TicketKeySchema, ticketKey);
      if ((await cols.tickets.countDocuments({ _id: ticketKey }, { limit: 1 })) === 0) throw notFound(ticketKey);
      const docs = await cols.activity
        .find({ ticketKey, action: "ticket.commented" })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      return docs.map((doc) => toComment({ ...doc, ticketKey }));
    },
  };
}
