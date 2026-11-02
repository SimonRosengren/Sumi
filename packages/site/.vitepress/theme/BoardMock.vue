<script setup lang="ts">
import { Bot, Circle, CircleCheck, CircleDashed, CircleDot } from "@lucide/vue";

type Card = { key: string; title: string; who: "AL" | "agent" | "MK" };

const lanes: { name: string; icon: typeof Circle; tone: string; cards: Card[] }[] = [
  {
    name: "Todo",
    icon: Circle,
    tone: "text-status-todo",
    cards: [
      { key: "SUMI-21", title: "Fix login redirect loop", who: "agent" },
      { key: "SUMI-22", title: "Export tickets as CSV", who: "AL" },
    ],
  },
  {
    name: "In progress",
    icon: CircleDashed,
    tone: "text-status-in-progress",
    cards: [
      { key: "SUMI-17", title: "Create a public website", who: "agent" },
      { key: "SUMI-19", title: "Lane colors on the board", who: "MK" },
    ],
  },
  {
    name: "In review",
    icon: CircleDot,
    tone: "text-status-in-review",
    cards: [{ key: "SUMI-18", title: "Token management dialog", who: "agent" }],
  },
  {
    name: "Done",
    icon: CircleCheck,
    tone: "text-status-done",
    cards: [
      { key: "SUMI-16", title: "Delete a project", who: "AL" },
      { key: "SUMI-15", title: "Comments on tickets", who: "agent" },
    ],
  },
];
</script>

<template>
  <div class="grid grid-cols-4 gap-3 rounded-xl border border-border bg-muted p-3" aria-hidden="true">
    <div v-for="lane in lanes" :key="lane.name" class="flex min-w-40 flex-col gap-2 rounded-lg bg-background p-2">
      <div class="flex items-center gap-2 px-1 py-1">
        <component :is="lane.icon" class="size-4" :class="lane.tone" />
        <span class="type-column">{{ lane.name }}</span>
        <span class="ml-auto font-mono text-xs text-muted-foreground">{{ lane.cards.length }}</span>
      </div>
      <div
        v-for="card in lane.cards"
        :key="card.key"
        class="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
      >
        <span class="type-key text-muted-foreground">{{ card.key }}</span>
        <span class="type-card-title">{{ card.title }}</span>
        <span
          v-if="card.who === 'agent'"
          class="flex size-5 items-center justify-center rounded-sm bg-muted text-muted-foreground"
        >
          <Bot class="size-3" />
        </span>
        <span
          v-else
          class="type-initials flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {{ card.who }}
        </span>
      </div>
    </div>
  </div>
</template>
