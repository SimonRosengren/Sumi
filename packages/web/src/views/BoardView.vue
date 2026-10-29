<script setup lang="ts">
import type { Client } from "@sumi/client";
import type { UpdateTicketInput, User } from "@sumi/contract";
import { MAX_LANES } from "@sumi/contract";
import { Check, LogOut, PencilLine, Plus, RefreshCw } from "@lucide/vue";
import { onMounted, onUnmounted, ref } from "vue";
import BoardColumn from "@/components/BoardColumn.vue";
import NewTicketDialog from "@/components/NewTicketDialog.vue";
import TicketDetail from "@/components/TicketDetail.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import AppWordmark from "@/components/AppWordmark.vue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBoard } from "@/composables/useBoard";
import { moveLane } from "@/lib/board";

const props = defineProps<{ client: Client; me: User }>();
defineEmits<{ signOut: [] }>();

const board = useBoard(props.client);
const creating = ref(false);
const saveOpen = async (input: UpdateTicketInput) => (board.openKey.value ? board.update(board.openKey.value, input) : false);

// Edit mode: lanes can be reordered, renamed, added and removed.
const editingLanes = ref(false);
const renamingId = ref<string | null>(null);
const asEntries = () => board.lanes.value.map((l) => ({ id: l.id, name: l.name }));

function stopEditing() {
  editingLanes.value = false;
  renamingId.value = null;
}

async function renameLane(id: string, name: string) {
  renamingId.value = null;
  if (board.lanes.value.find((l) => l.id === id)?.name === name) return;
  await board.setLanes(asEntries().map((l) => (l.id === id ? { ...l, name } : l)));
}

async function dropLane(id: string, target: string) {
  const next = moveLane(board.lanes.value, id, target);
  if (next !== board.lanes.value) await board.setLanes(next.map((l) => ({ id: l.id, name: l.name })));
}

async function removeLane(id: string) {
  await board.setLanes(asEntries().filter((l) => l.id !== id));
}

/** Adds a lane at the right end and puts the cursor in its name. */
async function addLane() {
  const known = new Set(board.lanes.value.map((l) => l.id));
  const saved = await board.setLanes([...asEntries(), { name: "New lane" }]);
  renamingId.value = saved?.find((l) => !known.has(l.id))?.id ?? null;
}

let stopWatching = () => {};
onMounted(async () => {
  await board.load();
  stopWatching = board.watch();
});
onUnmounted(() => stopWatching());
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <div class="flex min-h-screen flex-col">
      <header class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <AppWordmark />
        <nav
          v-if="board.projects.value.length > 0"
          aria-label="Projects"
          class="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <!-- The active project is the one place the accent shows in navigation: a tint, not a fill. -->
          <Button
            v-for="p in board.projects.value"
            :key="p.key"
            size="sm"
            variant="ghost"
            :class="p.key === board.selected.value ? 'bg-primary/12 text-foreground hover:bg-primary/16' : ''"
            :aria-current="p.key === board.selected.value ? 'page' : undefined"
            :title="p.name"
            @click="board.select(p.key)"
          >
            <span class="font-mono text-xs" :class="p.key === board.selected.value ? 'text-primary-ink' : ''">{{ p.key }}</span>
            <span class="hidden sm:inline">{{ p.name }}</span>
          </Button>
        </nav>
        <div class="ml-auto flex items-center gap-0.5">
          <Button size="sm" class="mr-2" aria-label="New ticket" :disabled="!board.selected.value" @click="creating = true">
            <Plus aria-hidden="true" />
            <span class="hidden sm:inline">New ticket</span>
          </Button>
          <Button
            v-if="!editingLanes"
            variant="ghost"
            size="sm"
            aria-label="Edit lanes"
            :disabled="!board.selected.value"
            @click="editingLanes = true"
          >
            <PencilLine aria-hidden="true" />
            <span class="hidden sm:inline">Edit lanes</span>
          </Button>
          <Button v-else variant="outline" size="sm" aria-label="Done editing lanes" @click="stopEditing">
            <Check aria-hidden="true" />
            <span class="hidden sm:inline">Done</span>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh" :disabled="board.loading.value" @click="board.load()">
            <RefreshCw :class="{ 'animate-spin': board.loading.value }" aria-hidden="true" />
          </Button>
          <ThemeToggle />
          <div class="mx-2 flex items-center gap-2 text-[13px]">
            <UserAvatar :user="me" />
            <span class="text-muted-foreground hidden sm:inline">{{ me.name }}</span>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out" @click="$emit('signOut')">
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main class="flex flex-1 flex-col overflow-x-auto px-5 pt-2 pb-5">
        <p v-if="board.error.value" role="alert" class="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
          {{ board.error.value }}
        </p>

        <div v-if="board.loading.value && board.tickets.value.length === 0" class="flex gap-3" aria-busy="true">
          <Skeleton v-for="n in 5" :key="n" class="h-64 w-72 shrink-0 sm:w-auto sm:flex-1" />
        </div>

        <div v-else-if="board.projects.value.length === 0 && !board.error.value" class="mx-auto mt-24 max-w-sm text-center">
          <h2 class="text-lg font-semibold tracking-tight">No projects yet</h2>
          <p class="text-muted-foreground mt-1.5 text-sm">
            Create one with <code class="bg-muted rounded-sm px-1.5 py-0.5 font-mono text-xs">pnpm exec sumi project create SUMI "Sumi"</code>.
          </p>
        </div>

        <div v-else class="flex flex-1 gap-3 sm:min-w-[64rem]">
          <BoardColumn
            v-for="lane in board.lanes.value"
            :key="lane.id"
            :lane="lane"
            :tickets="board.columns.value[lane.id] ?? []"
            :users-by-id="board.usersById.value"
            :editing="editingLanes"
            :renaming="renamingId === lane.id"
            @open="board.openKey.value = $event"
            @move="board.move"
            @drop-lane="dropLane($event, lane.id)"
            @start-rename="renamingId = lane.id"
            @rename="renameLane(lane.id, $event)"
            @cancel-rename="renamingId = null"
            @remove="removeLane(lane.id)"
          />
          <button
            v-if="editingLanes"
            type="button"
            class="border-input text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/30 mt-8 flex w-24 shrink-0 cursor-pointer items-start justify-center rounded-lg border border-dashed pt-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
            :disabled="board.lanes.value.length >= MAX_LANES"
            aria-label="Add lane"
            @click="addLane"
          >
            <span class="flex items-center gap-1"><Plus class="size-3.5" aria-hidden="true" />Add</span>
          </button>
        </div>
      </main>

      <TicketDetail
        :ticket="board.openTicket.value"
        :lanes="board.lanes.value"
        :users="board.users.value"
        :users-by-id="board.usersById.value"
        :activity="board.activity.value"
        :comments="board.comments.value"
        :add-comment="(body) => board.comment(board.openKey.value ?? '', body)"
        :save="saveOpen"
        @close="board.openKey.value = null"
        @move="(status) => board.openKey.value && board.move(board.openKey.value, status)"
        @update="(input) => board.openKey.value && board.update(board.openKey.value, input)"
      />

      <NewTicketDialog :open="creating" :project-key="board.selected.value" :lanes="board.lanes.value" :create="board.create" @close="creating = false" />
    </div>
  </TooltipProvider>
</template>
