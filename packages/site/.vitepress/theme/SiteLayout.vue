<script setup lang="ts">
import { inject } from "@vercel/analytics";
import { onMounted } from "vue";
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import LandingPage from "./LandingPage.vue";

const { frontmatter } = useData();

onMounted(() => {
  inject();
});
</script>

<template>
  <LandingPage v-if="frontmatter.layout === 'landing'" />
  <DefaultTheme.Layout v-else />
</template>
