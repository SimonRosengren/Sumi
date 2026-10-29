<script setup lang="ts">
import { ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AppWordmark from "@/components/AppWordmark.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { makeClient, saveToken } from "@/lib/session";

const emit = defineEmits<{ signedIn: [token: string] }>();

const token = ref("");
const error = ref<string | null>(null);
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
    <div class="w-full max-w-sm space-y-6">
      <div class="flex justify-center"><AppWordmark /></div>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Paste an API token. Create one with <code class="font-mono text-xs">pnpm bootstrap &lt;name&gt;</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-4" @submit.prevent="submit">
            <div class="space-y-2">
              <Label for="token">API token</Label>
              <Input id="token" v-model="token" type="password" autocomplete="off" placeholder="sumi_…" class="font-mono" />
            </div>
            <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
            <Button type="submit" class="w-full" :disabled="busy || !token.trim()">
              {{ busy ? "Checking…" : "Sign in" }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
