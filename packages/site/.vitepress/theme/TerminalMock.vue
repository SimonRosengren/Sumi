<script setup lang="ts">
defineProps<{ lines: string[] }>();
</script>

<template>
  <pre
    class="overflow-x-auto rounded-xl border border-border bg-card p-6 font-mono text-sm leading-loose text-card-foreground no-scrollbar"
    aria-hidden="true"
  ><code><span v-for="(line, i) in lines" :key="i" class="block" :class="line.startsWith('#') ? 'text-muted-foreground' : ''"><span v-if="!line.startsWith('#') && line" class="text-muted-foreground select-none">$ </span>{{ line }}</span></code></pre>
</template>
