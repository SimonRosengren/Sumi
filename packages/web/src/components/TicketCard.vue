<script setup lang="ts">
import type { Ticket, User } from "@sumi/contract";
import { GitBranch, GitPullRequest } from "@lucide/vue";
import PriorityIcon from "@/components/PriorityIcon.vue";
import UserAvatar from "@/components/UserAvatar.vue";

defineProps<{ ticket: Ticket; assignee?: User | undefined }>();
defineEmits<{ open: [] }>();

function dragStart(e: DragEvent, key: string) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData("text/plain", key);
  e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <article
    class="bg-card hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/30 cursor-pointer rounded-md border p-3 transition-colors outline-none focus-visible:ring-2 active:cursor-grabbing"
    :data-key="ticket.key"
    tabindex="0"
    draggable="true"
    @click="$emit('open')"
    @keydown.enter.self="$emit('open')"
    @dragstart="dragStart($event, ticket.key)"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-muted-foreground font-mono text-[11px] tracking-tight">{{ ticket.key }}</span>
      <UserAvatar v-if="assignee" :user="assignee" />
    </div>
    <h3 class="mt-1 text-[13px] leading-snug font-medium text-pretty">{{ ticket.title }}</h3>
    <div
      v-if="ticket.priority || ticket.links.pr || ticket.links.branch"
      class="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
    >
      <span v-if="ticket.priority" class="inline-flex items-center gap-1 capitalize">
        <PriorityIcon :priority="ticket.priority" />{{ ticket.priority }}
      </span>
      <span v-if="ticket.links.pr" class="inline-flex items-center gap-1">
        <GitPullRequest class="size-3.5" aria-hidden="true" />#{{ ticket.links.pr }}
      </span>
      <span v-if="ticket.links.branch" class="inline-flex min-w-0 items-center gap-1">
        <GitBranch class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate font-mono text-[11px]">{{ ticket.links.branch }}</span>
      </span>
    </div>
  </article>
</template>
