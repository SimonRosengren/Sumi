import { z } from "zod";

/** Stable handle of a lane. Chosen when the lane is created and never changed by renaming it. */
export const LaneIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_]{0,39}$/, "lowercase letters, digits and underscores");

export const LANE_NAME_MAX_LENGTH = 40;
export const MAX_LANES = 20;

/** A board column. Its position in `Project.lanes` is its place on the board (ADR 0028). */
export const LaneSchema = z.object({ id: LaneIdSchema, name: z.string() });
export type Lane = z.infer<typeof LaneSchema>;

/** The lanes of a new project. Claiming and the GitHub webhook refer to `todo`, `in_progress`, `in_review` and `done`. */
export const DEFAULT_LANES: readonly Lane[] = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "Todo" },
  { id: "in_progress", name: "In progress" },
  { id: "in_review", name: "In review" },
  { id: "done", name: "Done" },
];

/** A ticket's status is the id of one of its project's lanes. */
export const StatusSchema = LaneIdSchema;
export type Status = z.infer<typeof StatusSchema>;

export const PrioritySchema = z.enum(["low", "medium", "high"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const UserKindSchema = z.enum(["human", "agent"]);
export type UserKind = z.infer<typeof UserKindSchema>;

export const ProjectKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2-10 chars, uppercase letters/digits, starting with a letter");

/** e.g. SUMI-12 */
export const TicketKeySchema = z.string().regex(/^[A-Z][A-Z0-9]{1,9}-[1-9]\d*$/);

export const TicketLinksSchema = z.object({
  /** "owner/name" */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  branch: z.string().min(1).optional(),
  /** Pull request number within `repo`. */
  pr: z.number().int().positive().optional(),
});
export type TicketLinks = z.infer<typeof TicketLinksSchema>;

// Dates use z.coerce.date() so the same schemas parse both core objects and JSON responses.
export const UserSchema = z.object({
  id: z.string(),
  kind: UserKindSchema,
  name: z.string(),
  /** Set for humans that signed in with GitHub. */
  githubId: z.number().int().optional(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  key: ProjectKeySchema,
  name: z.string(),
  /** Board columns, left to right. Never empty. */
  lanes: z.array(LaneSchema),
  createdAt: z.coerce.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const TicketSchema = z.object({
  key: TicketKeySchema,
  projectKey: ProjectKeySchema,
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  status: StatusSchema,
  assigneeId: z.string().optional(),
  priority: PrioritySchema.optional(),
  links: TicketLinksSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** Public handle of a token: the first 16 hex characters of its hash. It cannot be used to authenticate. */
export const TokenIdSchema = z.string().regex(/^[0-9a-f]{16}$/, "16 hex characters");

export const TokenInfoSchema = z.object({
  id: TokenIdSchema,
  userId: z.string(),
  createdAt: z.coerce.date(),
});
export type TokenInfo = z.infer<typeof TokenInfoSchema>;

export const COMMENT_MAX_LENGTH = 10_000;

/** A comment on a ticket. Stored as a `ticket.commented` activity entry (ADR 0027); `authorId` is its actor. */
export const CommentSchema = z.object({
  id: z.string(),
  ticketKey: TicketKeySchema,
  authorId: z.string(),
  /** Markdown. */
  body: z.string(),
  createdAt: z.coerce.date(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const ACTIVITY_ACTIONS = [
  "project.created",
  "project.lanes_updated",
  "ticket.created",
  "ticket.updated",
  "ticket.moved",
  "ticket.claimed",
  "ticket.commented",
  "agent.created",
  "token.created",
  "token.revoked",
] as const;
export const ActivityActionSchema = z.enum(ACTIVITY_ACTIONS);
export type ActivityAction = z.infer<typeof ActivityActionSchema>;

export const ActivityEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: ActivityActionSchema,
  /** Absent for actions that are not project-scoped (agent and token creation). */
  projectKey: ProjectKeySchema.optional(),
  ticketKey: TicketKeySchema.optional(),
  /** Action-specific details, e.g. { from, to } for moves. */
  data: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
