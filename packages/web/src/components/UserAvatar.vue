<script setup lang="ts">
import type { User } from "@sumi/contract";
import { Bot } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/board";

defineProps<{ user: User }>();
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Avatar class="size-6" :data-kind="user.kind">
        <AvatarFallback
          :class="user.kind === 'agent' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground'"
          class="text-[10px] font-medium"
        >
          <Bot v-if="user.kind === 'agent'" class="size-3.5" aria-hidden="true" />
          <template v-else>{{ initials(user.name) }}</template>
        </AvatarFallback>
      </Avatar>
    </TooltipTrigger>
    <TooltipContent>{{ user.name }}{{ user.kind === "agent" ? " (agent)" : "" }}</TooltipContent>
  </Tooltip>
</template>
