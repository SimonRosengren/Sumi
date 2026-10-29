import { placeLane } from "@sumi/client";
import { StatusSchema, type ActivityEntry, type Lane, type Ticket, type User } from "@sumi/contract";

/** Marks a drag as a lane being reordered, as opposed to a ticket (which travels as `text/plain`). */
export const LANE_DRAG_TYPE = "application/x-sumi-lane";

/** Tickets by lane id. Every lane has an entry, in order within a lane; tickets in an unknown lane are left out. */
export function groupByStatus(tickets: Ticket[], lanes: Lane[]): Record<string, Ticket[]> {
  const groups: Record<string, Ticket[]> = Object.fromEntries(lanes.map((l) => [l.id, []]));
  for (const t of tickets) groups[t.status]?.push(t);
  return groups;
}

/** The lanes with `id` moved to where `target` is: dragging a lane onto another puts it in that place. */
export function moveLane(lanes: Lane[], id: string, target: string): Lane[] {
  const to = lanes.findIndex((l) => l.id === target);
  return to === -1 ? lanes : placeLane(lanes, id, to + 1);
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
export function describeActivity(entry: ActivityEntry, lanes: Lane[] = []): string {
  const laneName = (id: string) => lanes.find((l) => l.id === id)?.name ?? id;
  const data = entry.data;
  switch (entry.action) {
    case "ticket.created":
      return "created this ticket";
    case "ticket.moved": {
      const from = StatusSchema.safeParse(data.from);
      const to = StatusSchema.safeParse(data.to);
      return from.success && to.success
        ? `moved from ${laneName(from.data)} to ${laneName(to.data)}`
        : "moved this ticket";
    }
    case "ticket.commented":
      return "commented";
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
