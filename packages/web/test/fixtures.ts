import type { Client } from "@sumi/client";
import { DEFAULT_LANES, type Project, type Ticket, type User } from "@sumi/contract";
import { vi } from "vitest";

const now = new Date("2026-01-01T00:00:00Z");

export const alice: User = { id: "u1", kind: "human", name: "Alice Andersson", createdAt: now };
export const bot: User = { id: "u2", kind: "agent", name: "Claude", createdAt: now };

export function ticket(overrides: Partial<Ticket> & Pick<Ticket, "key" | "title">): Ticket {
  const number = Number(overrides.key.split("-")[1]);
  return {
    projectKey: overrides.key.split("-")[0] as string,
    number,
    description: "",
    status: "backlog",
    links: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const projects: Project[] = [
  { key: "SUMI", name: "Sumi", lanes: [...DEFAULT_LANES], createdAt: now },
  { key: "WEB", name: "Website", lanes: [...DEFAULT_LANES], createdAt: now },
];

export const tickets: Record<string, Ticket[]> = {
  SUMI: [
    ticket({ key: "SUMI-1", title: "Backlog one" }),
    ticket({ key: "SUMI-2", title: "Doing it", status: "in_progress", assigneeId: "u2", priority: "high", links: { pr: 7, branch: "feat/x" } }),
    ticket({ key: "SUMI-3", title: "Finished", status: "done", assigneeId: "u1" }),
  ],
  WEB: [ticket({ key: "WEB-1", title: "Landing page", status: "todo" })],
};

/** A fake API client. Only the methods the board uses are implemented. */
export function fakeClient(overrides: Partial<Record<keyof Client, unknown>> = {}): Client {
  return {
    listProjects: vi.fn(async () => projects),
    listUsers: vi.fn(async () => [alice, bot]),
    setLanes: vi.fn(async (key: string, { lanes }: { lanes: { id?: string; name: string }[] }) => ({
      ...(projects.find((p) => p.key === key) as Project),
      lanes: lanes.map((l) => ({ id: l.id ?? l.name.toLowerCase().replaceAll(" ", "_"), name: l.name })),
    })),
    listTickets: vi.fn(async ({ projectKey }: { projectKey: string }) => tickets[projectKey] ?? []),
    moveTicket: vi.fn(async (key: string, { status }: { status: string }) => {
      const t = Object.values(tickets).flat().find((x) => x.key === key);
      return { ...t, status, updatedAt: new Date() };
    }),
    updateTicket: vi.fn(async (key: string, input: object) => {
      const t = Object.values(tickets).flat().find((x) => x.key === key);
      return { ...t, ...input, updatedAt: new Date() };
    }),
    createTicket: vi.fn(async (input: { projectKey: string; title: string; description?: string; status?: string }) =>
      ticket({ key: `${input.projectKey}-99`, ...input, title: input.title, status: (input.status ?? "backlog") as Ticket["status"] }),
    ),
    listActivity: vi.fn(async () => []),
    listComments: vi.fn(async () => []),
    addComment: vi.fn(async (key: string, { body }: { body: string }) => ({
      id: `c-${body}`, ticketKey: key, authorId: "u1", body, createdAt: new Date("2026-01-03T10:00:00Z"),
    })),
    // Never connects. Tests drive it through the options passed to the first call.
    watch: vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))),
    ...overrides,
  } as unknown as Client;
}
