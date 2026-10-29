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
