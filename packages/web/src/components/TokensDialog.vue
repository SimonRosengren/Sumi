<script setup lang="ts">
import type { Client } from "@sumi/client";
import type { TokenInfo } from "@sumi/contract";
import { Check, Copy, Plus, X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { SECTION_LABEL } from "@/lib/fields";
import { loadToken, tokenId } from "@/lib/session";

const props = defineProps<{ open: boolean; client: Client }>();
const emit = defineEmits<{ close: []; signOut: [] }>();

const tokens = ref<TokenInfo[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
/** The plaintext of a token created in this dialog. Shown once, dropped when it closes. */
const created = ref<string | null>(null);
const copied = ref(false);
const current = ref<string | null>(null);

const when = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function load() {
  loading.value = true;
  try {
    tokens.value = await props.client.listTokens();
  } catch (err) {
    error.value = message(err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    tokens.value = [];
    created.value = null;
    copied.value = false;
    error.value = null;
    const stored = loadToken();
    current.value = stored ? await tokenId(stored) : null;
    await load();
  },
);

/** Runs one change, then refreshes the list. */
async function change(run: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await run();
    await load();
  } catch (err) {
    error.value = message(err);
  } finally {
    busy.value = false;
  }
}

const create = () =>
  change(async () => {
    created.value = await props.client.createToken();
    copied.value = false;
  });

async function revoke(id: string) {
  const own = id === current.value;
  if (own) {
    // Revoking the token this browser uses ends the session, so there is no list left to refresh.
    if (busy.value) return;
    busy.value = true;
    try {
      await props.client.revokeToken(id);
      emit("signOut");
    } catch (err) {
      error.value = message(err);
    } finally {
      busy.value = false;
    }
    return;
  }
  await change(() => props.client.revokeToken(id));
}

async function copy() {
  if (!created.value) return;
  try {
    await navigator.clipboard.writeText(created.value);
    copied.value = true;
  } catch {
    error.value = "Could not copy. Select the token and copy it by hand.";
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="animate-in fade-in-0 fixed inset-0 z-40 bg-scrim" />
      <DialogContent
        data-testid="tokens"
        class="bg-card animate-in fade-in-0 zoom-in-95 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-overlay outline-none"
      >
        <div class="flex flex-col gap-6">
          <header class="flex items-start justify-between gap-3">
            <div>
              <DialogTitle class="type-title">API tokens</DialogTitle>
              <DialogDescription class="text-muted-foreground type-field mt-1">
                Tokens let the CLI and scripts act as you. Treat them like passwords. Agents get their own with
                <code class="font-mono text-xs">sumi agent create</code>.
              </DialogDescription>
            </div>
            <DialogClose as-child>
              <Button type="button" variant="ghost" size="icon-sm" class="-my-1 shrink-0" aria-label="Close">
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </header>

          <div v-if="created" role="status" class="bg-muted flex flex-col gap-2 rounded-md p-3">
            <p class="type-field">Copy this token now. It is not shown again.</p>
            <div class="flex items-center gap-2">
              <code data-testid="new-token" class="bg-card border-input min-w-0 flex-1 rounded-md border px-2 py-2 font-mono text-xs break-all select-all">{{ created }}</code>
              <Button type="button" variant="outline" size="sm" @click="copy">
                <Check v-if="copied" aria-hidden="true" />
                <Copy v-else aria-hidden="true" />
                {{ copied ? "Copied" : "Copy" }}
              </Button>
            </div>
          </div>

          <section class="flex flex-col gap-2" aria-labelledby="tokens-label">
            <h3 id="tokens-label" :class="SECTION_LABEL">Your tokens</h3>
            <p v-if="loading && tokens.length === 0" class="text-muted-foreground type-field">Loading…</p>
            <p v-else-if="tokens.length === 0" class="text-muted-foreground type-field">You have no tokens.</p>
            <ul v-else class="flex flex-col">
              <li v-for="t in tokens" :key="t.id" :data-token="t.id" class="flex items-center gap-3 py-2">
                <span class="font-mono text-xs">{{ t.id }}</span>
                <span class="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  Created {{ when(t.createdAt) }}<template v-if="t.id === current"> · This browser</template>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  class="hover:text-destructive"
                  :disabled="busy"
                  :aria-label="t.id === current ? `Revoke token ${t.id} and sign out` : `Revoke token ${t.id}`"
                  @click="revoke(t.id)"
                >
                  {{ t.id === current ? "Revoke and sign out" : "Revoke" }}
                </Button>
              </li>
            </ul>
          </section>

          <p v-if="error" role="alert" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{{ error }}</p>

          <footer class="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" @click="emit('close')">Close</Button>
            <Button type="button" size="sm" :disabled="busy" @click="create">
              <Plus aria-hidden="true" />
              Create token
            </Button>
          </footer>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
