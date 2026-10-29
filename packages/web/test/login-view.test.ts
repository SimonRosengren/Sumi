import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginView from "@/views/LoginView.vue";
import { alice } from "./fixtures";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => json({ github: false }))); // the sign-in screen asks which methods exist
});
afterEach(() => vi.unstubAllGlobals());

async function submit(token: string) {
  const wrapper = mount(LoginView);
  await wrapper.get("input").setValue(token);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  return wrapper;
}

describe("LoginView", () => {
  it("disables sign in until a token is entered", async () => {
    const wrapper = mount(LoginView);
    expect(wrapper.get("button[type=submit]").attributes("disabled")).toBeDefined();
    await wrapper.get("input").setValue("sumi_x");
    expect(wrapper.get("button[type=submit]").attributes("disabled")).toBeUndefined();
  });

  it("stores a valid token and emits it", async () => {
    const fetchMock = vi.fn(async () => json({ ...alice, createdAt: alice.createdAt.toISOString() }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = await submit("  sumi_good  ");

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls.find(([u]) => u.endsWith("/api/me"))!;
    expect(url).toMatch(/\/api\/me$/);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sumi_good");
    expect(wrapper.emitted("signedIn")).toEqual([["sumi_good"]]);
    expect(localStorage.getItem("sumi.token")).toBe("sumi_good");
  });

  it("shows the API's message and stores nothing for a rejected token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "unauthenticated", message: "Missing or invalid token" } }, 401)),
    );
    const wrapper = await submit("sumi_bad");
    expect(wrapper.get('[role="alert"]').text()).toBe("Missing or invalid token");
    expect(wrapper.emitted("signedIn")).toBeUndefined();
    expect(localStorage.getItem("sumi.token")).toBeNull();
  });
});

describe("LoginView with GitHub sign-in", () => {
  const stubConfig = (github: boolean) =>
    vi.stubGlobal("fetch", vi.fn(async () => json({ github })));

  it("offers GitHub only when the API has it enabled", async () => {
    stubConfig(false);
    const off = mount(LoginView);
    await flushPromises();
    expect(off.text()).not.toContain("Continue with GitHub");

    stubConfig(true);
    const on = mount(LoginView);
    await flushPromises();
    const link = on.get("a");
    expect(link.text()).toBe("Continue with GitHub");
    expect(link.attributes("href")).toBe("/api/auth/github");
  });

  it("shows why a GitHub sign-in failed", async () => {
    stubConfig(true);
    const wrapper = mount(LoginView, { props: { initialError: "GitHub user x is not allowed to sign in here." } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("not allowed");
  });
});
