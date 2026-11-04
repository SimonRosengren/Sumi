import type { Lane, Ticket } from "@sumi/contract";

const KEY = "sumi.view";

/** How this browser shows the board. Not shared and not sent to the server (ADR 0030). */
export interface ViewSettings {
  /** Hide lanes that have no tickets in this board. */
  hideEmpty: boolean;
  /** Ids of the lanes the user hid, by board id. */
  hidden: Record<string, string[]>;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function loadView(boardId?: string | null): ViewSettings {
  try {
    const stored = localStorage.getItem(boardId ? `${KEY}.${boardId}` : KEY);
    // Carry the old project settings into its migrated General board only.
    if (stored === null && boardId?.endsWith("-general")) {
      const legacy = loadView();
      return { hideEmpty: legacy.hideEmpty, hidden: { [boardId]: legacy.hidden[boardId.slice(0, -8)] ?? [] } };
    }
    const raw: unknown = JSON.parse(stored ?? "null");
    if (typeof raw !== "object" || raw === null) throw new Error("not an object");
    const { hideEmpty, hidden } = raw as { hideEmpty?: unknown; hidden?: unknown };
    const byProject = typeof hidden === "object" && hidden !== null ? hidden : {};
    return {
      hideEmpty: hideEmpty === true,
      hidden: Object.fromEntries(Object.entries(byProject).map(([project, ids]) => [project, strings(ids)])),
    };
  } catch {
    return { hideEmpty: false, hidden: {} };
  }
}

export function saveView(view: ViewSettings, boardId?: string | null): void {
  localStorage.setItem(boardId ? `${KEY}.${boardId}` : KEY, JSON.stringify(view));
}

/** The lanes to draw: not hidden by the user, and, with `hideEmpty`, holding at least one ticket. */
export function visibleLanes(
  lanes: Lane[],
  columns: Record<string, Ticket[]>,
  hidden: string[],
  hideEmpty: boolean,
): Lane[] {
  return lanes.filter((l) => !hidden.includes(l.id) && !(hideEmpty && (columns[l.id]?.length ?? 0) === 0));
}
