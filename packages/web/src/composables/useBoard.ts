import type { Client } from "@sumi/client";
import type { ActivityEntry, Comment, CreateTicketInput, Lane, Project, SetLanesInput, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
import { computed, ref, watch as watchRef } from "vue";
import { groupByStatus, indexUsers } from "@/lib/board";

const PROJECT_KEY = "sumi.project";
const DEBOUNCE_MS = 100;

export function useBoard(client: Client) {
  const projects = ref<Project[]>([]);
  const users = ref<User[]>([]);
  const tickets = ref<Ticket[]>([]);
  const selected = ref<string | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const lanes = computed(() => projects.value.find((p) => p.key === selected.value)?.lanes ?? []);
  const columns = computed(() => groupByStatus(tickets.value, lanes.value));
  const usersById = computed(() => indexUsers(users.value));

  async function guard(work: () => Promise<void>) {
    try {
      error.value = null;
      await work();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function loadTickets() {
    const key = selected.value;
    const list = key ? await client.listTickets({ projectKey: key }) : [];
    // The user may have switched project while this was in flight; do not show the old one's tickets.
    if (selected.value === key) tickets.value = list;
  }

  async function loadAll() {
    [projects.value, users.value] = await Promise.all([client.listProjects(), client.listUsers()]);
    const wanted = selected.value ?? localStorage.getItem(PROJECT_KEY);
    selected.value = projects.value.find((p) => p.key === wanted)?.key ?? projects.value[0]?.key ?? null;
    await loadTickets();
  }

  /** Loads everything the board needs, with a loading state. Keeps the selected project if it still exists. */
  async function load() {
    loading.value = true;
    await guard(loadAll);
    loading.value = false;
  }

  // Reloads without a loading state. Never runs twice at once: a request that arrives
  // while one is running makes it run once more afterwards.
  const changes = ref(0); // counts reloads, so the open ticket's history reloads too
  let refreshing = false;
  let again = false;
  async function refresh() {
    if (refreshing) {
      again = true;
      return;
    }
    refreshing = true;
    try {
      do {
        again = false;
        await guard(loadAll);
        changes.value++;
      } while (again);
    } finally {
      refreshing = false;
    }
  }

  /**
   * Keeps the board current: reloads when the server reports a change and whenever
   * the live connection (re)opens. Changes that arrive in a burst cause one reload.
   * Returns a function that stops watching.
   */
  function watch(): () => void {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    void client.watch({
      signal: ac.signal,
      onReady: () => void refresh(),
      onEntry: () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
      },
    });
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }

  /** Moves a ticket to another column. Shows the move at once; the server's answer replaces it. */
  async function move(key: string, status: Status) {
    if (tickets.value.find((t) => t.key === key)?.status === status) return;
    tickets.value = tickets.value.map((t) => (t.key === key ? { ...t, status } : t));
    await guard(async () => {
      try {
        replace(await client.moveTicket(key, { status }));
      } catch (err) {
        await loadTickets().catch(() => undefined); // back to what the server has
        throw err;
      }
    });
  }

  /**
   * Saves the lanes of the selected project. Renaming and reordering show at once; adding waits for the server,
   * which makes the id. Resolves to the saved lanes, or null when the server refused (the error is shown on the board).
   */
  async function setLanes(next: SetLanesInput["lanes"]): Promise<Lane[] | null> {
    const key = selected.value;
    if (!key) return null;
    const before = projects.value;
    const patch = (lanes: Lane[]) => (projects.value = before.map((p) => (p.key === key ? { ...p, lanes } : p)));
    if (next.every((l) => l.id !== undefined)) patch(next as Lane[]);
    const saved = { lanes: null as Lane[] | null };
    await guard(async () => {
      try {
        const project = await client.setLanes(key, { lanes: next });
        projects.value = projects.value.map((p) => (p.key === key ? project : p));
        saved.lanes = project.lanes;
      } catch (err) {
        projects.value = before; // back to what the server has
        throw err;
      }
    });
    return saved.lanes;
  }

  /** Resolves to false when the server refused, so a form can stay open. The error is shown on the board. */
  async function update(key: string, input: UpdateTicketInput): Promise<boolean> {
    let ok = false;
    await guard(async () => {
      replace(await client.updateTicket(key, input));
      ok = true;
    });
    return ok;
  }

  /** Creates a ticket in the selected project. Throws on failure so the form can show the message. */
  async function create(input: Omit<CreateTicketInput, "projectKey">) {
    if (!selected.value) throw new Error("No project selected");
    const created = await client.createTicket({ ...input, projectKey: selected.value });
    // The live update may have added it already.
    if (selected.value === created.projectKey && !tickets.value.some((t) => t.key === created.key)) {
      tickets.value = [...tickets.value, created];
    }
    return created;
  }

  function replace(ticket: Ticket) {
    tickets.value = tickets.value.map((t) => (t.key === ticket.key ? ticket : t));
  }

  // The ticket whose detail panel is open, and its history.
  const openKey = ref<string | null>(null);
  const openTicket = computed(() => tickets.value.find((t) => t.key === openKey.value) ?? null);
  const activity = ref<ActivityEntry[]>([]);
  const comments = ref<Comment[]>([]);
  watchRef(
    () => (openTicket.value ? `${openTicket.value.key}@${openTicket.value.updatedAt.getTime()}@${changes.value}` : null),
    async (id) => {
      if (!id) {
        activity.value = [];
        comments.value = [];
        return;
      }
      const key = openTicket.value?.key;
      if (!key) return;
      const [list, discussion] = await Promise.all([
        client.listActivity({ ticketKey: key }).catch(() => null),
        client.listComments(key).catch(() => null),
      ]);
      if (openKey.value !== key) return;
      if (list) activity.value = list;
      if (discussion) comments.value = discussion;
    },
    { immediate: true },
  );

  /** Throws on failure so the form can show the message and keep the text. */
  async function comment(key: string, body: string) {
    const added = await client.addComment(key, { body });
    // The live update may have added it already.
    if (openKey.value === key && !comments.value.some((c) => c.id === added.id)) {
      comments.value = [...comments.value, added];
    }
  }

  async function select(key: string) {
    openKey.value = null;
    selected.value = key;
    localStorage.setItem(PROJECT_KEY, key);
    loading.value = true;
    await guard(loadTickets);
    loading.value = false;
  }

  return {
    projects, users, usersById, tickets, lanes, columns, selected, loading, error,
    openKey, openTicket, activity, comments,
    load, select, move, update, create, comment, setLanes, watch,
  };
}
