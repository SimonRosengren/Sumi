<script setup lang="ts">
import { withBase } from "vitepress";
import { repo } from "./links";

const columns = [
  {
    title: "Docs",
    links: [
      { text: "Overview", href: withBase("/docs") },
      { text: "Architecture", href: withBase("/architecture") },
      { text: "Domain", href: withBase("/domain") },
      { text: "Design", href: withBase("/design") },
      { text: "Roadmap", href: withBase("/roadmap") },
    ],
  },
  {
    title: "Guides",
    links: [
      { text: "Install", href: withBase("/guides/install") },
      { text: "Testing", href: withBase("/guides/testing") },
      { text: "Add an operation", href: withBase("/guides/adding-an-operation") },
    ],
  },
  {
    title: "Project",
    links: [
      { text: "GitHub", href: repo },
      { text: "Issues", href: `${repo}/issues` },
      { text: "Decisions", href: withBase("/adr/0001-record-architecture-decisions") },
      { text: "MIT license", href: `${repo}/blob/main/LICENSE` },
    ],
  },
];
</script>

<template>
  <footer class="mx-auto max-w-page px-6 py-12 text-sm">
    <nav class="grid grid-cols-2 gap-6 md:grid-cols-4">
      <div v-for="col in columns" :key="col.title">
        <h2 class="my-3 text-sm font-medium text-foreground">{{ col.title }}</h2>
        <ul class="m-0 list-none p-0">
          <li v-for="link in col.links" :key="link.text" class="py-1">
            <a :href="link.href" class="text-muted-foreground no-underline transition-colors hover:text-foreground">
              {{ link.text }}
            </a>
          </li>
        </ul>
      </div>
    </nav>
  </footer>
</template>
