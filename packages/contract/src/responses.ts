import { z } from "zod";
import { UserSchema } from "./domain";

export const ErrorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Body of every non-2xx API response. */
export const ErrorResponseSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** The plaintext token is shown exactly once, when it is created. */
export const AgentCreatedSchema = z.object({ user: UserSchema, token: z.string() });
export type AgentCreated = z.infer<typeof AgentCreatedSchema>;

/** The plaintext token is shown exactly once, when it is created. */
export const TokenCreatedSchema = z.object({ token: z.string() });
export type TokenCreated = z.infer<typeof TokenCreatedSchema>;

/** What the sign-in screen needs to know before anyone is signed in. */
export const AuthConfigSchema = z.object({ github: z.boolean() });
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
