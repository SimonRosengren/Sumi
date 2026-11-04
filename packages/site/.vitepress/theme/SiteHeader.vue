<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";
import { useData, withBase } from "vitepress";
import { onMounted, onUnmounted, ref } from "vue";
import { repo } from "./links";

const { isDark } = useData();
const scrolled = ref(false);
const onScroll = () => (scrolled.value = window.scrollY > 8);

onMounted(() => {
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});
onUnmounted(() => window.removeEventListener("scroll", onScroll));

const nav = [
  { text: "Docs", href: withBase("/docs") },
  { text: "Guides", href: withBase("/guides/install") },
  { text: "Roadmap", href: withBase("/roadmap") },
  { text: "GitHub", href: repo },
];
</script>

<template>
  <header
    class="sticky top-0 z-50 h-16 border-b transition-colors"
    :class="scrolled ? 'border-border bg-background' : 'border-transparent bg-transparent'"
  >
    <div class="mx-auto flex h-full max-w-page items-center gap-6 px-6">
      <a :href="withBase('/')" class="flex items-center gap-2 text-foreground no-underline">
        <span class="sumi-logo h-6 w-8 shrink-0 bg-primary" aria-hidden="true" />
        <span class="text-xl font-black tracking-wordmark uppercase">Sumi</span>
      </a>
      <nav class="hidden items-center gap-1 md:flex">
        <a
          v-for="item in nav"
          :key="item.text"
          :href="item.href"
          class="rounded-md px-3 py-2 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          {{ item.text }}
        </a>
      </nav>
      <div class="ml-auto flex items-center gap-3">
        <button
          type="button"
          aria-label="Toggle theme"
          class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          @click="isDark = !isDark"
        >
          <Sun v-if="isDark" class="size-4" />
          <Moon v-else class="size-4" />
        </button>
        <a
          :href="withBase('/guides/install')"
          class="inline-flex h-8 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-primary-hover active:bg-primary-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Get started
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.sumi-logo {
  mask: url("../../../../assets/brand/logo.svg") center / contain no-repeat;
}
</style>
