import type { ActivityEntry, Project, Ticket, TokenInfo, User } from "@sumi/contract";

export function formatTicketLine(t: Ticket): string {
  return `${t.key}  ${t.status.padEnd(11)}  ${(t.priority ?? "-").padEnd(6)}  ${t.title}`;
}

export function formatTicket(t: Ticket): string {
  const lines = [
    `${t.key}  ${t.title}`,
    `status:   ${t.status}`,
    `priority: ${t.priority ?? "-"}`,
    `assignee: ${t.assigneeId ?? "-"}`,
  ];
  if (t.links.repo) lines.push(`repo:     ${t.links.repo}`);
  if (t.links.branch) lines.push(`branch:   ${t.links.branch}`);
  if (t.links.pr) lines.push(`pr:       #${t.links.pr}`);
  lines.push(`created:  ${t.createdAt.toISOString()}`, `updated:  ${t.updatedAt.toISOString()}`);
  if (t.description) lines.push("", t.description);
  return lines.join("\n");
}

export const formatProjectLine = (p: Project): string => `${p.key}  ${p.name}`;

export const formatTokenLine = (t: TokenInfo): string => `${t.id}  ${t.userId}  ${t.createdAt.toISOString()}`;

export const formatUser = (u: User): string => `${u.name} (${u.kind})  ${u.id}`;

export function formatActivityLine(e: ActivityEntry): string {
  const details = Object.keys(e.data).length > 0 ? `  ${JSON.stringify(e.data)}` : "";
  return `${e.createdAt.toISOString()}  ${e.actorId}  ${e.action}  ${e.ticketKey ?? e.projectKey ?? "-"}${details}`;
}
