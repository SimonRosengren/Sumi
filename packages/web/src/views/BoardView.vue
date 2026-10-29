<script setup lang="ts">
import type { Client } from "@sumi/client";
import type { User } from "@sumi/contract";
import { STATUSES } from "@sumi/contract";
import { LogOut, RefreshCw } from "@lucide/vue";
import { onMounted, onUnmounted } from "vue";
import BoardColumn from "@/components/BoardColumn.vue";
import TicketDetail from "@/components/TicketDetail.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import AppWordmark from "@/components/AppWordmark.vue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBoard } from "@/composables/useBoard";

const props = defineProps<{ client: Client; me: User }>();
defineEmits<{ signOut: [] }>();

const board = useBoard(props.client);
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
          <Skeleton v-for="s in STATUSES" :key="s" class="h-64 w-72 shrink-0 sm:w-auto sm:flex-1" />
        </div>

        <div v-else-if="board.projects.value.length === 0 && !board.error.value" class="mx-auto mt-24 max-w-sm text-center">
          <h2 class="text-lg font-semibold tracking-tight">No projects yet</h2>
          <p class="text-muted-foreground mt-1.5 text-sm">
            Create one with <code class="bg-muted rounded-sm px-1.5 py-0.5 font-mono text-xs">pnpm exec sumi project create SUMI "Sumi"</code>.
          </p>
        </div>

        <div v-else class="flex flex-1 gap-3 sm:min-w-[64rem]">
          <BoardColumn
            v-for="s in STATUSES"
            :key="s"
            :status="s"
            :tickets="board.columns.value[s]"
            :users-by-id="board.usersById.value"
            @open="board.openKey.value = $event"
            @move="board.move"
          />
        </div>
      </main>

      <TicketDetail
        :ticket="board.openTicket.value"
        :users="board.users.value"
        :users-by-id="board.usersById.value"
        :activity="board.activity.value"
        @close="board.openKey.value = null"
        @move="(status) => board.openKey.value && board.move(board.openKey.value, status)"
        @update="(input) => board.openKey.value && board.update(board.openKey.value, input)"
      />
    </div>
  </TooltipProvider>
</template>
