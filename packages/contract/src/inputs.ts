import { z } from "zod";
import {
  COMMENT_MAX_LENGTH,
  LANE_NAME_MAX_LENGTH,
  LaneIdSchema,
  MAX_LANES,
  PrioritySchema,
  ProjectKeySchema,
  StatusSchema,
  TicketKeySchema,
  TicketLinksSchema,
  UserKindSchema,
} from "./domain";

export const CreateUserInputSchema = z.object({
  kind: UserKindSchema,
  name: z.string().trim().min(1).max(100),
  githubId: z.number().int().optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const CreateProjectInputSchema = z.object({
  key: ProjectKeySchema,
  name: z.string().trim().min(1).max(100),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/**
 * The complete new list of lanes, in order. A lane with an `id` is an existing one (renamed and/or moved);
 * one without is new. Existing lanes left out are deleted, which is refused while they hold tickets.
 */
export const SetLanesInputSchema = z.object({
  lanes: z
    .array(z.object({ id: LaneIdSchema.optional(), name: z.string().trim().min(1).max(LANE_NAME_MAX_LENGTH) }))
    .min(1)
    .max(MAX_LANES),
});
export type SetLanesInput = z.infer<typeof SetLanesInputSchema>;

export const CreateTicketInputSchema = z.object({
  projectKey: ProjectKeySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  /** Defaults to the project's first lane. */
  status: StatusSchema.optional(),
  assigneeId: z.string().optional(),
  priority: PrioritySchema.optional(),
  links: TicketLinksSchema.default({}),
});
export type CreateTicketInput = z.input<typeof CreateTicketInputSchema>;

/** Only provided fields change. `null` clears an optional field. */
export const UpdateTicketInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20_000).optional(),
  assigneeId: z.string().nullable().optional(),
  priority: PrioritySchema.nullable().optional(),
  links: TicketLinksSchema.optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketInputSchema>;

export const MoveTicketInputSchema = z.object({ status: StatusSchema });
export type MoveTicketInput = z.infer<typeof MoveTicketInputSchema>;

export const CreateCommentInputSchema = z.object({ body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH) });
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;

export const ListTicketsInputSchema = z.object({
  projectKey: ProjectKeySchema,
  status: StatusSchema.optional(),
  assigneeId: z.string().optional(),
});
export type ListTicketsInput = z.infer<typeof ListTicketsInputSchema>;

export const ListActivityInputSchema = z.object({
  projectKey: ProjectKeySchema.optional(),
  ticketKey: TicketKeySchema.optional(),
  // Coerced because it arrives as a query string over HTTP.
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
// z.input would type the coerced `limit` as unknown, so state it explicitly.
export type ListActivityInput = Omit<z.input<typeof ListActivityInputSchema>, "limit"> & { limit?: number };

export const CreateAgentInputSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

export const ClaimNextInputSchema = z.object({ projectKey: ProjectKeySchema });
export type ClaimNextInput = z.infer<typeof ClaimNextInputSchema>;

/** Without `userId`, the caller's own tokens. */
export const ListTokensInputSchema = z.object({ userId: z.string().optional() });
export type ListTokensInput = z.infer<typeof ListTokensInputSchema>;

/** Without `userId`, a token for the caller. */
export const CreateTokenInputSchema = z.object({ userId: z.string().optional() });
export type CreateTokenInput = z.infer<typeof CreateTokenInputSchema>;
