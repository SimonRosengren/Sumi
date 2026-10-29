import type { ZodType } from "zod";

export type ErrorCode = "not_found" | "conflict" | "validation";

/** Base class so the API can map any core failure to an HTTP status. */
export class SumiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends SumiError {
  constructor(message: string) {
    super("not_found", message);
  }
}

export class ConflictError extends SumiError {
  constructor(message: string) {
    super("conflict", message);
  }
}

export class ValidationError extends SumiError {
  constructor(message: string) {
    super("validation", message);
  }
}

/** Parse with a contract schema, converting failures to ValidationError. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
    );
  }
  return result.data;
}
