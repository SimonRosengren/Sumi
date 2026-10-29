import {
  LaneIdSchema,
  PrioritySchema,
  ProjectKeySchema,
  StatusSchema,
  TicketKeySchema,
  TicketLinksSchema,
  type Project,
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

const laneId = LaneIdSchema.describe("Lane id, see list_projects");
const laneName = z.string().describe("What the board shows, up to 40 characters");

const addLaneShape = {
  projectKey,
  name: laneName,
  position: z.number().int().positive().optional().describe("1 is the leftmost lane; default: last"),
};

const activityShape = {
  projectKey: projectKey.optional(),
  ticketKey: ticketKey.optional(),
  limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
};

const listShape = {
  projectKey,
  status: StatusSchema.optional().describe("Only tickets in this lane (lane id)"),
  assigneeId: z.string().optional().describe("Only tickets assigned to this user id"),
};

const createShape = {
  projectKey,
  title: z.string().describe("Short summary"),
  description: z.string().optional().describe("Markdown"),
  status: StatusSchema.optional().describe("Lane id, default the first lane of the project"),
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
        "Sumi is a ticket system. A ticket's status is the id of a lane on its project's board (list_projects shows them; new projects start with backlog, todo, in_progress, in_review, done). " +
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
    { description: "List projects (key, name and lanes: the ids a ticket status can be)." },
    tool(() => client.listProjects().then((ps) => ps.map((p) => ({ key: p.key, name: p.name, lanes: p.lanes })))),
  );

  server.registerTool(
    "list_users",
    { description: "List all users (humans and agents): id, name and kind. Use an id as assigneeId." },
    tool(() => client.listUsers().then((us) => us.map((u) => ({ id: u.id, name: u.name, kind: u.kind })))),
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
    { description: "Get one ticket including its description and comments (oldest first).", inputSchema: { key: ticketKey } },
    tool(async ({ key }: { key: string }) => {
      const [ticket, comments] = await Promise.all([client.getTicket(key), client.listComments(key)]);
      return {
        ...brief(ticket, true),
        ...(comments.length > 0 && {
          comments: comments.map((c) => ({ authorId: c.authorId, body: c.body, createdAt: c.createdAt })),
        }),
      };
    }),
  );

  server.registerTool(
    "create_ticket",
    {
      description: "Create a ticket. Status defaults to the first lane (usually backlog). Put acceptance criteria in the description (markdown).",
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
      description: "Move a ticket to another status (a lane id of its project). Any status can move to any other.",
      inputSchema: { key: ticketKey, status: StatusSchema },
    },
    tool(async ({ key, status }: { key: string; status: z.infer<typeof StatusSchema> }) =>
      brief(await client.moveTicket(key, { status }), false),
    ),
  );

  server.registerTool(
    "add_comment",
    {
      description: "Comment on a ticket (markdown), e.g. to report progress or ask a question. Comments cannot be edited or deleted.",
      inputSchema: { key: ticketKey, body: z.string().describe("Markdown") },
    },
    tool(async ({ key, body }: { key: string; body: string }) => {
      const c = await client.addComment(key, { body });
      return { id: c.id, ticketKey: c.ticketKey, createdAt: c.createdAt };
    }),
  );

  server.registerTool(
    "list_activity",
    {
      description:
        "The activity log, newest first: who did what, when. Filter by project or ticket. " +
        "Moves have data {from, to} (lane ids).",
      inputSchema: activityShape,
    },
    tool(async (args: Args<typeof activityShape>) =>
      (await client.listActivity(defined(args))).map((e) => ({
        at: e.createdAt,
        actorId: e.actorId,
        action: e.action,
        ...(e.ticketKey && { ticketKey: e.ticketKey }),
        ...(!e.ticketKey && e.projectKey && { projectKey: e.projectKey }),
        ...(Object.keys(e.data).length > 0 && { data: e.data }),
      })),
    ),
  );

  const lanes = (p: Project) => ({ lanes: p.lanes });

  server.registerTool(
    "add_lane",
    {
      description:
        "Add a lane (board column) to a project. Its id is made from the name. It goes last unless position is given. " +
        "Returns the project's lanes.",
      inputSchema: addLaneShape,
    },
    tool(async ({ projectKey, name, position }: Args<typeof addLaneShape>) =>
      lanes(await client.addLane(projectKey, name, position)),
    ),
  );

  server.registerTool(
    "rename_lane",
    {
      description: "Rename a lane. Its id, and so its tickets, stay as they are. Returns the project's lanes.",
      inputSchema: { projectKey, laneId, name: laneName },
    },
    tool(async ({ projectKey, laneId, name }: { projectKey: string; laneId: string; name: string }) =>
      lanes(await client.renameLane(projectKey, laneId, name)),
    ),
  );

  server.registerTool(
    "move_lane",
    {
      description: "Move a lane to a place on the board (1 is the leftmost). Returns the project's lanes.",
      inputSchema: { projectKey, laneId, position: z.number().int().positive().describe("1 is the leftmost lane") },
    },
    tool(async ({ projectKey, laneId, position }: { projectKey: string; laneId: string; position: number }) =>
      lanes(await client.moveLane(projectKey, laneId, position)),
    ),
  );

  server.registerTool(
    "remove_lane",
    {
      description: "Remove a lane. Refused while it still has tickets: move them first. Returns the project's lanes.",
      inputSchema: { projectKey, laneId },
    },
    tool(async ({ projectKey, laneId }: { projectKey: string; laneId: string }) =>
      lanes(await client.removeLane(projectKey, laneId)),
    ),
  );

  server.registerTool(
    "claim_next_ticket",
    {
      description:
        "Atomically take the oldest unassigned todo ticket in a project (or a todo ticket already assigned to you), " +
        "assign it to you and move it to in_progress. Needs the project to still have its todo and in_progress lanes. Returns {ticket: null} when none is available. Safe to call concurrently.",
      inputSchema: { projectKey },
    },
    tool(async ({ projectKey }: { projectKey: string }) => {
      const ticket = await client.claimNext(projectKey);
      return { ticket: ticket && brief(ticket, true) };
    }),
  );

  return server;
}
