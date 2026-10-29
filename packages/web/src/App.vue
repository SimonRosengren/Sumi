<script setup lang="ts">
import type { Client } from "@sumi/client";
import type { User } from "@sumi/contract";
import { onMounted, ref } from "vue";
import { Skeleton } from "@/components/ui/skeleton";
import { clearToken, loadToken, makeClient, saveToken, takeSignInResult } from "@/lib/session";
import BoardView from "@/views/BoardView.vue";
import LoginView from "@/views/LoginView.vue";

type Session = { client: Client; me: User };

// Back from GitHub: keep the token it sent, or show why it did not work.
const arrived = takeSignInResult();
if (arrived.token) saveToken(arrived.token);
const signInError = ref(arrived.error ?? null);

const session = ref<Session | null>(null);
const checking = ref(loadToken() !== null);

async function start(token: string) {
  const client = makeClient(token);
  try {
    session.value = { client, me: await client.me() };
  } catch {
    // A stored token that no longer works: fall back to the login screen.
    clearToken();
    session.value = null;
  }
}

function signOut() {
  clearToken();
  session.value = null;
}

onMounted(async () => {
  const token = loadToken();
  if (token) await start(token);
  checking.value = false;
});
</script>

<template>
  <Skeleton v-if="checking" class="m-4 h-12" aria-busy="true" />
  <BoardView v-else-if="session" :client="session.client" :me="session.me" @sign-out="signOut" />
  <LoginView v-else :initial-error="signInError" @signed-in="start" />
</template>
