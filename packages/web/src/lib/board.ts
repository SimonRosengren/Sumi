import { STATUSES, StatusSchema, type ActivityEntry, type Status, type Ticket, type User } from "@sumi/contract";

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

/** One line of ticket history, e.g. "moved from Todo to In progress". */
export function describeActivity(entry: ActivityEntry): string {
  const data = entry.data;
  switch (entry.action) {
    case "ticket.created":
      return "created this ticket";
    case "ticket.moved": {
      const from = StatusSchema.safeParse(data.from);
      const to = StatusSchema.safeParse(data.to);
      return from.success && to.success
        ? `moved from ${STATUS_LABEL[from.data]} to ${STATUS_LABEL[to.data]}`
        : "moved this ticket";
    }
    case "ticket.claimed":
      return "claimed this ticket";
    case "ticket.updated": {
      const fields = Array.isArray(data.fields) ? data.fields.map(String).join(", ") : "";
      return fields ? `updated ${fields}` : "updated this ticket";
    }
    default:
      return entry.action;
  }
}
