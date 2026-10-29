import type { Status, Ticket } from "@sumi/contract";
import type { createTicketService } from "./tickets";
import type { Ctx } from "./shared";

/** The user that GitHub-driven changes are attributed to (AGENTS.md rule 5). Created on first use. */
export const GITHUB_USER_ID = "system:github";

export interface PullRequestEvent {
  /** `owner/name` */
  repo: string;
  number: number;
  branch: string;
  title: string;
  /** The webhook's `action`, e.g. `opened`, `closed`. */
  action: string;
  merged: boolean;
  draft: boolean;
}

/** Where a pull request event takes its ticket, or null if the event does not change anything. */
export function statusForPullRequest({ action, merged, draft }: PullRequestEvent): Status | null {
  switch (action) {
    case "opened":
    case "reopened":
    case "ready_for_review":
      return draft ? "in_progress" : "in_review";
    case "converted_to_draft":
      return "in_progress";
    case "closed":
      return merged ? "done" : null;
    default:
      return null;
  }
}

/** Something that looks like a ticket key in free text, e.g. `sumi-12` in a branch name. */
const KEY_PATTERN = /\b[a-z][a-z0-9]{1,9}-[1-9]\d*\b/gi;

export function createGithubService({ cols }: Ctx, tickets: ReturnType<typeof createTicketService>) {
  async function ensureActor(): Promise<string> {
    await cols.users.updateOne(
      { _id: GITHUB_USER_ID },
      { $setOnInsert: { kind: "agent", name: "GitHub", createdAt: new Date() } },
      { upsert: true },
    );
    return GITHUB_USER_ID;
  }

  return {
    /**
     * Applies a pull request event to the tickets it belongs to and returns them.
     * A ticket belongs to a PR when its links name the same repo and the PR number or branch,
     * or when its key appears in the branch name or title (and its links do not name another repo).
     * Matched tickets are moved (see `statusForPullRequest`) and get the repo, branch and PR number
     * added to their links, so the board shows the PR.
     */
    async syncPullRequest(event: PullRequestEvent): Promise<Ticket[]> {
      const target = statusForPullRequest(event);
      if (!target) return [];

      const keys = [...new Set(`${event.branch} ${event.title}`.match(KEY_PATTERN)?.map((k) => k.toUpperCase()))];
      const candidates = await cols.tickets
        .find({
          $or: [
            { "links.repo": event.repo, "links.pr": event.number },
            { "links.repo": event.repo, "links.branch": event.branch },
            ...(keys.length > 0 ? [{ _id: { $in: keys } }] : []),
          ],
        })
        .sort({ number: 1 })
        .toArray();
      const matches = candidates.filter((t) => t.links.repo === undefined || t.links.repo === event.repo);
      if (matches.length === 0) return [];

      const actorId = await ensureActor();
      const updated: Ticket[] = [];
      for (const doc of matches) {
        const links = { ...doc.links, repo: event.repo, branch: event.branch, pr: event.number };
        if (!sameLinks(doc.links, links)) await tickets.update(actorId, doc._id, { links });
        updated.push(await tickets.move(actorId, doc._id, { status: target }));
      }
      return updated;
    },
  };
}

function sameLinks(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return a.repo === b.repo && a.branch === b.branch && a.pr === b.pr;
}
