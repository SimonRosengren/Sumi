import {
  ActivityEntrySchema,
  AgentCreatedSchema,
  AuthConfigSchema,
  ErrorResponseSchema,
  ProjectSchema,
  TicketSchema,
  TokenCreatedSchema,
  TokenInfoSchema,
  UserSchema,
  type ActivityEntry,
  type AgentCreated,
  type AuthConfig,
  type CreateProjectInput,
  type CreateTicketInput,
  type ListActivityInput,
  type ListTicketsInput,
  type MoveTicketInput,
  type Project,
  type Ticket,
  type TokenInfo,
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

export interface WatchOptions {
  /** Called for every change in any project. */
  onEntry: (entry: ActivityEntry) => void;
  /**
   * Called each time the stream is live, including after a reconnect. Events are
   * not replayed, so reload your data here to cover anything missed while offline.
   */
  onReady?: () => void;
  /** Stops watching. `watch` resolves once aborted. */
  signal: AbortSignal;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;

/** Reads `event:`/`data:` frames from an SSE body until it ends. */
async function* readSse(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        yield { event, data: data.join("\n") };
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}

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

  /**
   * Streams live changes (`GET /events`) and reconnects with backoff when the
   * connection drops. Uses `fetch` rather than EventSource so the token goes in
   * the Authorization header, not the URL. Gives up only when aborted or when the
   * token is rejected (401).
   */
  async function watch({ onEntry, onReady, signal }: WatchOptions): Promise<void> {
    let delay = RETRY_MIN_MS;
    while (!signal.aborted) {
      try {
        const res = await fetchImpl(`${base}/events`, {
          headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
          signal,
        });
        if (res.status === 401) return;
        if (res.ok && res.body) {
          for await (const frame of readSse(res.body, signal)) {
            if (frame.event === "ready") {
              delay = RETRY_MIN_MS;
              onReady?.();
            } else if (frame.event === "activity") {
              const entry = ActivityEntrySchema.safeParse(JSON.parse(frame.data));
              if (entry.success) onEntry(entry.data);
            }
          }
        }
      } catch {
        // Network error or aborted: fall through to the retry wait (which exits if aborted).
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
  }

  const Tickets = z.array(TicketSchema);
  const Projects = z.array(ProjectSchema);
  const Activity = z.array(ActivityEntrySchema);
  const Claimed = z.object({ ticket: TicketSchema.nullable() });

  return {
    me: (): Promise<User> => request("GET", "/me", UserSchema),
    listUsers: (): Promise<User[]> => request("GET", "/users", z.array(UserSchema)),
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
    listTokens: (userId?: string): Promise<TokenInfo[]> =>
      request("GET", "/tokens", z.array(TokenInfoSchema), { query: { userId } }),
    /** Creates a token for `userId` (default: yourself). Returns the plaintext, shown only once. */
    createToken: async (userId?: string): Promise<string> =>
      (await request("POST", "/tokens", TokenCreatedSchema, { body: userId ? { userId } : {} })).token,
    revokeToken: (id: string): Promise<void> => request("DELETE", `/tokens/${id}`, z.undefined()),
    watch,
  };
}

/** Asks an API which sign-in methods it offers. Needs no token, so it is not part of the client. */
export async function getAuthConfig(url: string, fetchImpl: typeof fetch = fetch): Promise<AuthConfig> {
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/auth/config`);
    const parsed = AuthConfigSchema.safeParse(await res.json());
    if (parsed.success) return parsed.data;
  } catch {
    // Unreachable or not JSON: treat as "no GitHub sign-in", the token form still works.
  }
  return { github: false };
}

export type Client = ReturnType<typeof createClient>;
