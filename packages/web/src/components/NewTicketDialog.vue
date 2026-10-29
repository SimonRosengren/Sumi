<script setup lang="ts">
import type { CreateTicketInput, Lane } from "@sumi/contract";
import { ChevronDown, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD, CHEVRON, SECTION_LABEL, TEXTAREA } from "@/lib/fields";

const props = defineProps<{
  open: boolean;
  projectKey: string | null;
  lanes: Lane[];
  /** Creates the ticket. Rejects with the server's message. */
  create: (input: Omit<CreateTicketInput, "projectKey">) => Promise<unknown>;
}>();
const emit = defineEmits<{ close: [] }>();

const titleInput = ref<InstanceType<typeof Input>>();
const title = ref("");
const description = ref("");
const status = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

// Every opening starts from an empty form.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    title.value = "";
    description.value = "";
    status.value = props.lanes[0]?.id ?? "";
    error.value = null;
  },
);

async function submit() {
  const trimmed = title.value.trim();
  if (!trimmed || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    await props.create({ title: trimmed, description: description.value, ...(status.value && { status: status.value }) });
    emit("close");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="animate-in fade-in-0 fixed inset-0 z-40 bg-black/30 dark:bg-black/50" />
      <DialogContent
        data-testid="new-ticket"
        @open-auto-focus.prevent="(titleInput?.$el as HTMLInputElement | undefined)?.focus()"
        class="bg-card animate-in fade-in-0 zoom-in-95 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-lg shadow-black/10 outline-none"
      >
        <form class="flex flex-col gap-5" @submit.prevent="submit">
          <header class="flex items-start justify-between gap-3">
            <div>
              <DialogTitle class="text-lg font-semibold tracking-tight">New ticket</DialogTitle>
              <DialogDescription class="text-muted-foreground mt-1 text-[13px]">
                In <span class="font-mono text-xs">{{ projectKey }}</span>. Assignee and priority can be set once it exists.
              </DialogDescription>
            </div>
            <DialogClose
              type="button"
              class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 -m-1.5 shrink-0 rounded-md p-1.5 transition-colors outline-none focus-visible:ring-2"
              aria-label="Close"
            >
              <X class="size-4" aria-hidden="true" />
            </DialogClose>
          </header>

          <div class="flex flex-col gap-1.5">
            <label for="new-title" :class="SECTION_LABEL">Title</label>
            <Input id="new-title" ref="titleInput" v-model="title" class="h-8 text-[13px]" maxlength="200" required autocomplete="off" />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="new-description" :class="SECTION_LABEL">Description</label>
            <textarea id="new-description" v-model="description" :class="TEXTAREA" rows="5" maxlength="20000" />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="new-status" :class="SECTION_LABEL">Status</label>
            <div class="relative">
              <select id="new-status" v-model="status" :class="FIELD">
                <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
              <ChevronDown :class="CHEVRON" aria-hidden="true" />
            </div>
          </div>

          <p v-if="error" role="alert" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{{ error }}</p>

          <footer class="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" @click="emit('close')">Cancel</Button>
            <Button type="submit" size="sm" :disabled="!title.trim() || saving">Create ticket</Button>
          </footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
