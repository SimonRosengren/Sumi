import type { Client } from "@sumi/client";
import type { ActivityEntry, Project, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
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

  const columns = computed(() => groupByStatus(tickets.value));
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

  async function update(key: string, input: UpdateTicketInput) {
    await guard(async () => replace(await client.updateTicket(key, input)));
  }

  function replace(ticket: Ticket) {
    tickets.value = tickets.value.map((t) => (t.key === ticket.key ? ticket : t));
  }

  // The ticket whose detail panel is open, and its history.
  const openKey = ref<string | null>(null);
  const openTicket = computed(() => tickets.value.find((t) => t.key === openKey.value) ?? null);
  const activity = ref<ActivityEntry[]>([]);
  watchRef(
    () => (openTicket.value ? `${openTicket.value.key}@${openTicket.value.updatedAt.getTime()}` : null),
    async (id) => {
      if (!id) {
        activity.value = [];
        return;
      }
      const key = openTicket.value?.key;
      if (!key) return;
      const list = await client.listActivity({ ticketKey: key }).catch(() => null);
      if (list && openKey.value === key) activity.value = list;
    },
    { immediate: true },
  );

  async function select(key: string) {
    openKey.value = null;
    selected.value = key;
    localStorage.setItem(PROJECT_KEY, key);
    loading.value = true;
    await guard(loadTickets);
    loading.value = false;
  }

  return {
    projects, users, usersById, tickets, columns, selected, loading, error,
    openKey, openTicket, activity,
    load, select, move, update, watch,
  };
}
