<script setup lang="ts">
import type { Client } from "@sumi/client";
import type { UpdateTicketInput, User } from "@sumi/contract";
import { MAX_LANES } from "@sumi/contract";
import { Check, KeyRound, LogOut, Moon, Sun, Terminal, PencilLine, Plus, RefreshCw, SlidersHorizontal } from "@lucide/vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import BoardColumn from "@/components/BoardColumn.vue";
import ProjectColumns from "@/components/ProjectColumns.vue";
import CheatSheetDialog from "@/components/CheatSheetDialog.vue";
import NewTicketDialog from "@/components/NewTicketDialog.vue";
import TokensDialog from "@/components/TokensDialog.vue";
import TicketDetail from "@/components/TicketDetail.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import ViewMenu from "@/components/ViewMenu.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import AppWordmark from "@/components/AppWordmark.vue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBoard } from "@/composables/useBoard";
import { useViewSettings } from "@/composables/useViewSettings";
import { moveLane } from "@/lib/board";

const props = defineProps<{ client: Client; me: User }>();
const emit = defineEmits<{ signOut: [] }>();

const board = useBoard(props.client);
const combined = computed(() => board.activeBoards.value.length > 1);
const groups = computed(() => board.projects.value.flatMap((p) => {
  const boards = board.activeBoards.value.filter((b) => b.projectKey === p.key);
  return boards.length ? [{ projectKey: p.key, boards, tickets: board.tickets.value.filter((t) => t.projectKey === p.key) }] : [];
}));
const detailBoard = computed(() => board.allBoards.value.find((b) => b.id === board.openTicket.value?.boardId));
const detailBoards = computed(() => board.allBoards.value.filter((b) => b.projectKey === board.openTicket.value?.projectKey));
const view = useViewSettings(board.allBoards, board.tickets);
const creating = ref(false);
const managingTokens = ref(false);
const showingCheatSheet = ref(false);
const saveOpen = async (input: UpdateTicketInput) => (board.openKey.value ? board.update(board.openKey.value, input) : false);

// Edit mode: lanes can be reordered, renamed, added and removed.
const editingLanes = ref(false);
const renamingId = ref<string | null>(null);
// Editing needs every lane in reach, so hidden and empty lanes show again until you are done.
const shownLanes = computed(() => (editingLanes.value ? board.lanes.value : board.currentBoard.value ? view.visible(board.currentBoard.value) : []));
const controlBoards = computed(() => editingLanes.value && board.currentBoard.value ? [board.currentBoard.value] : board.activeBoards.value);
const asEntries = () => board.lanes.value.map((l) => ({ id: l.id, name: l.name }));

function stopEditing() {
  editingLanes.value = false;
  renamingId.value = null;
}

