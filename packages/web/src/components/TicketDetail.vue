<script setup lang="ts">
import type { ActivityEntry, Comment, Lane, Status, Ticket, UpdateTicketInput, User } from "@sumi/contract";
import { PrioritySchema } from "@sumi/contract";
import { ChevronDown, GitBranch, GitPullRequest, Pencil, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { nextTick, ref, watch } from "vue";
import StatusIcon from "@/components/StatusIcon.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeActivity } from "@/lib/board";
import { CHEVRON, FIELD, SECTION_LABEL, TEXTAREA } from "@/lib/fields";

const props = defineProps<{
  ticket: Ticket | null;
  /** The lanes of the ticket's project, in board order. */
  lanes: Lane[];
  users: User[];
  usersById: Map<string, User>;
  activity: ActivityEntry[];
  comments: Comment[];
  /** Posts a comment. Rejects with the server's message when it is refused. */
  addComment: (body: string) => Promise<void>;
  /** Saves title and description. Resolves to false when the server refused. */
  save: (input: UpdateTicketInput) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: []; move: [status: Status]; update: [input: UpdateTicketInput] }>();

const label = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// Title and description are edited as a draft and saved together. Live updates do not touch the draft.
const editing = ref(false);
const saving = ref(false);
const draftTitle = ref("");
const draftDescription = ref("");
const titleInput = ref<InstanceType<typeof Input>>();

watch(() => props.ticket?.key, () => (editing.value = false));

function edit() {
  if (!props.ticket) return;
  draftTitle.value = props.ticket.title;
  draftDescription.value = props.ticket.description;
  editing.value = true;
  void nextTick(() => (titleInput.value?.$el as HTMLInputElement | undefined)?.focus());
}

async function saveEdit() {
  const t = props.ticket;
  const title = draftTitle.value.trim();
  if (!t || !title || saving.value) return;
  const changes: UpdateTicketInput = {};
  if (title !== t.title) changes.title = title;
  if (draftDescription.value !== t.description) changes.description = draftDescription.value;
  if (Object.keys(changes).length === 0) {
    editing.value = false;
    return;
  }
  saving.value = true;
  try {
    if (await props.save(changes)) editing.value = false;
  } finally {
    saving.value = false;
  }
}

// The comment draft is kept per open ticket and cleared only once the server has accepted it.
const draftComment = ref("");
const commenting = ref(false);
const commentError = ref<string | null>(null);

watch(() => props.ticket?.key, () => {
  draftComment.value = "";
  commentError.value = null;
});

async function postComment() {
  const body = draftComment.value.trim();
  if (!body || commenting.value) return;
  commenting.value = true;
  commentError.value = null;
  try {
    await props.addComment(body);
    draftComment.value = "";
  } catch (err) {
    commentError.value = err instanceof Error ? err.message : String(err);
  } finally {
    commenting.value = false;
  }
}

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
          <div class="min-w-0 flex-1">
            <p class="text-muted-foreground font-mono text-xs tracking-tight">{{ ticket.key }}</p>
            <form v-if="editing" id="edit-ticket" class="mt-1" @submit.prevent="saveEdit">
              <label for="edit-title" class="sr-only">Title</label>
              <Input id="edit-title" ref="titleInput" v-model="draftTitle" class="h-9 text-base font-semibold tracking-tight" maxlength="200" required autocomplete="off" />
            </form>
            <DialogTitle
              v-show="!editing"
              class="mt-1 text-lg leading-snug font-semibold tracking-tight text-pretty"
            >{{ ticket.title }}</DialogTitle>
          </div>
          <Button
            v-if="!editing"
            variant="ghost"
            size="icon-sm"
            class="-my-1 shrink-0"
            aria-label="Edit title and description"
            @click="edit"
          >
            <Pencil aria-hidden="true" />
          </Button>
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
              <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.name }}</option>
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

        <section v-if="editing">
          <label for="edit-description" :class="SECTION_LABEL">Description</label>
          <textarea
            id="edit-description"
            v-model="draftDescription"
            form="edit-ticket"
            :class="[TEXTAREA, 'mt-2']"
            rows="8"
            maxlength="20000"
          />
          <div class="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" :disabled="saving" @click="editing = false">Cancel</Button>
            <Button type="submit" form="edit-ticket" size="sm" :disabled="!draftTitle.trim() || saving">Save</Button>
          </div>
        </section>
        <section v-else>
          <h3 :class="SECTION_LABEL">Description</h3>
          <DialogDescription v-if="ticket.description" class="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {{ ticket.description }}
          </DialogDescription>
          <DialogDescription v-else class="text-muted-foreground mt-2 text-sm">No description.</DialogDescription>
        </section>

        <section>
          <h3 :class="SECTION_LABEL">Comments</h3>
          <ol v-if="comments.length > 0" class="mt-3 space-y-4" aria-label="Comments">
            <li v-for="c in comments" :key="c.id" data-testid="comment" class="text-sm">
              <p class="text-[13px]">
                <span class="font-medium">{{ actorName(c.authorId) }}</span>
                <time class="text-muted-foreground/80 ml-2 text-xs" :datetime="c.createdAt.toISOString()">{{ when(c.createdAt) }}</time>
              </p>
              <p class="mt-1 leading-relaxed break-words whitespace-pre-wrap">{{ c.body }}</p>
            </li>
          </ol>
          <p v-else class="text-muted-foreground mt-2 text-sm">No comments yet.</p>
          <form class="mt-3" @submit.prevent="postComment">
            <label for="new-comment" class="sr-only">New comment</label>
            <textarea
              id="new-comment"
              v-model="draftComment"
              :class="TEXTAREA"
              rows="3"
              maxlength="10000"
              placeholder="Write a comment"
              @keydown.meta.enter.prevent="postComment"
              @keydown.ctrl.enter.prevent="postComment"
            />
            <p v-if="commentError" role="alert" class="bg-destructive/10 text-destructive mt-2 rounded-md px-3 py-2 text-sm">{{ commentError }}</p>
            <div class="mt-2 flex justify-end">
              <Button type="submit" size="sm" :disabled="!draftComment.trim() || commenting">Comment</Button>
            </div>
          </form>
        </section>

        <section>
          <h3 :class="SECTION_LABEL">Activity</h3>
          <ol class="mt-3 space-y-3 text-[13px]" aria-label="Activity">
            <li v-for="a in activity" :key="a.id" class="text-muted-foreground">
              <span class="text-foreground font-medium">{{ actorName(a.actorId) }}</span>
              {{ describeActivity(a, lanes) }}
              <time class="text-muted-foreground/80 block text-xs" :datetime="a.createdAt.toISOString()">{{ when(a.createdAt) }}</time>
            </li>
            <li v-if="activity.length === 0" class="text-muted-foreground">No activity yet.</li>
          </ol>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
