<script setup lang="ts">
import { Origami } from "@lucide/vue";
</script>

<template>
  <!-- Temporary logo: origami icon + SUMI. 8px gap, -7% letter spacing, Geist Black. -->
  <span class="inline-flex items-center gap-2 text-xl leading-none font-black tracking-[-0.07em] uppercase">
    <Origami class="text-primary size-6" :stroke-width="2.5" aria-hidden="true" />
    Sumi
  </span>
</template>
