<script setup lang="ts">
import { withBase } from "vitepress";
import BoardMock from "./BoardMock.vue";
import CopyCommand from "./CopyCommand.vue";
import GrainGradient from "./GrainGradient.vue";
import SiteFooter from "./SiteFooter.vue";
import SiteHeader from "./SiteHeader.vue";
import TerminalMock from "./TerminalMock.vue";
import { repo } from "./links";

const primary =
  "inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-medium text-primary-foreground no-underline transition-colors hover:bg-primary-hover active:bg-primary-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-full border border-input bg-background px-6 text-base font-medium text-foreground no-underline transition-colors hover:bg-accent active:bg-accent-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// `side` is where the text block sits over the visual; the headline starts on the other side (Vercel's rhythm).
const sections = [
  {
    title: "One board for humans and agents",
    lead: "Every change is attributed.",
    features: ["Kanban board", "Live updates", "Activity log", "GitHub sign-in"],
    side: "right",
    visual: "board",
  },
  {
    title: "Agents use it like you do",
    lead: "MCP and CLI, no scraped UI.",
    features: ["MCP server", "CLI with --json", "Claim next ticket", "One token per agent"],
    side: "left",
    visual: "cli",
  },
  {
    title: "Yours in one command",
    lead: "One container plus MongoDB.",
    features: ["Self-hosted", "MIT licensed", "No per-seat pricing", "TypeScript"],
    side: "right",
    visual: "docker",
  },
] as const;

const cli = [
  "sumi ticket claim SUMI",
  "# SUMI-21 is yours, status in_progress",
  "",
  'sumi ticket comment SUMI-21 "Fixed in #48"',
  "sumi ticket move SUMI-21 in_review",
];
const docker = ["docker compose up -d --build", 'docker compose exec sumi npm run bootstrap -- "Ada"', "", "# board and API on http://localhost:3000"];
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-background text-foreground">
    <SiteHeader />

    <!-- Hero: atmosphere only. The product comes further down. Runs behind the transparent header. -->
    <section class="relative isolate -mt-16 overflow-hidden">
      <GrainGradient class="absolute inset-0 -z-10" fade />
      <div class="mx-auto flex max-w-page items-center px-6 pt-16 lg:min-h-[min(100svh,56rem)]">
        <header class="flex flex-col gap-8 py-section lg:max-w-xl lg:py-0">
          <h1 class="type-hero m-0 border-0 p-0">Ticket tracking your agents can use</h1>
          <p class="m-0 text-base text-muted-foreground">Open-source board for humans. MCP and CLI for agents.</p>
          <div class="flex flex-wrap items-center gap-3">
            <a :href="withBase('/guides/install')" :class="primary">Get started</a>
            <a :href="repo" :class="secondary">View on GitHub</a>
          </div>
        </header>
      </div>
    </section>

    <main class="mx-auto max-w-page px-6">
      <div class="mt-section flex flex-col gap-section md:mt-section-lg md:gap-section-lg">
        <section v-for="(s, i) in sections" :key="s.title" class="flex flex-col gap-12">
          <h2
            class="type-headline m-0 border-0 p-0 lg:max-w-4xl"
            :class="i % 2 === 1 ? 'lg:ml-auto lg:text-right' : ''"
          >
            {{ s.title }}
          </h2>
          <div class="relative isolate grid grid-cols-12 items-stretch overflow-hidden rounded-xl border border-border bg-muted lg:min-h-112">
            <GrainGradient
              class="absolute inset-0 -z-10"
              :class="s.side === 'right' ? 'grain-keep-left' : 'grain-keep-right'"
              surface="--muted"
              :center="s.side === 'right' ? [0.3, 0.55] : [0.7, 0.55]"
              :seed="20 + i * 40"
              :strength="0.75"
              :animate="false"
            />
            <div
              class="col-span-12 row-start-1 flex items-center p-6 lg:p-12"
              :class="s.side === 'right' ? 'lg:pr-72' : 'lg:pl-72'"
            >
              <div class="w-full min-w-0 overflow-hidden">
                <div v-if="s.visual === 'board'" class="w-200 max-w-none"><BoardMock /></div>
                <TerminalMock v-else-if="s.visual === 'cli'" :lines="cli" />
                <TerminalMock v-else :lines="docker" />
              </div>
            </div>
            <div
              class="col-span-12 row-start-2 flex flex-col gap-8 p-6 lg:row-start-1 lg:absolute lg:inset-y-0 lg:w-72 lg:p-12"
              :class="s.side === 'right' ? 'lg:right-0' : 'lg:left-0'"
            >
              <p class="type-lead m-0">{{ s.lead }}</p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0 text-sm font-medium">
                <li class="font-normal text-muted-foreground">Features</li>
                <li v-for="f in s.features" :key="f">{{ f }}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <!-- Closing call to action. -->
      <section class="mt-section flex flex-col items-center gap-8 pb-section text-center md:mt-section-lg">
        <h2 class="type-headline m-0 max-w-4xl border-0 p-0">Give your agents a board</h2>
        <div class="flex flex-col items-center gap-3 md:flex-row">
          <a :href="withBase('/guides/install')" :class="primary">Get started</a>
          <CopyCommand />
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
