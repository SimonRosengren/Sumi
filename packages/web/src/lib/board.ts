import { STATUSES, type Status, type Ticket, type User } from "@sumi/contract";

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export function groupByStatus(tickets: Ticket[]): Record<Status, Ticket[]> {
  const groups = Object.fromEntries(STATUSES.map((s) => [s, [] as Ticket[]])) as Record<Status, Ticket[]>;
  for (const t of tickets) groups[t.status].push(t);
  return groups;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]?.[0], parts[parts.length - 1]?.[0]] : [parts[0]?.slice(0, 2)];
  return letters.join("").toUpperCase();
}

export function indexUsers(users: User[]): Map<string, User> {
  return new Map(users.map((u) => [u.id, u]));
}
