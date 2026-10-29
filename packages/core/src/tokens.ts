import { createHash, randomBytes } from "node:crypto";
import type { ClientSession } from "mongodb";
import { TokenIdSchema, type TokenInfo, type User } from "@sumi/contract";
import type { Collections } from "./db";
import { NotFoundError, parse } from "./errors";
import { assertHuman, assertUserExists, recordActivity, type Ctx } from "./shared";

const toInfo = (doc: { _id: string; userId: string; createdAt: Date }): TokenInfo => ({
  id: doc._id.slice(0, 16),
  userId: doc.userId,
  createdAt: doc.createdAt,
});

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a token for `userId` and returns the plaintext, which cannot be recovered later.
 * Tokens are 256 random bits, so a fast hash is enough (no salt or stretching needed).
 * Callers run this inside a transaction and record the activity entry.
 */
export async function issueToken(cols: Collections, session: ClientSession, userId: string): Promise<string> {
  const token = `sumi_${randomBytes(32).toString("base64url")}`;
  await cols.tokens.insertOne({ _id: hashToken(token), userId, createdAt: new Date() }, { session });
  return token;
}

export function createTokenService({ cols, tx }: Ctx) {
  return {
    /** A human creates a token for themselves or for an agent. Returns the plaintext once. */
    async create(actorId: string, userId: string): Promise<string> {
      return tx(async (session) => {
        await assertHuman(cols, actorId, session);
        await assertUserExists(cols, userId, session);
        const token = await issueToken(cols, session, userId);
        await recordActivity(cols, session, { actorId, action: "token.created", data: { userId } });
        return token;
      });
    },

    /** A human lists the tokens of a user (default: themselves), newest first. Never includes the secrets. */
    async list(actorId: string, userId: string = actorId): Promise<TokenInfo[]> {
      return tx(async (session) => {
        await assertHuman(cols, actorId, session);
        await assertUserExists(cols, userId, session);
        const docs = await cols.tokens.find({ userId }, { session }).sort({ createdAt: -1, _id: 1 }).toArray();
        return docs.map(toInfo);
      });
    },

    /** A human revokes a token by its public id. The token stops working at once. */
    async revoke(actorId: string, tokenId: string): Promise<void> {
      const id = parse(TokenIdSchema, tokenId);
      await tx(async (session) => {
        await assertHuman(cols, actorId, session);
        // The id is a hex prefix of the stored hash. Hex needs no escaping in a regex.
        const doc = await cols.tokens.findOneAndDelete({ _id: { $regex: `^${id}` } }, { session });
        if (!doc) throw new NotFoundError(`Token ${id} not found`);
        await recordActivity(cols, session, {
          actorId,
          action: "token.revoked",
          data: { userId: doc.userId, tokenId: id },
        });
      });
    },

    /** Resolves a plaintext token to its user, or null if unknown. */
    async authenticate(token: string): Promise<User | null> {
      const doc = await cols.tokens.findOne({ _id: hashToken(token) });
      if (!doc) return null;
      const user = await cols.users.findOne({ _id: doc.userId });
      if (!user) return null;
      const { _id, ...rest } = user;
      return { id: _id, ...rest };
    },
  };
}
