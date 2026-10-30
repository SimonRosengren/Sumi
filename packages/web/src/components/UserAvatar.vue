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
      <!-- Humans are round with initials, agents are square with a bot: both neutral, never accent colored. -->
      <Avatar :class="user.kind === 'agent' ? 'size-5 rounded-md' : 'size-5'" :data-kind="user.kind">
        <AvatarFallback
          :class="user.kind === 'agent' ? 'rounded-md border' : ''"
          class="bg-secondary text-muted-foreground type-initials"
        >
          <Bot v-if="user.kind === 'agent'" class="size-3" aria-hidden="true" />
          <template v-else>{{ initials(user.name) }}</template>
        </AvatarFallback>
      </Avatar>
    </TooltipTrigger>
    <TooltipContent>{{ user.name }}{{ user.kind === "agent" ? " (agent)" : "" }}</TooltipContent>
  </Tooltip>
</template>
