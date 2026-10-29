import type { Client } from "@sumi/client";
import type { Project, Ticket, User } from "@sumi/contract";
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
  { key: "SUMI", name: "Sumi", createdAt: now },
  { key: "WEB", name: "Website", createdAt: now },
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
    listTickets: vi.fn(async ({ projectKey }: { projectKey: string }) => tickets[projectKey] ?? []),
    // Never connects. Tests drive it through the options passed to the first call.
    watch: vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))),
    ...overrides,
  } as unknown as Client;
}
