import { z } from "zod";

export const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
export const StatusSchema = z.enum(STATUSES);
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

export const UserSchema = z.object({
  id: z.string(),
  kind: UserKindSchema,
  name: z.string(),
  /** Set for humans that signed in with GitHub. */
  githubId: z.number().int().optional(),
  createdAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  key: ProjectKeySchema,
  name: z.string(),
  createdAt: z.date(),
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
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const ACTIVITY_ACTIONS = [
  "project.created",
  "ticket.created",
  "ticket.updated",
  "ticket.moved",
  "ticket.claimed",
] as const;
export const ActivityActionSchema = z.enum(ACTIVITY_ACTIONS);
export type ActivityAction = z.infer<typeof ActivityActionSchema>;

export const ActivityEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: ActivityActionSchema,
  projectKey: ProjectKeySchema,
  ticketKey: TicketKeySchema.optional(),
  /** Action-specific details, e.g. { from, to } for moves. */
  data: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
