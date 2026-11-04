import { MongoClient, MongoServerError, type ClientSession, type Collection, type Db } from "mongodb";
import type {
  ActivityAction,
  Lane,
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
  /** Serializes board membership and lane/status changes against project/board deletion. */
  boardVersion?: number;
  createdAt: Date;
}

export interface BoardDoc {
  _id: string;
  projectKey: string;
  name: string;
  lanes: Lane[];
  createdAt: Date;
}

export interface TicketDoc {
  /** The ticket key, e.g. "SUMI-12". */
  _id: string;
  projectKey: string;
  boardId: string;
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
  boards: Collection<BoardDoc>;
  tickets: Collection<TicketDoc>;
  tokens: Collection<TokenDoc>;
  activity: Collection<ActivityDoc>;
}

export function collections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>("users"),
    projects: db.collection<ProjectDoc>("projects"),
    boards: db.collection<BoardDoc>("boards"),
    tickets: db.collection<TicketDoc>("tickets"),
    tokens: db.collection<TokenDoc>("tokens"),
    activity: db.collection<ActivityDoc>("activity"),
  };
}

export type Tx = <T>(fn: (session: ClientSession) => Promise<T>) => Promise<T>;

export function createTx(client: MongoClient): Tx {
  return (fn) => client.withSession((session) => session.withTransaction(() => fn(session)));
}

export function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}
