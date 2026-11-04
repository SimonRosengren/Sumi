import type { Client } from "@sumi/client";
import type { ActivityEntry, Board, Comment, CreateTicketInput, Lane, Project, SetLanesInput, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
import { computed, ref, watch as watchRef } from "vue";
import { groupByStatus, indexUsers } from "@/lib/board";

const PROJECT_KEY = "sumi.project";
const BOARDS_KEY = "sumi.boards";
const DEBOUNCE_MS = 100;

export function useBoard(client: Client) {
  const projects = ref<Project[]>([]);
  const allBoards = ref<Board[]>([]);
  const users = ref<User[]>([]);
  const tickets = ref<Ticket[]>([]);
  const selectedIds = ref<string[]>([]);
  const selectedBoard = ref<string | null>(null);
  const activeBoards = computed(() => allBoards.value.filter((b) => selectedIds.value.includes(b.id)));
  const selected = computed(() => currentBoard.value?.projectKey ?? null);
  const boards = computed(() => allBoards.value.filter((b) => b.projectKey === selected.value));
  const currentBoard = computed(() => allBoards.value.find((b) => b.id === selectedBoard.value) ?? null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const lanes = computed(() => currentBoard.value?.lanes ?? []);
  const columns = computed(() => groupByStatus(tickets.value.filter((t) => t.boardId === selectedBoard.value), lanes.value));
  const usersById = computed(() => indexUsers(users.value));

  async function guard(work: () => Promise<void>) {
    try {
      error.value = null;
      await work();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  let ticketRequest = 0;
  async function loadTickets() {
    const request = ++ticketRequest;
    const selection = JSON.stringify(selectedIds.value);
    const lists = await Promise.all(activeBoards.value.map((b) => client.listTickets({ projectKey: b.projectKey, boardId: b.id })));
    if (request === ticketRequest && selection === JSON.stringify(selectedIds.value)) tickets.value = lists.flat();
  }

  let initialized = false;
  function remember() {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(selectedIds.value));
    if (selected.value && selectedBoard.value) {
      localStorage.setItem(PROJECT_KEY, selected.value);
      localStorage.setItem(`sumi.board.${selected.value}`, selectedBoard.value);
    }
  }

  async function loadAll() {
    const [projectList, userList] = await Promise.all([client.listProjects(), client.listUsers()]);
    const boardLists = await Promise.all(projectList.map((p) => client.listBoards(p.key)));
    projects.value = projectList;
    users.value = userList;
    allBoards.value = boardLists.flat();
    let wanted = selectedIds.value;
    if (!initialized) {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(BOARDS_KEY) ?? "null");
        if (Array.isArray(stored) && stored.every((id) => typeof id === "string")) wanted = stored;
        else throw new Error("Legacy selection");
      } catch {
        const key = localStorage.getItem(PROJECT_KEY);
        const preferred = localStorage.getItem(`sumi.board.${key}`);
        const first = allBoards.value.find((b) => b.projectKey === key && b.id === preferred)
          ?? allBoards.value.find((b) => b.projectKey === key) ?? allBoards.value[0];
        wanted = first ? [first.id] : [];
      }
      initialized = true;
    }
    selectedIds.value = allBoards.value.filter((b) => wanted.includes(b.id)).map((b) => b.id);
    if (wanted.length && !selectedIds.value.length && allBoards.value[0]) selectedIds.value = [allBoards.value[0].id];
    if (!selectedIds.value.includes(selectedBoard.value ?? "")) selectedBoard.value = selectedIds.value[0] ?? null;
    remember();
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
   * Saves the lanes of the selected board. Renaming and reordering show at once; adding waits for the server,
   * which makes the id. Resolves to the saved lanes, or null when the server refused (the error is shown on the board).
   */
  async function setLanes(next: SetLanesInput["lanes"]): Promise<Lane[] | null> {
    const id = selectedBoard.value;
    if (!id) return null;
    const before = allBoards.value;
    const patch = (lanes: Lane[]) => (allBoards.value = allBoards.value.map((b) => (b.id === id ? { ...b, lanes } : b)));
    if (next.every((l) => l.id !== undefined)) patch(next as Lane[]);
    const saved = { lanes: null as Lane[] | null };
    await guard(async () => {
      try {
        const board = await client.setLanes(id, { lanes: next });
        allBoards.value = allBoards.value.map((b) => (b.id === id ? board : b));
        saved.lanes = board.lanes;
      } catch (err) {
        allBoards.value = allBoards.value.map((b) => b.id === id ? before.find((old) => old.id === id) ?? b : b);
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
    const target = allBoards.value.find((b) => b.id === (input.boardId ?? selectedBoard.value));
    if (!target) throw new Error("No board selected");
    const created = await client.createTicket({ ...input, projectKey: target.projectKey, boardId: target.id });
    // The live update may have added it already.
    if (selectedIds.value.includes(created.boardId) && !tickets.value.some((t) => t.key === created.key)) {
      tickets.value = [...tickets.value, created];
    }
    return created;
  }

  function replace(ticket: Ticket) {
    tickets.value = tickets.value.map((t) => (t.key === ticket.key ? ticket : t)).filter((t) => selectedIds.value.includes(t.boardId));
  }

  async function transfer(key: string, boardId: string) {
    await guard(async () => replace(await client.transferTicket(key, { boardId })));
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

  function targetBoard(id: string) {
    if (selectedIds.value.includes(id)) selectedBoard.value = id;
  }

  async function toggleBoard(id: string) {
    const target = allBoards.value.find((b) => b.id === id);
    if (!target) return;
    const ids = selectedIds.value.includes(id) ? selectedIds.value.filter((x) => x !== id) : [...selectedIds.value, id];
    selectedIds.value = allBoards.value.filter((b) => ids.includes(b.id)).map((b) => b.id);
    if (!selectedIds.value.includes(selectedBoard.value ?? "")) selectedBoard.value = selectedIds.value[0] ?? null;
    tickets.value = tickets.value.filter((t) => selectedIds.value.includes(t.boardId));
    if (!tickets.value.some((t) => t.key === openKey.value)) openKey.value = null;
    remember();
    loading.value = true;
    await guard(loadTickets);
    loading.value = false;
  }

  return {
    projects, allBoards, activeBoards, selectedIds, boards, selectedBoard, currentBoard, users, usersById, tickets, lanes, columns, selected, loading, error,
    openKey, openTicket, activity, comments,
    load, toggleBoard, targetBoard, transfer, move, update, create, comment, setLanes, watch,
  };
}
