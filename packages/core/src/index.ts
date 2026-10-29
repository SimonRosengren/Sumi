import { MongoClient } from "mongodb";
import { createActivityService } from "./activity";
import { createCommentService } from "./comments";
import { collections, createTx, ensureIndexes } from "./db";
import { createGithubService } from "./github";
import { createProjectService } from "./projects";
import { createTicketService } from "./tickets";
import { createTokenService } from "./tokens";
import { createUserService } from "./users";

export * from "./errors";
export { GITHUB_USER_ID, statusForPullRequest, type PullRequestEvent } from "./github";

export interface CoreOptions {
  /** MongoDB connection string. Must point at a replica set (transactions, change streams). */
  uri: string;
  /** Defaults to the database named in the URI. */
  dbName?: string;
}

export async function createCore({ uri, dbName }: CoreOptions) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const cols = collections(db);
  await ensureIndexes(cols);
  const ctx = { cols, tx: createTx(client) };
  const tickets = createTicketService(ctx);

  return {
    users: createUserService(ctx),
    projects: createProjectService(ctx),
    tickets,
    comments: createCommentService(ctx),
    github: createGithubService(ctx, tickets),
    tokens: createTokenService(ctx),
    activity: createActivityService(ctx),
    /** Drops the whole database. For tests only. */
    dropDatabase: () => db.dropDatabase(),
    close: () => client.close(),
  };
}

export type Core = Awaited<ReturnType<typeof createCore>>;
