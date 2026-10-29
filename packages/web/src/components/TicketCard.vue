<script setup lang="ts">
import type { Ticket, User } from "@sumi/contract";
import { GitBranch, GitPullRequest } from "@lucide/vue";
import UserAvatar from "@/components/UserAvatar.vue";

defineProps<{ ticket: Ticket; assignee?: User | undefined }>();

const PRIORITY_CLASS = {
  high: "bg-primary/20 text-foreground",
  medium: "bg-muted text-foreground",
  low: "bg-muted text-muted-foreground",
} as const;
</script>

<template>
  <article
    class="bg-card group rounded-lg border p-3 shadow-xs transition-colors hover:border-ring"
    :data-key="ticket.key"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-muted-foreground font-mono text-xs">{{ ticket.key }}</span>
      <UserAvatar v-if="assignee" :user="assignee" />
    </div>
    <h3 class="mt-1.5 text-sm leading-snug font-medium text-pretty">{{ ticket.title }}</h3>
    <div
      v-if="ticket.priority || ticket.links.pr || ticket.links.branch"
      class="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
    >
      <span
        v-if="ticket.priority"
        :class="PRIORITY_CLASS[ticket.priority]"
        class="rounded-sm px-1.5 py-0.5 font-medium capitalize"
      >
        {{ ticket.priority }}
      </span>
      <span v-if="ticket.links.pr" class="inline-flex items-center gap-1">
        <GitPullRequest class="size-3.5" aria-hidden="true" />#{{ ticket.links.pr }}
      </span>
      <span v-if="ticket.links.branch" class="inline-flex min-w-0 items-center gap-1">
        <GitBranch class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate font-mono">{{ ticket.links.branch }}</span>
      </span>
    </div>
  </article>
</template>
