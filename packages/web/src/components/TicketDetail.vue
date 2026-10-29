<script setup lang="ts">
import type { ActivityEntry, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
import { PrioritySchema, STATUSES } from "@sumi/contract";
import { GitBranch, GitPullRequest, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import StatusIcon from "@/components/StatusIcon.vue";
import { describeActivity, STATUS_LABEL } from "@/lib/board";

const props = defineProps<{ ticket: Ticket | null; users: User[]; usersById: Map<string, User>; activity: ActivityEntry[] }>();
const emit = defineEmits<{ close: []; move: [status: Status]; update: [input: UpdateTicketInput] }>();

const FIELD =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-3";

const actorName = (id: string) => props.usersById.get(id)?.name ?? "Someone";

const when = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function setPriority(value: string) {
  const parsed = PrioritySchema.safeParse(value);
  emit("update", { priority: parsed.success ? parsed.data : null });
}
</script>

<template>
  <DialogRoot :open="ticket !== null" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="animate-in fade-in-0 fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        v-if="ticket"
        data-testid="ticket-detail"
        class="bg-background animate-in fade-in-0 zoom-in-95 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-lg border p-6 shadow-xl outline-none"
      >
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-muted-foreground font-mono text-xs">{{ ticket.key }}</p>
            <DialogTitle class="mt-1 text-xl leading-tight font-black tracking-tight text-pretty">{{ ticket.title }}</DialogTitle>
          </div>
          <DialogClose
            class="text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 -m-1 rounded-md p-1 outline-none focus-visible:ring-3"
            aria-label="Close"
          >
            <X class="size-5" aria-hidden="true" />
          </DialogClose>
        </header>

        <dl class="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt class="text-muted-foreground"><label for="detail-status">Status</label></dt>
          <dd class="flex items-center gap-2">
            <StatusIcon :status="ticket.status" />
            <select
              id="detail-status"
              :class="FIELD"
              :value="ticket.status"
              @change="emit('move', ($event.target as HTMLSelectElement).value as Status)"
            >
              <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
            </select>
          </dd>

          <dt class="text-muted-foreground"><label for="detail-assignee">Assignee</label></dt>
          <dd>
            <select
              id="detail-assignee"
              :class="FIELD"
              :value="ticket.assigneeId ?? ''"
              @change="emit('update', { assigneeId: ($event.target as HTMLSelectElement).value || null })"
            >
              <option value="">Unassigned</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}{{ u.kind === "agent" ? " (agent)" : "" }}</option>
            </select>
          </dd>

          <dt class="text-muted-foreground"><label for="detail-priority">Priority</label></dt>
          <dd>
            <select
              id="detail-priority"
              :class="FIELD"
              :value="ticket.priority ?? ''"
              @change="setPriority(($event.target as HTMLSelectElement).value)"
            >
              <option value="">None</option>
              <option v-for="p in PrioritySchema.options" :key="p" :value="p" class="capitalize">{{ p }}</option>
            </select>
          </dd>

          <template v-if="ticket.links.repo || ticket.links.pr || ticket.links.branch">
            <dt class="text-muted-foreground">Links</dt>
            <dd class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span v-if="ticket.links.repo" class="font-mono">{{ ticket.links.repo }}</span>
              <span v-if="ticket.links.pr" class="inline-flex items-center gap-1">
                <GitPullRequest class="size-3.5" aria-hidden="true" />#{{ ticket.links.pr }}
              </span>
              <span v-if="ticket.links.branch" class="inline-flex min-w-0 items-center gap-1">
                <GitBranch class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="font-mono break-all">{{ ticket.links.branch }}</span>
              </span>
            </dd>
          </template>
        </dl>

        <section>
          <h3 class="text-sm font-extrabold tracking-tight">Description</h3>
          <DialogDescription v-if="ticket.description" class="mt-1.5 text-sm break-words whitespace-pre-wrap">
            {{ ticket.description }}
          </DialogDescription>
          <DialogDescription v-else class="text-muted-foreground mt-1.5 text-sm">No description.</DialogDescription>
        </section>

        <section>
          <h3 class="text-sm font-extrabold tracking-tight">Activity</h3>
          <ol class="mt-2 space-y-2 text-sm" aria-label="Activity">
            <li v-for="a in activity" :key="a.id">
              <span class="font-bold">{{ actorName(a.actorId) }}</span>
              {{ describeActivity(a) }}
              <time class="text-muted-foreground block text-xs" :datetime="a.createdAt.toISOString()">{{ when(a.createdAt) }}</time>
            </li>
            <li v-if="activity.length === 0" class="text-muted-foreground">No activity yet.</li>
          </ol>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
