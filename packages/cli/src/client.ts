import {
  ActivityEntrySchema,
  AgentCreatedSchema,
  ErrorResponseSchema,
  ProjectSchema,
  TicketSchema,
  UserSchema,
  type ActivityEntry,
  type AgentCreated,
  type CreateProjectInput,
  type CreateTicketInput,
  type ListActivityInput,
  type ListTicketsInput,
  type MoveTicketInput,
  type Project,
  type Ticket,
  type UpdateTicketInput,
  type User,
} from "@sumi/contract";
import { z } from "zod";

/** Any failure the user should see as a one-line message. `code` comes from the API, or is `client_error`. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | undefined>;

export function createClient({ url, token, fetch: fetchImpl = fetch }: ClientOptions) {
  const base = url.replace(/\/+$/, "");

  async function request<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<z.output<S>> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) search.set(k, String(v));
    const qs = search.size > 0 ? `?${search}` : "";

    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}${qs}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      const reason = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
      throw new ApiError("client_error", `Cannot reach the API at ${base} (${reason})`);
    }

    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const parsed = ErrorResponseSchema.safeParse(json);
      if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message);
      throw new ApiError("client_error", `Unexpected response from the API: HTTP ${res.status}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError("client_error", "Unexpected response shape from the API");
    return parsed.data;
  }

  const Tickets = z.array(TicketSchema);
  const Projects = z.array(ProjectSchema);
  const Activity = z.array(ActivityEntrySchema);
  const Claimed = z.object({ ticket: TicketSchema.nullable() });

  return {
    me: (): Promise<User> => request("GET", "/me", UserSchema),
    createAgent: (name: string): Promise<AgentCreated> =>
      request("POST", "/agents", AgentCreatedSchema, { body: { name } }),
    listProjects: (): Promise<Project[]> => request("GET", "/projects", Projects),
    createProject: (input: CreateProjectInput): Promise<Project> =>
      request("POST", "/projects", ProjectSchema, { body: input }),
    listTickets: (input: ListTicketsInput): Promise<Ticket[]> =>
      request("GET", "/tickets", Tickets, { query: input }),
    getTicket: (key: string): Promise<Ticket> => request("GET", `/tickets/${key}`, TicketSchema),
    createTicket: (input: CreateTicketInput): Promise<Ticket> =>
      request("POST", "/tickets", TicketSchema, { body: input }),
    updateTicket: (key: string, input: UpdateTicketInput): Promise<Ticket> =>
      request("PATCH", `/tickets/${key}`, TicketSchema, { body: input }),
    moveTicket: (key: string, input: MoveTicketInput): Promise<Ticket> =>
      request("POST", `/tickets/${key}/move`, TicketSchema, { body: input }),
    claimNext: async (projectKey: string): Promise<Ticket | null> =>
      (await request("POST", "/tickets/claim-next", Claimed, { body: { projectKey } })).ticket,
    listActivity: (input: ListActivityInput): Promise<ActivityEntry[]> =>
      request("GET", "/activity", Activity, { query: input }),
  };
}

export type Client = ReturnType<typeof createClient>;
