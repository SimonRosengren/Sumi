import type { Board, Ticket } from "@sumi/contract";
import { ref, watch, type Ref } from "vue";
import { groupByStatus } from "@/lib/board";
import { loadView, saveView, visibleLanes, type ViewSettings } from "@/lib/view";

/** The board's display settings (hidden lanes, hide empty lanes), remembered in this browser. */
export function useViewSettings(
  boards: Ref<Board[]>,
  tickets: Ref<Ticket[]>,
) {
  const settings = ref<Record<string, ViewSettings>>({});
  watch(boards, (items) => {
    settings.value = Object.fromEntries(items.map((b) => [b.id, settings.value[b.id] ?? loadView(b.id)]));
  }, { immediate: true, flush: "sync" });

  const columns = (board: Board) => groupByStatus(tickets.value.filter((t) => t.boardId === board.id), board.lanes);

  /** Lanes hidden in the current board; removed lane ids are ignored. */
  const hiddenIds = (board: Board) => (settings.value[board.id]?.hidden[board.id] ?? []).filter((id) => board.lanes.some((l) => l.id === id));
  const hideEmpty = (id: string) => settings.value[id]?.hideEmpty ?? false;
  const visible = (board: Board) => visibleLanes(board.lanes, columns(board), hiddenIds(board), hideEmpty(board.id));
  /** Any setting is changing what the board shows. */
  const active = (board: Board) => hideEmpty(board.id) || hiddenIds(board).length > 0;

  function persist(id: string, change: (view: ViewSettings) => void) {
    const view = settings.value[id];
    if (!view) return;
    change(view);
    saveView(view, id);
  }

  function setHideEmpty(boardId: string, value: boolean) {
    persist(boardId, (view) => { view.hideEmpty = value; });
  }

  function setLaneHidden(boardId: string, id: string, hide: boolean) {
    persist(boardId, (view) => {
      const others = (view.hidden[boardId] ?? []).filter((x) => x !== id);
      view.hidden[boardId] = hide ? [...others, id] : others;
    });
  }

  /** Shows everything again in the current board. */
  function reset(boardId: string) {
    persist(boardId, (view) => { view.hideEmpty = false; delete view.hidden[boardId]; });
  }

  return { settings, columns, hideEmpty, hiddenIds, visible, active, setHideEmpty, setLaneHidden, reset };
}
