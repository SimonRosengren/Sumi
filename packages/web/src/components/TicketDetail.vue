<script setup lang="ts">
import type { ActivityEntry, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
import { PrioritySchema, STATUSES } from "@sumi/contract";
import { ChevronDown, GitBranch, GitPullRequest, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import StatusIcon from "@/components/StatusIcon.vue";
import { describeActivity, STATUS_LABEL } from "@/lib/board";

const props = defineProps<{ ticket: Ticket | null; users: User[]; usersById: Map<string, User>; activity: ActivityEntry[] }>();
const emit = defineEmits<{ close: []; move: [status: Status]; update: [input: UpdateTicketInput] }>();

// Same look as `Input`: neutral border, accent only on focus.
const FIELD =
  "border-input bg-card hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/30 h-8 w-full appearance-none rounded-md border pr-7 pl-2 text-[13px] transition-colors outline-none focus-visible:ring-2";
const CHEVRON = "text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2";
const label = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const SECTION_LABEL = "text-muted-foreground text-xs font-medium tracking-[0.06em] uppercase";

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
      <DialogOverlay class="animate-in fade-in-0 fixed inset-0 z-40 bg-black/30 dark:bg-black/50" />
      <DialogContent
        v-if="ticket"
        data-testid="ticket-detail"
        class="bg-card animate-in fade-in-0 zoom-in-95 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-xl border p-6 shadow-lg shadow-black/10 outline-none"
      >
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-muted-foreground font-mono text-xs tracking-tight">{{ ticket.key }}</p>
            <DialogTitle class="mt-1 text-lg leading-snug font-semibold tracking-tight text-pretty">{{ ticket.title }}</DialogTitle>
          </div>
          <DialogClose
            class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 -m-1.5 shrink-0 rounded-md p-1.5 transition-colors outline-none focus-visible:ring-2"
            aria-label="Close"
          >
            <X class="size-4" aria-hidden="true" />
          </DialogClose>
        </header>

        <dl class="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
          <dt class="text-muted-foreground"><label for="detail-status">Status</label></dt>
          <dd class="relative">
            <StatusIcon :status="ticket.status" class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2" />
            <select
              id="detail-status"
              :class="[FIELD, 'pl-8']"
              :value="ticket.status"
              @change="emit('move', ($event.target as HTMLSelectElement).value as Status)"
            >
              <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
            </select>
            <ChevronDown :class="CHEVRON" aria-hidden="true" />
          </dd>

          <dt class="text-muted-foreground"><label for="detail-assignee">Assignee</label></dt>
          <dd class="relative">
            <select
              id="detail-assignee"
              :class="FIELD"
              :value="ticket.assigneeId ?? ''"
              @change="emit('update', { assigneeId: ($event.target as HTMLSelectElement).value || null })"
            >
              <option value="">Unassigned</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}{{ u.kind === "agent" ? " (agent)" : "" }}</option>
            </select>
            <ChevronDown :class="CHEVRON" aria-hidden="true" />
          </dd>

          <dt class="text-muted-foreground"><label for="detail-priority">Priority</label></dt>
          <dd class="relative">
            <select
              id="detail-priority"
              :class="FIELD"
              :value="ticket.priority ?? ''"
              @change="setPriority(($event.target as HTMLSelectElement).value)"
            >
              <option value="">None</option>
              <option v-for="p in PrioritySchema.options" :key="p" :value="p">{{ label(p) }}</option>
            </select>
            <ChevronDown :class="CHEVRON" aria-hidden="true" />
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
          <h3 :class="SECTION_LABEL">Description</h3>
          <DialogDescription v-if="ticket.description" class="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {{ ticket.description }}
          </DialogDescription>
          <DialogDescription v-else class="text-muted-foreground mt-2 text-sm">No description.</DialogDescription>
        </section>

        <section>
          <h3 :class="SECTION_LABEL">Activity</h3>
          <ol class="mt-3 space-y-3 text-[13px]" aria-label="Activity">
            <li v-for="a in activity" :key="a.id" class="text-muted-foreground">
              <span class="text-foreground font-medium">{{ actorName(a.actorId) }}</span>
              {{ describeActivity(a) }}
              <time class="text-muted-foreground/80 block text-xs" :datetime="a.createdAt.toISOString()">{{ when(a.createdAt) }}</time>
            </li>
            <li v-if="activity.length === 0" class="text-muted-foreground">No activity yet.</li>
          </ol>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
