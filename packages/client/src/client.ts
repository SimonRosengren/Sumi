import {
  ActivityEntrySchema,
  AgentCreatedSchema,
  AuthConfigSchema,
  CommentSchema,
  ErrorResponseSchema,
  ProjectSchema,
  TicketSchema,
  TokenCreatedSchema,
  TokenInfoSchema,
  UserSchema,
  type ActivityEntry,
  type AgentCreated,
  type AuthConfig,
  type Comment,
  type CreateCommentInput,
  type CreateProjectInput,
  type CreateTicketInput,
  type ListActivityInput,
  type ListTicketsInput,
  type MoveTicketInput,
  type Lane,
  type Project,
  type SetLanesInput,
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

/** `lanes` with lane `id` at the 1-based `position` (clamped to the ends). The same list when it is already there. */
export function placeLane<L extends { id: string }>(lanes: L[], id: string, position: number): L[] {
  const from = lanes.findIndex((l) => l.id === id);
  const lane = lanes[from];
  if (!lane) return lanes;
  const to = Math.min(Math.max(position, 1), lanes.length) - 1;
  if (to === from) return lanes;
  const rest = lanes.filter((l) => l.id !== id);
  rest.splice(to, 0, lane);
  return rest;
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

  const listProjects = (): Promise<Project[]> => request("GET", "/projects", Projects);
  const setLanes = (projectKey: string, input: SetLanesInput): Promise<Project> =>
    request("PUT", `/projects/${projectKey}/lanes`, ProjectSchema, { body: input });

  /** Reads the project's lanes, applies `edit` and saves the result. Like the web board, the last save wins. */
  async function editLanes(
    projectKey: string,
    edit: (lanes: Lane[]) => SetLanesInput["lanes"],
  ): Promise<Project> {
    const project = (await listProjects()).find((p) => p.key === projectKey);
    if (!project) throw new ApiError("not_found", `Project ${projectKey} not found`);
    return setLanes(projectKey, { lanes: edit(project.lanes) });
  }

  const laneNotFound = (projectKey: string, lanes: Lane[], id: string) =>
    new ApiError("not_found", `Project ${projectKey} has no lane ${id} (lanes: ${lanes.map((l) => l.id).join(", ")})`);

  return {
    me: (): Promise<User> => request("GET", "/me", UserSchema),
    listUsers: (): Promise<User[]> => request("GET", "/users", z.array(UserSchema)),
    createAgent: (name: string): Promise<AgentCreated> =>
      request("POST", "/agents", AgentCreatedSchema, { body: { name } }),
    listProjects,
    createProject: (input: CreateProjectInput): Promise<Project> =>
      request("POST", "/projects", ProjectSchema, { body: input }),
    /** Replaces the project's lanes (ids keep existing lanes, no id adds one, left out ones are deleted). */
    setLanes,
    /** Adds a lane at the 1-based `position` (default: last). Resolves to the project with its new lanes. */
    addLane: (projectKey: string, name: string, position?: number): Promise<Project> =>
      editLanes(projectKey, (lanes) => {
        const next: SetLanesInput["lanes"] = lanes.map(({ id, name }) => ({ id, name }));
        next.splice(position === undefined ? next.length : Math.max(position - 1, 0), 0, { name });
        return next;
      }),
    renameLane: (projectKey: string, laneId: string, name: string): Promise<Project> =>
      editLanes(projectKey, (lanes) => {
        if (!lanes.some((l) => l.id === laneId)) throw laneNotFound(projectKey, lanes, laneId);
        return lanes.map((l) => (l.id === laneId ? { id: l.id, name } : { id: l.id, name: l.name }));
      }),
    /** Moves a lane to the 1-based `position`. */
    moveLane: (projectKey: string, laneId: string, position: number): Promise<Project> =>
      editLanes(projectKey, (lanes) => {
        if (!lanes.some((l) => l.id === laneId)) throw laneNotFound(projectKey, lanes, laneId);
        return placeLane(lanes, laneId, position).map(({ id, name }) => ({ id, name }));
      }),
    /** Removes a lane. The API refuses while it still holds tickets. */
    removeLane: (projectKey: string, laneId: string): Promise<Project> =>
      editLanes(projectKey, (lanes) => {
        if (!lanes.some((l) => l.id === laneId)) throw laneNotFound(projectKey, lanes, laneId);
        return lanes.filter((l) => l.id !== laneId).map(({ id, name }) => ({ id, name }));
      }),
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
    listComments: (key: string): Promise<Comment[]> => request("GET", `/tickets/${key}/comments`, z.array(CommentSchema)),
    addComment: (key: string, input: CreateCommentInput): Promise<Comment> =>
      request("POST", `/tickets/${key}/comments`, CommentSchema, { body: input }),
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
