import {
  PrioritySchema,
  STATUSES,
  type CreateTicketInput,
  type TicketLinks,
  type UpdateTicketInput,
} from "@sumi/contract";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { ApiError, createClient, type Client } from "@sumi/client";
import {
  formatActivityLine,
  formatProjectLine,
  formatTicket,
  formatTicketLine,
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

  const agent = program.command("agent").description("Manage agents (humans only)");
  agent
    .command("create")
    .description("Create an agent user and its token. The token is shown once.")
    .argument("<name>")
    .action(async (name: string) => {
      const created = await api().createAgent(name);
      print(created, () => `Created agent ${created.user.name} (${created.user.id})\nToken (shown once): ${created.token}`);
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

  const ticket = program.command("ticket").description("Manage tickets");
  ticket
    .command("list")
    .description("List tickets in a project, oldest first")
    .argument("<project>", "project key, e.g. SUMI")
    .addOption(new Option("--status <status>").choices(STATUSES))
    .option("--assignee <userId>")
    .action(async (projectKey: string, o: { status?: string; assignee?: string }) => {
      const tickets = await api().listTickets({
        projectKey,
        ...defined({ status: o.status as (typeof STATUSES)[number] | undefined, assigneeId: o.assignee }),
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
    .description("Create a ticket (status defaults to backlog)")
    .argument("<project>", "project key")
    .argument("<title>")
    .option("--description <text>", "markdown description")
    .addOption(new Option("--status <status>").choices(STATUSES))
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
    .description("Move a ticket to another status")
    .argument("<key>")
    .addArgument(new Argument("<status>").choices(STATUSES))
    .action(async (key: string, status: (typeof STATUSES)[number]) => {
      const moved = await api().moveTicket(key, { status });
      print(moved, () => `Moved ${formatTicketLine(moved)}`);
    });
  ticket
    .command("claim")
    .description(
      "Atomically take the oldest unassigned todo ticket (or one already yours), assign it to you and start it. Prints null/\"No ticket available\" when none.",
    )
    .argument("<project>", "project key")
    .action(async (projectKey: string) => {
      const claimed = await api().claimNext(projectKey);
      print({ ticket: claimed }, () => (claimed ? `Claimed ${formatTicketLine(claimed)}` : "No ticket available"));
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
