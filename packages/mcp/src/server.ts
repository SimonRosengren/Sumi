import {
  PrioritySchema,
  ProjectKeySchema,
  StatusSchema,
  TicketKeySchema,
  TicketLinksSchema,
  type Ticket,
} from "@sumi/contract";
import { ApiError, type Client } from "@sumi/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Ticket fields an agent needs, without timestamps or empty values. `full` adds the description. */
function brief(t: Ticket, full: boolean) {
  return {
    key: t.key,
    title: t.title,
    status: t.status,
    ...(t.priority && { priority: t.priority }),
    ...(t.assigneeId && { assigneeId: t.assigneeId }),
    ...(Object.keys(t.links).length > 0 && { links: t.links }),
    ...(full && t.description && { description: t.description }),
  };
}

const json = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });

const failure = (err: unknown): CallToolResult => {
  const message = err instanceof ApiError || err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
};

/** Wraps a handler so API failures become tool errors the agent can read and act on. */
function tool<A>(handler: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return json(await handler(args));
    } catch (err) {
      return failure(err);
    }
  };
}

/** The SDK reports absent optional arguments as undefined; the client wants them omitted. */
function defined<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as never;
}

type Args<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>>;

const projectKey = ProjectKeySchema.describe("Project key, e.g. SUMI");
const ticketKey = TicketKeySchema.describe("Ticket key, e.g. SUMI-12");

const listShape = {
  projectKey,
  status: StatusSchema.optional().describe("Only tickets in this status"),
  assigneeId: z.string().optional().describe("Only tickets assigned to this user id"),
};

const createShape = {
  projectKey,
  title: z.string().describe("Short summary"),
  description: z.string().optional().describe("Markdown"),
  status: StatusSchema.optional(),
  priority: PrioritySchema.optional(),
  assigneeId: z.string().optional(),
  links: TicketLinksSchema.optional().describe("repo (owner/name), branch, pr (number)"),
};

const updateShape = {
  key: ticketKey,
  title: z.string().optional(),
  description: z.string().optional().describe("Replaces the whole description"),
  assigneeId: z.string().nullable().optional(),
  priority: PrioritySchema.nullable().optional(),
  links: TicketLinksSchema.optional(),
};

export function createServer(client: Client): McpServer {
  const server = new McpServer(
    { name: "sumi", version: "0.0.0" },
    {
      instructions:
        "Sumi is a ticket system. Statuses: backlog, todo, in_progress, in_review, done. " +
        "To start work call claim_next_ticket; when finished move the ticket to in_review and put the PR in links.",
    },
  );

  server.registerTool(
    "whoami",
    { description: "Show which Sumi user you are acting as (id, name, kind). Use the id for assigneeId." },
    tool(() => client.me()),
  );

  server.registerTool(
    "list_projects",
    { description: "List projects (key and name)." },
    tool(() => client.listProjects().then((ps) => ps.map((p) => ({ key: p.key, name: p.name })))),
  );

  server.registerTool(
    "list_tickets",
    {
      description: "List tickets in a project, oldest first, without descriptions. Use get_ticket for details.",
      inputSchema: listShape,
    },
    tool(async ({ projectKey, ...filters }: Args<typeof listShape>) =>
      (await client.listTickets({ projectKey, ...defined(filters) })).map((t) => brief(t, false)),
    ),
  );

  server.registerTool(
    "get_ticket",
    { description: "Get one ticket including its description.", inputSchema: { key: ticketKey } },
    tool(async ({ key }: { key: string }) => brief(await client.getTicket(key), true)),
  );

  server.registerTool(
    "create_ticket",
    {
      description: "Create a ticket. Status defaults to backlog. Put acceptance criteria in the description (markdown).",
      inputSchema: createShape,
    },
    tool(async ({ projectKey, title, ...rest }: Args<typeof createShape>) =>
      brief(await client.createTicket({ projectKey, title, ...defined(rest) }), true),
    ),
  );

  server.registerTool(
    "update_ticket",
    {
      description:
        "Change fields of a ticket; omitted fields stay as they are. Use null for assigneeId or priority to clear them. " +
        "links are merged into the existing links (give only what changes).",
      inputSchema: updateShape,
    },
    tool(async ({ key, links, ...rest }: Args<typeof updateShape>) => {
      // The API replaces the whole links object; merge so a partial update keeps the rest.
      const merged = links ? { ...(await client.getTicket(key)).links, ...defined(links) } : undefined;
      return brief(await client.updateTicket(key, { ...defined(rest), ...(merged && { links: merged }) }), true);
    }),
  );

  server.registerTool(
    "move_ticket",
    {
      description: "Move a ticket to another status. Any status can move to any other.",
      inputSchema: { key: ticketKey, status: StatusSchema },
    },
    tool(async ({ key, status }: { key: string; status: z.infer<typeof StatusSchema> }) =>
      brief(await client.moveTicket(key, { status }), false),
    ),
  );

  server.registerTool(
    "claim_next_ticket",
    {
      description:
        "Atomically take the oldest unassigned todo ticket in a project (or a todo ticket already assigned to you), " +
        "assign it to you and move it to in_progress. Returns {ticket: null} when none is available. Safe to call concurrently.",
      inputSchema: { projectKey },
    },
    tool(async ({ projectKey }: { projectKey: string }) => {
      const ticket = await client.claimNext(projectKey);
      return { ticket: ticket && brief(ticket, true) };
    }),
  );

  return server;
}
