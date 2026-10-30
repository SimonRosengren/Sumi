<script setup lang="ts">
import { Origami } from "@lucide/vue";
</script>

<template>
  <!-- Temporary logo: origami icon + SUMI, in the text color (the accent is not decorative). -->
  <span class="inline-flex items-center gap-2 text-xl leading-none font-black tracking-wordmark uppercase">
    <Origami class="size-6" :stroke-width="2.5" aria-hidden="true" />
    Sumi
  </span>
</template>
