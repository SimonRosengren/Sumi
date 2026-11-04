import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardView from "@/views/BoardView.vue";
import { alice, fakeClient } from "./fixtures";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function open() {
  const wrapper = mount(BoardView, { props: { client: fakeClient(), me: alice }, attachTo: document.body });
  await flushPromises();
  await wrapper.get('button[aria-label="CLI cheat sheet"]').trigger("click");
  await flushPromises();
  return wrapper;
}

const dialog = () => document.body.querySelector<HTMLElement>('[data-testid="cheat-sheet"]');
const commands = () => Array.from(dialog()?.querySelectorAll("[data-command] code") ?? []).map((c) => c.textContent);

describe("CLI cheat sheet", () => {
  it("starts closed and opens from the sidebar", async () => {
    const wrapper = mount(BoardView, { props: { client: fakeClient(), me: alice }, attachTo: document.body });
    await flushPromises();
    expect(dialog()).toBeNull();
    await wrapper.get('button[aria-label="CLI cheat sheet"]').trigger("click");
    await flushPromises();
    expect(dialog()?.textContent).toContain("CLI cheat sheet");
  });

  it("uses the selected project in its commands", async () => {
    await open();
    expect(commands()).toContain("pnpm exec sumi ticket list SUMI --board SUMI-general");
    expect(commands()).toContain("pnpm exec sumi ticket move SUMI-1 in_progress");
    expect(commands()).toContain("pnpm exec sumi project list");
  });

  it("shows how to run a full command, with the API address of this site", async () => {
    await open();
    const setup = dialog()?.querySelector('[data-testid="setup"]')?.textContent ?? "";
    expect(setup).toContain(`export SUMI_URL=${window.location.origin}/api`);
    expect(setup).toContain("export SUMI_TOKEN=");
    expect(setup).toContain("pnpm exec sumi ticket list SUMI");
  });

  it("explains how to create and delete projects and add lanes", async () => {
    await open();
    expect(commands()).toContain('pnpm exec sumi project create WEB "Website"');
    expect(commands()).toContain('pnpm exec sumi board lane add SUMI-general "Blocked"');
    expect(commands()).toContain("pnpm exec sumi project delete WEB");
  });

  it("copies a command", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await open();
    dialog()?.querySelector<HTMLButtonElement>('button[aria-label="Copy pnpm exec sumi whoami"]')?.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("pnpm exec sumi whoami");
  });

  it("says so when copying is not allowed", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    await open();
    dialog()?.querySelector<HTMLButtonElement>('button[aria-label="Copy pnpm exec sumi whoami"]')?.click();
    await flushPromises();
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("Could not copy");
  });
});
