<script setup lang="ts">
import { Check, Copy } from "@lucide/vue";
import { withBase } from "vitepress";
import { ref } from "vue";

const copied = ref(false);

async function copy() {
  const url = new URL(withBase("/get-started.md"), window.location.origin).href;
  await navigator.clipboard.writeText(`Fetch and follow ${url}`);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-12 items-center gap-3 rounded-full border border-input bg-background px-6 text-base font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    @click="copy"
  >
    Onboard your agent
    <Check v-if="copied" class="size-4 text-muted-foreground" />
    <Copy v-else class="size-4 text-muted-foreground" />
  </button>
</template>
