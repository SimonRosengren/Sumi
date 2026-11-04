<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { PanelLeft } from "@lucide/vue"
import { cn } from "cn"
import { Button } from '@/components/ui/button'
import { useSidebar } from "./utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const { toggleSidebar, isMobile, openMobile, open } = useSidebar()
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon"
    :class="cn('shrink-0', props.class)"
    aria-label="Toggle sidebar"
    :aria-expanded="isMobile ? openMobile : open"
    @click="toggleSidebar"
  >
    <PanelLeft aria-hidden="true" />
  </Button>
</template>
