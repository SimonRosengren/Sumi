import type { TokenInfo } from "@sumi/contract";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenId } from "@/lib/session";
import BoardView from "@/views/BoardView.vue";
import { alice, fakeClient } from "./fixtures";

const info = (id: string, day: number): TokenInfo => ({ id, userId: "u1", createdAt: new Date(`2026-01-0${day}T10:00:00Z`) });
const A = "a".repeat(16);
const B = "b".repeat(16);

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

function setup(tokens: TokenInfo[] = [info(A, 2), info(B, 1)]) {
  let list = tokens;
  const client = fakeClient({
    listTokens: vi.fn(async () => list),
    createToken: vi.fn(async () => {
      list = [info("c".repeat(16), 3), ...list];
      return "sumi_secret";
    }),
    revokeToken: vi.fn(async (id: string) => {
      list = list.filter((t) => t.id !== id);
    }),
  });
  return client;
}

async function open(client = setup()) {
  const wrapper = mount(BoardView, { props: { client, me: alice }, attachTo: document.body });
  await flushPromises();
  await wrapper.get('button[aria-label="API tokens"]').trigger("click");
  await flushPromises();
  return { wrapper, client };
}

const dialog = () => document.body.querySelector<HTMLElement>('[data-testid="tokens"]');
const button = (name: string) =>
  Array.from(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().includes(name));
async function click(el: HTMLElement | undefined) {
  el?.click();
  await flushPromises();
}
const rows = () => Array.from(dialog()?.querySelectorAll("[data-token]") ?? []).map((r) => r.getAttribute("data-token"));

describe("tokens dialog", () => {
  it("starts closed, then lists your tokens newest first", async () => {
    const wrapper = mount(BoardView, { props: { client: setup(), me: alice }, attachTo: document.body });
    await flushPromises();
    expect(dialog()).toBeNull();
    await wrapper.get('button[aria-label="API tokens"]').trigger("click");
    await flushPromises();
    expect(rows()).toEqual([A, B]);
  });

  it("says so when there are none", async () => {
    await open(setup([]));
    expect(dialog()?.textContent).toContain("You have no tokens");
  });

  it("creates a token, shows it once and adds it to the list", async () => {
    const { client } = await open();
    await click(button("Create token"));
    expect(client.createToken).toHaveBeenCalledOnce();
    expect(dialog()?.querySelector('[data-testid="new-token"]')?.textContent).toBe("sumi_secret");
    expect(dialog()?.textContent).toContain("not shown again");
    expect(rows()).toHaveLength(3);

    // Closing and opening again does not bring the plaintext back.
    await click(button("Close"));
    expect(dialog()).toBeNull();
    document.body.querySelector<HTMLElement>('button[aria-label="API tokens"]')?.click();
    await flushPromises();
    expect(dialog()?.querySelector('[data-testid="new-token"]')).toBeNull();
  });

  it("revokes a token and refreshes the list", async () => {
    const { client } = await open();
    await click(button(`Revoke token ${B}`));
    expect(client.revokeToken).toHaveBeenCalledWith(B);
    expect(rows()).toEqual([A]);
  });

  it("shows the server's message when a change fails", async () => {
    const client = setup();
    client.revokeToken = vi.fn(async () => {
      throw new Error("Only humans can manage agents and tokens");
    });
    await open(client);
    await click(button(`Revoke token ${A}`));
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("Only humans");
    expect(rows()).toEqual([A, B]);
  });

  it("marks the token this browser uses and signs out when it is revoked", async () => {
    const mine = (await tokenId("sumi_mine")) as string;
    expect(mine).toMatch(/^[0-9a-f]{16}$/);
    localStorage.setItem("sumi.token", "sumi_mine");
    const { wrapper, client } = await open(setup([info(mine, 2), info(B, 1)]));
    expect(dialog()?.querySelector(`[data-token="${mine}"]`)?.textContent).toContain("This browser");
    expect(dialog()?.querySelector(`[data-token="${B}"]`)?.textContent).not.toContain("This browser");

    await click(button("and sign out"));
    expect(client.revokeToken).toHaveBeenCalledWith(mine);
    expect(wrapper.emitted("signOut")).toHaveLength(1);
  });
});