function editBoard(id: string) {
  board.targetBoard(id);
  renamingId.value = null;
  editingLanes.value = true;
}
function createInBoard(id: string) {
  board.targetBoard(id);
  creating.value = true;
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
    <SidebarProvider v-slot="{ closeMobile }" class="h-dvh min-h-0 overflow-hidden">
      <Sidebar collapsible="icon" aria-label="Board controls">
        <SidebarHeader class="px-2 py-3">
          <div class="flex h-8 items-center justify-between gap-2">
            <AppWordmark />
            <SidebarTrigger class="md:hidden" />
          </div>
        </SidebarHeader>
        <SidebarContent class="no-scrollbar">
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton variant="primary" tooltip="New ticket" aria-label="New ticket" :disabled="!board.selectedBoard.value" @click="closeMobile(); creating = true">
                  <Plus aria-hidden="true" /><span>New ticket</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Refresh" aria-label="Refresh" :disabled="board.loading.value" @click="board.load()">
                  <RefreshCw :class="{ 'animate-spin': board.loading.value }" aria-hidden="true" /><span>Refresh</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup v-for="b in controlBoards" :key="b.id" :aria-label="`${b.projectKey} ${b.name} controls`">
            <SidebarGroupLabel class="type-label text-muted-foreground">{{ combined ? `${b.projectKey} ${b.name}` : 'Board' }}</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-if="combined && !editingLanes">
                <SidebarMenuButton :tooltip="`New ticket in ${b.projectKey} ${b.name}`" :aria-label="`New ticket in ${b.projectKey} ${b.name}`" @click="closeMobile(); createInBoard(b.id)">
                  <Plus aria-hidden="true" /><span>New ticket</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton v-if="editingLanes" variant="outline" tooltip="Done editing lanes" aria-label="Done editing lanes" @click="stopEditing(); closeMobile()">
                  <Check aria-hidden="true" /><span>Done editing lanes</span>
                </SidebarMenuButton>
                <SidebarMenuButton v-else :tooltip="`Edit lanes in ${b.projectKey} ${b.name}`" :aria-label="combined ? `Edit lanes in ${b.projectKey} ${b.name}` : 'Edit lanes'" @click="closeMobile(); editBoard(b.id)">
                  <PencilLine aria-hidden="true" /><span>Edit lanes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <ViewMenu
                  :label="combined ? `View options for ${b.projectKey} ${b.name}` : 'View options'"
                  :lanes="b.lanes"
                  :columns="view.columns(b)"
                  :hidden-ids="view.hiddenIds(b)"
                  :hide-empty="view.hideEmpty(b.id)"
                  :active="view.active(b)"
                  @hide-empty="view.setHideEmpty(b.id, $event)"
                  @lane-hidden="(id, hidden) => view.setLaneHidden(b.id, id, hidden)"
                  @reset="view.reset(b.id)"
                >
                  <SidebarMenuButton :tooltip="`View options for ${b.projectKey} ${b.name}`" :aria-label="combined ? `View options for ${b.projectKey} ${b.name}` : 'View options'" :is-active="view.active(b)">
                    <SlidersHorizontal aria-hidden="true" /><span>View options</span>
                  </SidebarMenuButton>
                </ViewMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel class="type-label text-muted-foreground">Workspace</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <ThemeToggle v-slot="{ dark, toggle }">
                  <SidebarMenuButton :tooltip="dark ? 'Switch to light theme' : 'Switch to dark theme'" :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggle">
                    <Sun v-if="dark" aria-hidden="true" /><Moon v-else aria-hidden="true" /><span>{{ dark ? 'Light theme' : 'Dark theme' }}</span>
                  </SidebarMenuButton>
                </ThemeToggle>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="CLI cheat sheet" aria-label="CLI cheat sheet" @click="closeMobile(); showingCheatSheet = true">
                  <Terminal aria-hidden="true" /><span>CLI cheat sheet</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="API tokens" aria-label="API tokens" @click="closeMobile(); managingTokens = true">
                  <KeyRound aria-hidden="true" /><span>API tokens</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter class="gap-2 p-2">
          <div class="type-field flex min-w-0 items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" :title="me.name">
            <UserAvatar :user="me" />
            <span class="text-muted-foreground truncate group-data-[collapsible=icon]:hidden">{{ me.name }}</span>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" aria-label="Sign out" @click="emit('signOut')">
                <LogOut aria-hidden="true" /><span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 px-4 py-3 sm:px-6">
        <SidebarTrigger />
        <nav v-if="board.allBoards.value.length > 0" aria-label="Boards" class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <Button
            v-for="b in board.allBoards.value" :key="b.id" size="sm" variant="ghost"
            class="shrink-0"
            :class="board.selectedIds.value.includes(b.id) ? 'bg-primary/12 text-primary-ink hover:bg-primary/16' : ''"
            role="checkbox"
            :aria-checked="board.selectedIds.value.includes(b.id)"
            @click="stopEditing(); board.toggleBoard(b.id)"
          ><Check v-if="board.selectedIds.value.includes(b.id)" class="size-3.5" aria-hidden="true" /><span class="font-mono text-xs">{{ b.projectKey }}</span> {{ b.name }}</Button>
        </nav>
      </header>

      <main class="flex min-h-0 flex-1 flex-col overflow-x-auto px-4 pt-2 pb-6 sm:px-6">
        <p v-if="board.error.value" role="alert" class="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
          {{ board.error.value }}
        </p>

        <div v-if="board.loading.value && board.tickets.value.length === 0" class="flex gap-3" aria-busy="true">
          <Skeleton v-for="n in 5" :key="n" class="h-64 w-72 shrink-0 sm:w-auto sm:flex-1" />
        </div>

        <div v-else-if="board.projects.value.length === 0 && !board.error.value" class="mx-auto mt-12 max-w-sm text-center">
          <h2 class="type-title">No projects yet</h2>
          <p class="text-muted-foreground mt-2 text-sm">
            Create one with <code class="bg-muted rounded-sm px-2 py-1 font-mono text-xs">pnpm exec sumi project create SUMI "Sumi"</code>.
          </p>
        </div>

        <div v-else-if="board.activeBoards.value.length === 0 && !board.error.value" class="mx-auto mt-12 max-w-sm text-center">
          <h2 class="type-title">No boards selected</h2>
          <p class="text-muted-foreground mt-2 text-sm">Select boards in the header.</p>
        </div>

        <div v-else-if="combined && !editingLanes" class="flex min-h-0 flex-1 gap-8">
          <ProjectColumns v-for="group in groups" :key="group.projectKey" v-bind="group" :users-by-id="board.usersById.value"
            :settings="view.settings.value"
            @open="board.openKey.value = $event" @move="board.move" @error="board.error.value = $event"
            @reset="view.reset" />
        </div>

        <div v-else-if="shownLanes.length === 0 && board.lanes.value.length > 0" class="mx-auto mt-12 max-w-sm text-center">
          <h2 class="type-title">No lanes to show</h2>
          <p class="text-muted-foreground mt-2 text-sm">Every lane is hidden or empty.</p>
          <Button variant="outline" size="sm" class="mt-4" @click="board.selectedBoard.value && view.reset(board.selectedBoard.value)">Show everything</Button>
        </div>

        <div v-else class="flex min-h-0 flex-1 flex-col gap-3">
          <p v-if="editingLanes && combined" class="type-field text-muted-foreground">Editing {{ board.currentBoard.value?.projectKey }} {{ board.currentBoard.value?.name }}</p>
          <div class="flex min-h-0 flex-1 gap-3 sm:min-w-[64rem]">
          <BoardColumn
            v-for="lane in shownLanes"
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
            class="border-input text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-ring active:bg-accent-active mt-8 flex w-24 shrink-0 cursor-pointer items-start justify-center rounded-lg border border-dashed pt-3 text-field font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
            :disabled="board.lanes.value.length >= MAX_LANES"
            aria-label="Add lane"
            @click="addLane"
          >
            <span class="flex items-center gap-1"><Plus class="size-3.5" aria-hidden="true" />Add</span>
          </button>
          </div>
        </div>
      </main>
      </div>

      <TicketDetail
        :ticket="board.openTicket.value"
        :lanes="detailBoard?.lanes ?? []"
        :boards="detailBoards"
        :users="board.users.value"
        :users-by-id="board.usersById.value"
        :activity="board.activity.value"
        :comments="board.comments.value"
        :add-comment="(body) => board.comment(board.openKey.value ?? '', body)"
        :save="saveOpen"
        @close="board.openKey.value = null"
        @move="(status) => board.openKey.value && board.move(board.openKey.value, status)"
        @update="(input) => board.openKey.value && board.update(board.openKey.value, input)"
        @transfer="(id) => board.openKey.value && board.transfer(board.openKey.value, id)"
      />

      <NewTicketDialog :open="creating" :project-key="board.selected.value" :board-name="board.currentBoard.value?.name" :board-id="board.selectedBoard.value" :boards="combined ? board.activeBoards.value : undefined" :lanes="board.lanes.value" :create="board.create" @close="creating = false" />
      <CheatSheetDialog :open="showingCheatSheet" :project-key="board.selected.value" :board-id="board.selectedBoard.value" @close="showingCheatSheet = false" />
      <TokensDialog :open="managingTokens" :client="client" @close="managingTokens = false" @sign-out="emit('signOut')" />
    </SidebarProvider>
  </TooltipProvider>
</template>
