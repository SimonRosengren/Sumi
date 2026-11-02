import { createClient, getAuthConfig, type Client } from "@sumi/client";
import type { AuthConfig } from "@sumi/contract";

const TOKEN_KEY = "sumi.token";

/** The dev server (and later the production host) proxies /api to the Sumi API. */
export const API_PATH = "/api";

export const loadToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const saveToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export function makeClient(token: string): Client {
  return createClient({ url: apiUrl(), token });
}

export const apiUrl = (): string => `${location.origin}${API_PATH}`;

export const fetchAuthConfig = (): Promise<AuthConfig> => getAuthConfig(apiUrl());

/** Where the browser goes to start "Sign in with GitHub". */
export const GITHUB_SIGN_IN_PATH = `${API_PATH}/auth/github`;

/**
 * After GitHub sign-in the API sends the browser back with `#token=...` or `#error=...`.
 * Reads it and removes it from the address bar so it is not kept in history.
 */
export function takeSignInResult(): { token?: string; error?: string } {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token");
  const error = params.get("error");
  if (!token && !error) return {};
  history.replaceState(null, "", location.pathname + location.search);
  return { ...(token && { token }), ...(error && { error }) };
}

/**
 * The public id the API lists a token under: the first 16 hex characters of its SHA-256 (ADR 0021).
 * Lets the token list point out the one this browser uses. Null where Web Crypto is missing
 * (plain HTTP away from localhost), in which case nothing is marked.
 */
export async function tokenId(token: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
