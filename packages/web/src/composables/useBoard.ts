import type { Client } from "@sumi/client";
import type { Project, Ticket, User } from "@sumi/contract";
import { computed, ref } from "vue";
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

  async function select(key: string) {
    selected.value = key;
    localStorage.setItem(PROJECT_KEY, key);
    loading.value = true;
    await guard(loadTickets);
    loading.value = false;
  }

  return { projects, users, usersById, tickets, columns, selected, loading, error, load, select, watch };
}
