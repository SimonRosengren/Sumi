<script setup lang="ts">
import type { Status, Ticket, User } from "@sumi/contract";
import StatusIcon from "@/components/StatusIcon.vue";
import TicketCard from "@/components/TicketCard.vue";
import { STATUS_LABEL } from "@/lib/board";

defineProps<{ status: Status; tickets: Ticket[]; usersById: Map<string, User> }>();
</script>

<template>
  <section class="flex w-72 shrink-0 flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-1" :data-status="status">
    <header class="flex items-center gap-2 px-1 py-1">
      <StatusIcon :status="status" />
      <h2 class="text-sm font-medium">{{ STATUS_LABEL[status] }}</h2>
      <span class="text-muted-foreground font-mono text-xs">{{ tickets.length }}</span>
    </header>
    <div class="bg-muted/60 flex min-h-24 flex-1 flex-col gap-2 rounded-xl p-2">
      <TicketCard
        v-for="t in tickets"
        :key="t.key"
        :ticket="t"
        :assignee="t.assigneeId ? usersById.get(t.assigneeId) : undefined"
      />
      <p v-if="tickets.length === 0" class="text-muted-foreground m-auto py-6 text-xs">No tickets</p>
    </div>
  </section>
</template>
