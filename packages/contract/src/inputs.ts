import { z } from "zod";
import {
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

export const CreateTicketInputSchema = z.object({
  projectKey: ProjectKeySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  status: StatusSchema.default("backlog"),
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
export type ListActivityInput = z.input<typeof ListActivityInputSchema>;

export const CreateAgentInputSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

export const ClaimNextInputSchema = z.object({ projectKey: ProjectKeySchema });
export type ClaimNextInput = z.infer<typeof ClaimNextInputSchema>;
