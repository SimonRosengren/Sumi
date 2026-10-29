import { createClient, type Client } from "@sumi/client";

const TOKEN_KEY = "sumi.token";

/** The dev server (and later the production host) proxies /api to the Sumi API. */
export const API_PATH = "/api";

export const loadToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const saveToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export function makeClient(token: string): Client {
  return createClient({ url: `${location.origin}${API_PATH}`, token });
}
