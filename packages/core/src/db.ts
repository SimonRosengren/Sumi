import { MongoClient, MongoServerError, type ClientSession, type Collection, type Db } from "mongodb";
import type {
  ActivityAction,
  Priority,
  Status,
  TicketLinks,
  UserKind,
} from "@sumi/contract";

export interface UserDoc {
  _id: string;
  kind: UserKind;
  name: string;
  githubId?: number;
  createdAt: Date;
}

export interface ProjectDoc {
  /** The project key, e.g. "SUMI". */
  _id: string;
  name: string;
  /** Highest ticket number issued so far. Only ever incremented, so keys are never reused. */
  lastNumber: number;
  createdAt: Date;
}

export interface TicketDoc {
  /** The ticket key, e.g. "SUMI-12". */
  _id: string;
  projectKey: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  assigneeId?: string;
  priority?: Priority;
  links: TicketLinks;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenDoc {
  /** SHA-256 (hex) of the token. The plaintext is never stored. */
  _id: string;
  userId: string;
  createdAt: Date;
}

export interface ActivityDoc {
  _id: string;
  actorId: string;
  action: ActivityAction;
  projectKey?: string;
  ticketKey?: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface Collections {
  users: Collection<UserDoc>;
  projects: Collection<ProjectDoc>;
  tickets: Collection<TicketDoc>;
  tokens: Collection<TokenDoc>;
  activity: Collection<ActivityDoc>;
}

export function collections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>("users"),
    projects: db.collection<ProjectDoc>("projects"),
    tickets: db.collection<TicketDoc>("tickets"),
    tokens: db.collection<TokenDoc>("tokens"),
    activity: db.collection<ActivityDoc>("activity"),
  };
}

export async function ensureIndexes(cols: Collections): Promise<void> {
  await Promise.all([
    cols.users.createIndex(
      { githubId: 1 },
      { unique: true, partialFilterExpression: { githubId: { $exists: true } } },
    ),
    cols.tickets.createIndex({ projectKey: 1, status: 1, number: 1 }),
    cols.activity.createIndex({ ticketKey: 1, createdAt: -1 }),
    cols.activity.createIndex({ projectKey: 1, createdAt: -1 }),
  ]);
}

export type Tx = <T>(fn: (session: ClientSession) => Promise<T>) => Promise<T>;

export function createTx(client: MongoClient): Tx {
  return (fn) => client.withSession((session) => session.withTransaction(() => fn(session)));
}

export function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}
