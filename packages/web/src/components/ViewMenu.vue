<script setup lang="ts">
import type { Lane, Ticket } from "@sumi/contract";
import { Check, SlidersHorizontal } from "@lucide/vue";
import { CheckboxIndicator, CheckboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { Button } from "@/components/ui/button";

defineProps<{
  lanes: Lane[];
  columns: Record<string, Ticket[]>;
  hiddenIds: string[];
  hideEmpty: boolean;
  /** A setting is hiding something. */
  active: boolean;
}>();
defineEmits<{
  hideEmpty: [value: boolean];
  laneHidden: [id: string, hidden: boolean];
  reset: [];
}>();

// One row is one checkbox: the whole line toggles it, and screen readers read the text as its name.
const row =
  "group hover:bg-accent active:bg-accent/70 focus-visible:ring-ring/40 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-field outline-none focus-visible:ring-2";
const box =
  "border-input bg-card group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-sm border";
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        aria-label="View options"
        :class="active ? 'bg-primary/12 text-foreground hover:bg-primary/16' : ''"
        :title="active ? 'View options (some lanes are hidden)' : 'View options'"
      >
        <SlidersHorizontal aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        aria-label="View options"
        class="bg-popover text-popover-foreground border-border animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 w-64 rounded-lg border p-1 outline-none"
      >
        <CheckboxRoot :model-value="hideEmpty" :class="row" @update:model-value="$emit('hideEmpty', $event === true)">
          <span :class="box"><CheckboxIndicator><Check class="size-3" stroke-width="3" aria-hidden="true" /></CheckboxIndicator></span>
          Hide empty lanes
        </CheckboxRoot>

        <div class="bg-border -mx-1 my-1 h-px" role="separator" />

        <p class="type-label text-muted-foreground px-2 pt-1 pb-2">Show lanes</p>
        <p v-if="lanes.length === 0" class="type-field text-muted-foreground px-2 pb-2">This project has no lanes.</p>
        <CheckboxRoot
          v-for="lane in lanes"
          :key="lane.id"
          :model-value="!hiddenIds.includes(lane.id)"
          :class="row"
          :data-lane="lane.id"
          @update:model-value="$emit('laneHidden', lane.id, $event !== true)"
        >
          <span :class="box"><CheckboxIndicator><Check class="size-3" stroke-width="3" aria-hidden="true" /></CheckboxIndicator></span>
          <span class="min-w-0 flex-1 truncate">{{ lane.name }}</span>
          <span class="text-muted-foreground font-mono text-xs">{{ columns[lane.id]?.length ?? 0 }}</span>
        </CheckboxRoot>

        <template v-if="active">
          <div class="bg-border -mx-1 my-1 h-px" role="separator" />
          <Button variant="ghost" size="sm" class="w-full justify-start" @click="$emit('reset')">Show everything</Button>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
