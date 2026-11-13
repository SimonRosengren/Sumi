<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Clock } from "@lucide/vue";
import { laneAge } from "@/lib/lane-age";

defineProps<{ since: Date; lane: string }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 60_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <time class="inline-flex items-center gap-1" :datetime="since.toISOString()" :title="since.toLocaleString()">
    <Clock class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    {{ laneAge(since, now) }} in {{ lane }}
  </time>
</template>
