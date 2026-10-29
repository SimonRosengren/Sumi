<script setup lang="ts">
import type { Status } from "@sumi/contract";

// Linear-style progress icons: the more work is done, the more the circle fills.
defineProps<{ status: Status }>();

const COLOR: Record<Status, string> = {
  backlog: "text-status-backlog",
  todo: "text-status-todo",
  in_progress: "text-status-in-progress",
  in_review: "text-status-in-review",
  done: "text-status-done",
};
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" :class="['size-4 shrink-0', COLOR[status]]">
    <template v-if="status === 'done'">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M5 8.2 7.1 10.3 11 6" stroke="var(--background)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else>
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        stroke-width="1.5"
        :stroke-dasharray="status === 'backlog' ? '2.2 2.2' : undefined"
      />
      <path v-if="status === 'in_progress'" d="M8 8V4A4 4 0 0 1 8 12Z" fill="currentColor" />
      <path v-else-if="status === 'in_review'" d="M8 8V4A4 4 0 1 1 4 8Z" fill="currentColor" />
    </template>
  </svg>
</template>
