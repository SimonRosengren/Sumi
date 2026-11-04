import {
  PrioritySchema,
  type CreateTicketInput,
  type Lane,
  type TicketLinks,
  type UpdateTicketInput,
} from "@sumi/contract";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { ApiError, createClient, type Client } from "@sumi/client";
import {
  formatActivityLine,
  formatBoardLine,
  formatComment,
  formatLaneLine,
  formatProjectLine,
  formatTicket,
  formatTicketLine,
  formatTokenLine,
  formatUser,
} from "./format";

export interface RunOptions {
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetch?: typeof fetch;
}

const DEFAULT_URL = "http://localhost:3000";

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("must be a positive integer");
  return n;
}

/**
 * `none` clears an optional field; omitted leaves it unchanged. Done in the
 * action, not as an option parser: commander turns a parsed `null` into "".
 */
const orNone = (value: string | undefined): string | null | undefined => (value === "none" ? null : value);

/** Drops undefined values so optional fields are omitted, not sent as undefined. */
function defined<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as never;
}

const priorityOption = () => new Option("--priority <priority>").choices(PrioritySchema.options);

/**
 * Runs the CLI and returns the process exit code. Takes its environment and
 * output streams as arguments so tests can run it in-process.
 */
export async function run(argv: string[], opts: RunOptions): Promise<number> {
  const program = new Command()
    .name("sumi")
    .description("Sumi ticket management. Configure with SUMI_TOKEN and optionally SUMI_URL.")
    .option("--json", "print machine-readable JSON (errors go to stderr as JSON)")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeOut: opts.stdout, writeErr: opts.stderr });

  const json = () => program.opts<{ json?: boolean }>().json === true;
  const print = (data: unknown, text: () => string) =>
    opts.stdout(json() ? `${JSON.stringify(data, null, 2)}\n` : `${text()}\n`);

  let client: Client | undefined;
  const api = (): Client => {
    if (client) return client;
    const token = opts.env.SUMI_TOKEN;
    if (!token) {
      throw new ApiError(
        "client_error",
        "SUMI_TOKEN is not set. Create one with `pnpm bootstrap <name>` (first user) or `sumi agent create <name>`.",
      );
    }
    client = createClient({
      url: opts.env.SUMI_URL || DEFAULT_URL,
      token,
      ...(opts.fetch && { fetch: opts.fetch }),
    });
    return client;
  };

  program
    .command("whoami")
    .description("Show the user the token belongs to")
    .action(async () => {
      const user = await api().me();
      print(user, () => formatUser(user));
    });

  const user = program.command("user").description("Show users");
  user
    .command("list")
    .description("List all users (humans and agents) with their ids, for --assignee")
    .action(async () => {
      const users = await api().listUsers();
      print(users, () => users.map(formatUser).join("\n"));
    });

  const agent = program.command("agent").description("Manage agents (humans only)");
  agent
    .command("create")
    .description("Create an agent user and its token. The token is shown once.")
    .argument("<name>")
    .action(async (name: string) => {
      const created = await api().createAgent(name);
      print(created, () => `Created agent ${created.user.name} (${created.user.id})\nToken (shown once): ${created.token}`);
    });

  const token = program.command("token").description("Manage API tokens (humans only)");
  token
    .command("list")
    .description("List tokens of yourself or --user (ids only; the secrets are never shown)")
    .option("--user <userId>", "an agent's user id")
    .action(async (o: { user?: string }) => {
      const tokens = await api().listTokens(o.user);
      print(tokens, () => (tokens.length > 0 ? tokens.map(formatTokenLine).join("\n") : "No tokens"));
    });
  token
    .command("create")
    .description("Create another token for yourself or --user. The token is shown once.")
    .option("--user <userId>", "an agent's user id")
    .action(async (o: { user?: string }) => {
      const created = await api().createToken(o.user);
      print({ token: created }, () => `Token (shown once): ${created}`);
    });
  token
    .command("revoke")
    .description("Revoke a token by its id (see `token list`). It stops working at once.")
    .argument("<id>")
    .action(async (id: string) => {
      await api().revokeToken(id);
      print({ revoked: id }, () => `Revoked ${id}`);
    });

  const project = program.command("project").description("Manage projects");
  project
    .command("list")
    .description("List projects")
    .action(async () => {
      const projects = await api().listProjects();
      print(projects, () => (projects.length > 0 ? projects.map(formatProjectLine).join("\n") : "No projects"));
    });
  project
    .command("create")
    .description("Create a project. The key is 2-10 uppercase letters/digits, e.g. SUMI.")
    .argument("<key>")
    .argument("<name>")
    .action(async (key: string, name: string) => {
      const created = await api().createProject({ key, name });
      print(created, () => `Created ${formatProjectLine(created)}`);
    });

  project
    .command("delete")
    .description("Delete a project with all its tickets and activity (humans only). This cannot be undone.")
    .argument("<key>")
    .action(async (key: string) => {
      await api().deleteProject(key);
      print({ deleted: key }, () => `Deleted ${key}`);
    });

  const board = program.command("board").description("Manage boards within a project");
  const lane = board
    .command("lane")
    .description("Manage a board's lanes (columns). A ticket's status is the id of its lane.");
  const printLanes = (lanes: Lane[]) => print(lanes, () => lanes.map(formatLaneLine).join("\n"));
  lane
    .command("list")
    .description("List a board's lanes, left to right")
    .argument("<board>", "board id, see `sumi board list <project>`")
    .action(async (id: string) => {
      printLanes((await api().getBoard(id)).lanes);
    });
  lane
    .command("add")
    .description("Add a lane. Its id is made from the name. It goes last unless --position is given.")
    .argument("<board>")
    .argument("<name>")
    .option("--position <n>", "1 is the leftmost lane", positiveInt)
    .action(async (boardId: string, name: string, o: { position?: number }) =>
      printLanes((await api().addLane(boardId, name, o.position)).lanes),
    );
  lane
    .command("rename")
    .description("Rename a lane. Its id, and so its tickets, stay as they are.")
    .argument("<board>")
    .argument("<lane>", "lane id, see `sumi board lane list <board>`")
    .argument("<name>")
    .action(async (boardId: string, laneId: string, name: string) =>
      printLanes((await api().renameLane(boardId, laneId, name)).lanes),
    );
  lane
    .command("move")
    .description("Move a lane to another place on the board")
    .argument("<board>")
    .argument("<lane>", "lane id")
    .argument("<position>", "1 is the leftmost lane", positiveInt)
    .action(async (boardId: string, laneId: string, position: number) =>
      printLanes((await api().moveLane(boardId, laneId, position)).lanes),
    );
  lane
    .command("remove")
    .description("Remove a lane. Refused while it still has tickets: move them first.")
    .argument("<board>")
    .argument("<lane>", "lane id")
    .action(async (boardId: string, laneId: string) => printLanes((await api().removeLane(boardId, laneId)).lanes));

  board.command("get").description("Get a board and its lanes").argument("<id>")
    .action(async (id: string) => {
      const found = await api().getBoard(id);
      print(found, () => `${formatBoardLine(found)}\n${found.lanes.map(formatLaneLine).join("\n")}`);
    });
  board.command("list").description("List a project's boards and their ids").argument("<project>")
    .action(async (projectKey: string) => {
      const boards = await api().listBoards(projectKey);
      print(boards, () => boards.map(formatBoardLine).join("\n"));
    });
  board.command("create").description("Create a board in a project").argument("<project>").argument("<name>")
    .action(async (projectKey: string, name: string) => {
      const created = await api().createBoard({ projectKey, name });
      print(created, () => `Created ${formatBoardLine(created)}`);
    });
  board.command("rename").description("Rename a board; its id stays the same").argument("<id>").argument("<name>")
    .action(async (id: string, name: string) => {
      const renamed = await api().renameBoard(id, { name });
      print(renamed, () => `Renamed ${formatBoardLine(renamed)}`);
    });
  board.command("delete").description("Delete an empty board; the last board cannot be deleted").argument("<id>")
    .action(async (id: string) => {
      await api().deleteBoard(id);
      print({ deleted: id }, () => `Deleted ${id}`);
    });

  const ticket = program.command("ticket").description("Manage tickets");
  ticket
    .command("list")
    .description("List tickets in a project, oldest first")
    .argument("<project>", "project key, e.g. SUMI")
    .option("--status <lane>", "lane id, see `sumi board lane list <board>`")
    .option("--assignee <userId>")
    .option("--board <id>", "only tickets in this board; default: all boards")
    .action(async (projectKey: string, o: { status?: string; assignee?: string; board?: string }) => {
      const tickets = await api().listTickets({
        projectKey,
        ...defined({ status: o.status, assigneeId: o.assignee, boardId: o.board }),
      });
      print(tickets, () => (tickets.length > 0 ? tickets.map(formatTicketLine).join("\n") : "No tickets"));
    });
  ticket
    .command("get")
    .description("Show one ticket")
    .argument("<key>", "ticket key, e.g. SUMI-12")
    .action(async (key: string) => {
      const t = await api().getTicket(key);
      print(t, () => formatTicket(t));
    });
  ticket
    .command("create")
    .description("Create a ticket (status defaults to the board's first lane)")
    .argument("<project>", "project key")
    .argument("<title>")
    .option("--board <id>", "board id (required when the project has multiple boards)")
    .option("--description <text>", "markdown description")
    .option("--status <lane>", "lane id, see `sumi board lane list <board>`")
    .addOption(priorityOption())
    .option("--assignee <userId>")
    .option("--repo <owner/name>", "GitHub repository")
    .option("--branch <name>")
    .option("--pr <number>", "pull request number in --repo", positiveInt)
    .action(
      async (
        projectKey: string,
        title: string,
        o: {
          description?: string;
          board?: string;
          status?: CreateTicketInput["status"];
          priority?: CreateTicketInput["priority"];
          assignee?: string;
          repo?: string;
          branch?: string;
          pr?: number;
        },
      ) => {
        const links = defined({ repo: o.repo, branch: o.branch, pr: o.pr });
        const created = await api().createTicket({
          projectKey,
          title,
          ...defined({
            boardId: o.board,
            description: o.description,
            status: o.status,
            priority: o.priority,
            assigneeId: o.assignee,
          }),
          ...(Object.keys(links).length > 0 && { links }),
        });
        print(created, () => `Created ${formatTicketLine(created)}`);
      },
    );
  ticket
    .command("update")
    .description("Change fields of a ticket. Only the given options change; `none` clears --assignee and --priority.")
    .argument("<key>")
    .option("--title <text>")
    .option("--description <text>")
    .option("--assignee <userId|none>", "user id, or none to unassign")
    .addOption(new Option("--priority <priority>").choices([...PrioritySchema.options, "none"]))
    .option("--repo <owner/name>")
    .option("--branch <name>")
    .option("--pr <number>", "pull request number", positiveInt)
    .action(
      async (
        key: string,
        o: {
          title?: string;
          description?: string;
          assignee?: string;
          priority?: string;
          repo?: string;
          branch?: string;
          pr?: number;
        },
      ) => {
        const input: UpdateTicketInput = defined({
          title: o.title,
          description: o.description,
          assigneeId: orNone(o.assignee),
          priority: orNone(o.priority) as UpdateTicketInput["priority"],
        });
        const linkChanges = defined({ repo: o.repo, branch: o.branch, pr: o.pr });
        if (Object.keys(linkChanges).length > 0) {
          // The API replaces the whole links object, so merge into the current one
          // to avoid dropping e.g. the repo when only the PR number is given.
          const current = await api().getTicket(key);
          const links: TicketLinks = { ...current.links, ...linkChanges };
          input.links = links;
        }
        const updated = await api().updateTicket(key, input);
        print(updated, () => `Updated ${formatTicketLine(updated)}`);
      },
    );
  ticket
    .command("move")
    .description("Move a ticket to another status (a lane id, see `sumi board lane list <board>`)")
    .argument("<key>")
    .argument("<status>")
    .action(async (key: string, status: string) => {
      const moved = await api().moveTicket(key, { status });
      print(moved, () => `Moved ${formatTicketLine(moved)}`);
    });
  ticket
    .command("transfer")
    .description("Transfer within a project; keep status if present on the destination, otherwise use its first lane")
    .argument("<key>")
    .argument("<board>", "destination board id")
    .action(async (key: string, boardId: string) => {
      const transferred = await api().transferTicket(key, { boardId });
      print(transferred, () => `Transferred ${key} to ${transferred.boardId}`);
    });
  ticket
    .command("claim")
    .description(
      "Atomically take the oldest unassigned todo ticket (or one already yours), assign it to you and start it. Prints null/\"No ticket available\" when none.",
    )
    .argument("<project>", "project key")
    .option("--board <id>", "claim from this board; default: all boards")
    .action(async (projectKey: string, o: { board?: string }) => {
      const claimed = await api().claimNext(projectKey, o.board);
      print({ ticket: claimed }, () => (claimed ? `Claimed ${formatTicketLine(claimed)}` : "No ticket available"));
    });

  ticket
    .command("comment")
    .description("Add a comment (markdown) to a ticket")
    .argument("<key>")
    .argument("<body>")
    .action(async (key: string, body: string) => {
      const comment = await api().addComment(key, { body });
      print(comment, () => `Commented on ${key}`);
    });
  ticket
    .command("comments")
    .description("List the comments on a ticket, oldest first")
    .argument("<key>")
    .action(async (key: string) => {
      const comments = await api().listComments(key);
      print(comments, () => (comments.length > 0 ? comments.map(formatComment).join("\n\n") : "No comments"));
    });

  program
    .command("activity")
    .description("Show the activity log, newest first")
    .option("--project <key>")
    .option("--ticket <key>")
    .option("--limit <n>", "max entries (default 50, max 200)", positiveInt)
    .action(async (o: { project?: string; ticket?: string; limit?: number }) => {
      const entries = await api().listActivity(
        defined({ projectKey: o.project, ticketKey: o.ticket, limit: o.limit }),
      );
      print(entries, () => (entries.length > 0 ? entries.map(formatActivityLine).join("\n") : "No activity"));
    });

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode; // usage errors and --help; commander already printed
    const error =
      err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: "client_error", message: err instanceof Error ? err.message : String(err) };
    opts.stderr(json() ? `${JSON.stringify({ error })}\n` : `error: ${error.message}\n`);
    return 1;
  }
}
