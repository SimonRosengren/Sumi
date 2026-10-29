<script setup lang="ts">
import type { Lane, Ticket, User } from "@sumi/contract";
import { LANE_NAME_MAX_LENGTH } from "@sumi/contract";
import { GripVertical, Pencil, Trash2 } from "@lucide/vue";
import { nextTick, ref, watch } from "vue";
import StatusIcon from "@/components/StatusIcon.vue";
import TicketCard from "@/components/TicketCard.vue";
import { LANE_DRAG_TYPE } from "@/lib/board";

const props = defineProps<{
  lane: Lane;
  tickets: Ticket[];
  usersById: Map<string, User>;
  /** Edit mode: the lane can be dragged by its name, renamed and removed. */
  editing: boolean;
  /** The lane's name is being edited. */
  renaming: boolean;
}>();
const emit = defineEmits<{
  open: [key: string];
  move: [key: string, status: string];
  /** Another lane was dropped here. */
  dropLane: [id: string];
  startRename: [];
  rename: [name: string];
  cancelRename: [];
  remove: [];
}>();

const over = ref(false);
const laneOver = ref(false);
const nameInput = ref<HTMLInputElement>();
const draft = ref("");

watch(
  () => props.renaming,
  (renaming) => {
    if (!renaming) return;
    draft.value = props.lane.name;
    void nextTick(() => {
      nameInput.value?.focus();
      nameInput.value?.select();
    });
  },
  { immediate: true },
);

const isLaneDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes(LANE_DRAG_TYPE);

function leave(e: DragEvent) {
  // Moving over a card inside the column also fires dragleave; only react to really leaving.
  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) over.value = false;
}

function dragOverTickets(e: DragEvent) {
  if (isLaneDrag(e)) return; // not for the tray: the lane handler below takes it
  e.preventDefault();
  over.value = true;
}

function drop(e: DragEvent) {
  over.value = false;
  const key = e.dataTransfer?.getData("text/plain");
  if (key) emit("move", key, props.lane.id);
}

function dragLane(e: DragEvent) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(LANE_DRAG_TYPE, props.lane.id);
  e.dataTransfer.effectAllowed = "move";
}

function dragOverLane(e: DragEvent) {
  if (!props.editing || !isLaneDrag(e)) return;
  e.preventDefault();
  laneOver.value = true;
}

function leaveLane(e: DragEvent) {
  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) laneOver.value = false;
}

function dropLane(e: DragEvent) {
  laneOver.value = false;
  const id = props.editing ? e.dataTransfer?.getData(LANE_DRAG_TYPE) : "";
  if (id && id !== props.lane.id) {
    e.preventDefault();
    emit("dropLane", id);
  }
}

function commit() {
  if (!props.renaming) return; // Escape already ended it
  const name = draft.value.trim();
  if (name) emit("rename", name);
  else emit("cancelRename");
}
</script>

<template>
  <section
    class="flex w-72 shrink-0 flex-col gap-2 rounded-lg transition-colors sm:w-auto sm:min-w-0 sm:flex-1"
    :class="{ 'bg-primary/10': laneOver }"
    :data-status="lane.id"
    @dragover="dragOverLane"
    @dragleave="leaveLane"
    @drop="dropLane"
  >
    <header
      class="flex items-center gap-2 rounded-md px-1.5 py-1"
      :class="{ 'hover:bg-accent cursor-grab active:cursor-grabbing': editing && !renaming }"
      :draggable="editing && !renaming"
      data-lane-handle
      @dragstart="dragLane"
    >
      <GripVertical v-if="editing" class="text-muted-foreground -ml-1 size-3.5 shrink-0" aria-hidden="true" />
      <StatusIcon :status="lane.id" />
      <input
        v-if="renaming"
        ref="nameInput"
        v-model="draft"
        :maxlength="LANE_NAME_MAX_LENGTH"
        aria-label="Lane name"
        autocomplete="off"
        class="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-6 min-w-0 flex-1 rounded-md border px-1.5 text-[13px] font-semibold tracking-tight outline-none focus-visible:ring-2"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="emit('cancelRename')"
        @blur="commit"
      />
      <template v-else>
        <h2 class="min-w-0 truncate text-[13px] font-semibold tracking-tight">{{ lane.name }}</h2>
        <span class="text-muted-foreground font-mono text-xs">{{ tickets.length }}</span>
        <template v-if="editing">
          <button
            type="button"
            class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 -my-0.5 shrink-0 rounded-md p-1 transition-colors outline-none focus-visible:ring-2"
            :aria-label="`Rename ${lane.name}`"
            @click="emit('startRename')"
          >
            <Pencil class="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:ring-ring/40 -my-0.5 ml-auto shrink-0 rounded-md p-1 transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
            :aria-label="`Delete ${lane.name}`"
            :title="tickets.length > 0 ? 'Move its tickets away first' : 'Delete lane'"
            :disabled="tickets.length > 0"
            @click="emit('remove')"
          >
            <Trash2 class="size-3.5" aria-hidden="true" />
          </button>
        </template>
      </template>
    </header>
    <div
      class="bg-muted/50 flex min-h-24 flex-1 flex-col gap-1.5 rounded-lg border border-transparent p-1.5 transition-colors"
      :class="{ 'bg-primary/10 border-primary/40': over }"
      data-dropzone
      @dragover="dragOverTickets"
      @dragleave="leave"
      @drop.prevent="drop"
    >
      <TicketCard
        v-for="t in tickets"
        :key="t.key"
        :ticket="t"
        :assignee="t.assigneeId ? usersById.get(t.assigneeId) : undefined"
        @open="emit('open', t.key)"
      />
      <p v-if="tickets.length === 0" class="text-muted-foreground/80 m-auto py-6 text-xs">No tickets</p>
    </div>
  </section>
</template>
