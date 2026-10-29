<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { isDark, setDark } from "@/lib/theme";

const dark = ref(isDark());
function toggle() {
  dark.value = !dark.value;
  setDark(dark.value);
}
</script>

<template>
  <Button variant="ghost" size="icon" :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggle">
    <Sun v-if="dark" aria-hidden="true" />
    <Moon v-else aria-hidden="true" />
  </Button>
</template>
