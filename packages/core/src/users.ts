import { CreateUserInputSchema, type CreateUserInput, type User } from "@sumi/contract";
import type { UserDoc } from "./db";
import { isDuplicateKey } from "./db";
import { ConflictError, parse } from "./errors";
import type { Ctx } from "./shared";

function toUser(doc: UserDoc): User {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Users are created by the system (sign-in, agent token setup), not by another
 * actor, so creating one is the only mutation that is not written to the activity log.
 */
export function createUserService({ cols }: Ctx) {
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

    async get(id: string): Promise<User | null> {
      const doc = await cols.users.findOne({ _id: id });
      return doc ? toUser(doc) : null;
    },
  };
}
