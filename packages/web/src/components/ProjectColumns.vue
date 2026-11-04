<script setup lang="ts">
import type { Board, Ticket, User } from "@sumi/contract";
import { computed } from "vue";
import BoardColumn from "@/components/BoardColumn.vue";
import { Button } from "@/components/ui/button";
import { groupByStatus, mergeColumns, type MergedColumn } from "@/lib/board";
import { visibleLanes, type ViewSettings } from "@/lib/view";

const props = defineProps<{ projectKey: string; boards: Board[]; tickets: Ticket[]; usersById: Map<string, User>; settings: Record<string, ViewSettings> }>();
const emit = defineEmits<{ open: [key: string]; move: [key: string, status: string]; error: [message: string]; reset: [boardId: string] }>();
const boardNames = computed(() => new Map(props.boards.map((b) => [b.id, b.name])));
const columnsByBoard = computed(() => Object.fromEntries(props.boards.map((b) => [b.id, groupByStatus(props.tickets.filter((t) => t.boardId === b.id), b.lanes)])));
const columns = computed(() => mergeColumns(props.boards.map((b) => ({
  ...b, lanes: visibleLanes(b.lanes, columnsByBoard.value[b.id] ?? {}, props.settings[b.id]?.hidden[b.id] ?? [], props.settings[b.id]?.hideEmpty ?? false),
})), props.tickets));

function drop(key: string, column: MergedColumn) {
  const ticket = props.tickets.find((t) => t.key === key);
  const source = column.sources.find((s) => s.boardId === ticket?.boardId && s.laneId === ticket?.status)
    ?? column.sources.find((s) => s.boardId === ticket?.boardId);
  if (!source) {
    emit("error", "That column is not available on this ticket's board");
    return;
  }
  emit("move", key, source.laneId);
}
</script>

<template>
  <section :data-project="projectKey" :aria-label="`${projectKey} boards`" class="flex min-h-0 min-w-max flex-1 flex-col gap-3 sm:min-w-[64rem]">
    <div v-if="columns.length" class="flex min-h-0 flex-1 gap-3">
      <BoardColumn v-for="column in columns" :key="column.key" :data-column="column.key" :lane="column.lane" :tickets="column.tickets"
        :users-by-id="usersById" :board-names="boardNames" :editing="false" :renaming="false"
        @open="emit('open', $event)" @move="(key) => drop(key, column)" />
    </div>
    <div v-else class="mx-auto mt-12 text-center">
      <h3 class="type-title">No lanes to show</h3>
      <Button variant="outline" size="sm" class="mt-4" @click="boards.forEach((b) => emit('reset', b.id))">Show everything</Button>
    </div>
  </section>
</template>
