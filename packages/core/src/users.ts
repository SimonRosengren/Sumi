import {
  CreateAgentInputSchema,
  CreateUserInputSchema,
  type AgentCreated,
  type CreateAgentInput,
  type CreateUserInput,
  type User,
} from "@sumi/contract";
import type { UserDoc } from "./db";
import { isDuplicateKey } from "./db";
import { ConflictError, parse } from "./errors";
import { assertHuman, recordActivity, type Ctx } from "./shared";
import { issueToken } from "./tokens";

function toUser(doc: UserDoc): User {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Users are created by the system (sign-in, agent token setup), not by another
 * actor, so creating one is the only mutation that is not written to the activity log.
 */
export function createUserService({ cols, tx }: Ctx) {
  return {
    async create(input: CreateUserInput): Promise<User> {
      const data = parse(CreateUserInputSchema, input);
      const doc: UserDoc = {
        _id: crypto.randomUUID(),
        kind: data.kind,
        name: data.name,
        ...(data.githubId !== undefined && { githubId: data.githubId }),
        createdAt: new Date(),
      };
      try {
        await cols.users.insertOne(doc);
      } catch (err) {
        if (isDuplicateKey(err)) throw new ConflictError(`GitHub user ${data.githubId} already exists`);
        throw err;
      }
      return toUser(doc);
    },

    /** A human creates an agent user together with its first token. */
    async createAgent(actorId: string, input: CreateAgentInput): Promise<AgentCreated> {
      const data = parse(CreateAgentInputSchema, input);
      return tx(async (session) => {
        await assertHuman(cols, actorId, session);
        const doc: UserDoc = { _id: crypto.randomUUID(), kind: "agent", name: data.name, createdAt: new Date() };
        await cols.users.insertOne(doc, { session });
        const token = await issueToken(cols, session, doc._id);
        await recordActivity(cols, session, {
          actorId,
          action: "agent.created",
          data: { agentId: doc._id, name: data.name },
        });
        return { user: toUser(doc), token };
      });
    },

    async list(): Promise<User[]> {
      const docs = await cols.users.find().sort({ createdAt: 1, _id: 1 }).toArray();
      return docs.map(toUser);
    },

    async get(id: string): Promise<User | null> {
      const doc = await cols.users.findOne({ _id: id });
      return doc ? toUser(doc) : null;
    },
  };
}
