<script setup lang="ts">
import type { Status, Ticket, User } from "@sumi/contract";
import { ref } from "vue";
import StatusIcon from "@/components/StatusIcon.vue";
import TicketCard from "@/components/TicketCard.vue";
import { STATUS_LABEL } from "@/lib/board";

const props = defineProps<{ status: Status; tickets: Ticket[]; usersById: Map<string, User> }>();
const emit = defineEmits<{ open: [key: string]; move: [key: string, status: Status] }>();

const over = ref(false);

function leave(e: DragEvent) {
  // Moving over a card inside the column also fires dragleave; only react to really leaving.
  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) over.value = false;
}

function drop(e: DragEvent) {
  over.value = false;
  const key = e.dataTransfer?.getData("text/plain");
  if (key) emit("move", key, props.status);
}
</script>

<template>
  <section class="flex w-72 shrink-0 flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-1" :data-status="status">
    <header class="flex items-center gap-2 px-1 py-1">
      <StatusIcon :status="status" />
      <h2 class="text-sm font-extrabold tracking-tight">{{ STATUS_LABEL[status] }}</h2>
      <span class="text-muted-foreground font-mono text-xs font-bold">{{ tickets.length }}</span>
    </header>
    <div
      class="bg-muted/60 flex min-h-24 flex-1 flex-col gap-2 rounded-xl p-2 transition-colors"
      :class="{ 'bg-accent ring-primary ring-2': over }"
      data-dropzone
      @dragover.prevent="over = true"
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
      <p v-if="tickets.length === 0" class="text-muted-foreground m-auto py-6 text-xs">No tickets</p>
    </div>
  </section>
</template>
