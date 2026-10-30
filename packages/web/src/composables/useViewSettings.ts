import type { Lane, Ticket } from "@sumi/contract";
import { computed, ref, type Ref } from "vue";
import { loadView, saveView, visibleLanes } from "@/lib/view";

/** The board's display settings (hidden lanes, hide empty lanes), remembered in this browser. */
export function useViewSettings(
  project: Ref<string | null>,
  lanes: Ref<Lane[]>,
  columns: Ref<Record<string, Ticket[]>>,
) {
  const view = ref(loadView());
  const persist = () => saveView(view.value);

  /** Lanes the user hid in the current project; ids of lanes that no longer exist are ignored. */
  const hiddenIds = computed(() => {
    const hidden = (project.value && view.value.hidden[project.value]) || [];
    return hidden.filter((id) => lanes.value.some((l) => l.id === id));
  });
  const hideEmpty = computed(() => view.value.hideEmpty);
  const visible = computed(() => visibleLanes(lanes.value, columns.value, hiddenIds.value, hideEmpty.value));
  /** Any setting is changing what the board shows. */
  const active = computed(() => hideEmpty.value || hiddenIds.value.length > 0);

  function setHideEmpty(value: boolean) {
    view.value.hideEmpty = value;
    persist();
  }

  function setLaneHidden(id: string, hide: boolean) {
    if (!project.value) return;
    const others = (view.value.hidden[project.value] ?? []).filter((x) => x !== id);
    view.value.hidden[project.value] = hide ? [...others, id] : others;
    persist();
  }

  /** Shows everything again in the current project. */
  function reset() {
    view.value.hideEmpty = false;
    if (project.value) delete view.value.hidden[project.value];
    persist();
  }

  return { hideEmpty, hiddenIds, visible, active, setHideEmpty, setLaneHidden, reset };
}
