<script setup lang="ts">
import type { Priority } from "@sumi/contract";

// Three bars of rising height, filled up to the priority. Only high is not neutral-ish in meaning.
const props = defineProps<{ priority: Priority }>();

const FILLED = { low: 1, medium: 2, high: 3 } as const;
const COLOR = { low: "text-priority-low", medium: "text-priority-medium", high: "text-priority-high" } as const;
const BARS = [
  { x: 2, y: 9, h: 5 },
  { x: 6.5, y: 6, h: 8 },
  { x: 11, y: 3, h: 11 },
];
</script>

<template>
  <svg viewBox="0 0 16 16" aria-hidden="true" :class="['size-3.5 shrink-0', COLOR[props.priority]]">
    <rect
      v-for="(b, i) in BARS"
      :key="i"
      :x="b.x"
      :y="b.y"
      width="3"
      :height="b.h"
      rx="0.75"
      fill="currentColor"
      :opacity="i < FILLED[props.priority] ? 1 : 0.25"
    />
  </svg>
</template>
