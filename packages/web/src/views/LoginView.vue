<script setup lang="ts">
import { onMounted, ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AppWordmark from "@/components/AppWordmark.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAuthConfig, GITHUB_SIGN_IN_PATH, makeClient, saveToken } from "@/lib/session";

const props = defineProps<{ initialError?: string | null }>();
const emit = defineEmits<{ signedIn: [token: string] }>();

const token = ref("");
const error = ref<string | null>(props.initialError ?? null);
const github = ref(false);

onMounted(async () => {
  github.value = (await fetchAuthConfig()).github;
});
const busy = ref(false);

async function submit() {
  const value = token.value.trim();
  if (!value) return;
  busy.value = true;
  error.value = null;
  try {
    await makeClient(value).me();
    saveToken(value);
    emit("signedIn", value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="relative grid min-h-screen place-items-center p-4">
    <div class="absolute top-3 right-3"><ThemeToggle /></div>
    <div class="w-full max-w-sm space-y-8">
      <div class="flex justify-center"><AppWordmark /></div>
      <Card>
        <CardHeader>
          <CardTitle class="type-title">Sign in</CardTitle>
          <CardDescription>
            <template v-if="github">Sign in with GitHub, or paste an API token.</template>
            <template v-else>
              Paste an API token. Create one with <code class="bg-muted rounded-sm px-2 py-1 font-mono text-xs">pnpm bootstrap &lt;name&gt;</code>.
            </template>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p v-if="error" role="alert" class="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">{{ error }}</p>
          <template v-if="github">
            <Button as="a" :href="GITHUB_SIGN_IN_PATH" class="w-full">Continue with GitHub</Button>
            <div class="text-muted-foreground my-4 flex items-center gap-3 text-xs">
              <span class="bg-border h-px flex-1" />or<span class="bg-border h-px flex-1" />
            </div>
          </template>
          <form class="space-y-4" @submit.prevent="submit">
            <div class="space-y-2">
              <Label for="token" class="type-field">API token</Label>
              <Input id="token" v-model="token" type="password" autocomplete="off" placeholder="sumi_…" class="font-mono" />
            </div>
            <Button type="submit" class="w-full" :variant="github ? 'outline' : 'default'" :disabled="busy || !token.trim()">
              {{ busy ? "Checking…" : "Sign in" }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
