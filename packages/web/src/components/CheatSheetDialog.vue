<script setup lang="ts">
import { Check, Copy, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { SECTION_LABEL } from "@/lib/fields";

const props = defineProps<{ open: boolean; projectKey: string | null }>();
const emit = defineEmits<{ close: [] }>();

const CLI = "pnpm exec sumi";

/** The commands people reach for most, as typed in a checkout. Add `--json` to any of them for machine-readable output. */
const groups = computed(() => {
  const project = props.projectKey ?? "SUMI";
  const ticket = `${project}-1`;
  return [
    {
      label: "Tickets",
      commands: [
        { cmd: `${CLI} ticket list ${project}`, note: "List the tickets in a project" },
        { cmd: `${CLI} ticket get ${ticket}`, note: "Show one ticket" },
        { cmd: `${CLI} ticket create ${project} "Fix login" --priority high`, note: "Create a ticket" },
        { cmd: `${CLI} ticket move ${ticket} in_progress`, note: "Move it to a lane (use the lane id)" },
        { cmd: `${CLI} ticket update ${ticket} --assignee none`, note: "Change fields; none clears them" },
        { cmd: `${CLI} ticket comment ${ticket} "Done in #12"`, note: "Add a comment" },
        { cmd: `${CLI} ticket claim ${project}`, note: "Take the next unassigned todo ticket" },
      ],
    },
    {
      label: "Projects and lanes",
      commands: [
        { cmd: `${CLI} project create WEB "Website"`, note: "Create a project: a 2-10 character key in capitals, then a name" },
        { cmd: `${CLI} project list`, note: "List projects" },
        { cmd: `${CLI} project lane list ${project}`, note: "Show the lane ids" },
        { cmd: `${CLI} project lane add ${project} "Blocked"`, note: "Add a lane (rename, move and remove work the same way)" },
        { cmd: `${CLI} project delete WEB`, note: "Delete a project and everything in it. Cannot be undone" },
      ],
    },
    {
      label: "Agents and more",
      commands: [
        { cmd: `${CLI} agent create Claude`, note: "Create an agent and its own token (shown once)" },
        { cmd: `${CLI} activity --project ${project}`, note: "Recent changes, newest first" },
        { cmd: `${CLI} whoami`, note: "Check which user your token belongs to" },
        { cmd: `${CLI} --help`, note: "Every command; add --json for scripts" },
      ],
    },
  ];
});

/** Both variables are read from the environment (or the checkout's `.env`). The API lives under `/api` on this site. */
const setup = computed(
  () => `export SUMI_URL=${window.location.origin}/api\nexport SUMI_TOKEN=<your token>\n${CLI} ticket list ${props.projectKey ?? "SUMI"}`,
);

const copied = ref<string | null>(null);
const failed = ref(false);

async function copy(cmd: string) {
  failed.value = false;
  try {
    await navigator.clipboard.writeText(cmd);
    copied.value = cmd;
  } catch {
    copied.value = null;
    failed.value = true;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="animate-in fade-in-0 fixed inset-0 z-40 bg-scrim" />
      <DialogContent
        data-testid="cheat-sheet"
        class="bg-card animate-in fade-in-0 zoom-in-95 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-overlay outline-none"
      >
        <div class="flex flex-col gap-6">
          <header class="flex items-start justify-between gap-3">
            <div>
              <DialogTitle class="type-title">CLI cheat sheet</DialogTitle>
              <DialogDescription class="text-muted-foreground type-field mt-1">
                Run these from a checkout of the repo, after <code class="font-mono text-xs">pnpm install</code>.
              </DialogDescription>
            </div>
            <DialogClose as-child>
              <Button type="button" variant="ghost" size="icon-sm" class="-my-1 shrink-0" aria-label="Close">
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </header>

          <section class="flex flex-col gap-2" aria-label="Run a command">
            <h3 :class="SECTION_LABEL">Run a command</h3>
            <div class="flex items-start gap-2">
              <pre
                data-testid="setup"
                class="bg-muted min-w-0 flex-1 rounded-md px-2 py-2 font-mono text-xs break-all whitespace-pre-wrap select-all"
              >{{ setup }}</pre>
              <Button type="button" variant="ghost" size="icon-sm" class="shrink-0" aria-label="Copy setup" @click="copy(setup)">
                <Check v-if="copied === setup" aria-hidden="true" />
                <Copy v-else aria-hidden="true" />
              </Button>
            </div>
            <p class="text-muted-foreground text-xs">
              The token is yours: create one with the key button (API tokens). Set the variables once per terminal, then run any command below.
              Agents use their own token.
            </p>
          </section>

          <section v-for="g in groups" :key="g.label" class="flex flex-col gap-2" :aria-label="g.label">
            <h3 :class="SECTION_LABEL">{{ g.label }}</h3>
            <ul class="flex flex-col gap-2">
              <li v-for="c in g.commands" :key="c.cmd" data-command class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <code class="bg-muted min-w-0 flex-1 rounded-md px-2 py-2 font-mono text-xs break-all select-all">{{ c.cmd }}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="shrink-0"
                    :aria-label="`Copy ${c.cmd}`"
                    @click="copy(c.cmd)"
                  >
                    <Check v-if="copied === c.cmd" aria-hidden="true" />
                    <Copy v-else aria-hidden="true" />
                  </Button>
                </div>
                <p class="text-muted-foreground text-xs">{{ c.note }}</p>
              </li>
            </ul>
          </section>

          <p v-if="failed" role="alert" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
            Could not copy. Select the command and copy it by hand.
          </p>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
