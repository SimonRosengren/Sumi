<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import LandingPage from "./LandingPage.vue";
import { Analytics } from "@vercel/analytics/next"

const { frontmatter } = useData();
</script>

<template>
  <LandingPage v-if="frontmatter.layout === 'landing'" />
  <DefaultTheme.Layout v-else />
  <Analytics/>
</template>
