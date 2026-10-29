import type { Client } from "@sumi/client";
import type { Project, Ticket, User } from "@sumi/contract";
import { computed, ref } from "vue";
import { groupByStatus, indexUsers } from "@/lib/board";

const PROJECT_KEY = "sumi.project";

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
    tickets.value = selected.value ? await client.listTickets({ projectKey: selected.value }) : [];
  }

  /** Loads everything the board needs. Keeps the selected project if it still exists. */
  async function load() {
    loading.value = true;
    await guard(async () => {
      [projects.value, users.value] = await Promise.all([client.listProjects(), client.listUsers()]);
      const wanted = selected.value ?? localStorage.getItem(PROJECT_KEY);
      selected.value = projects.value.find((p) => p.key === wanted)?.key ?? projects.value[0]?.key ?? null;
      await loadTickets();
    });
    loading.value = false;
  }

  async function select(key: string) {
    selected.value = key;
    localStorage.setItem(PROJECT_KEY, key);
    loading.value = true;
    await guard(loadTickets);
    loading.value = false;
  }

  return { projects, users, usersById, tickets, columns, selected, loading, error, load, select };
}
