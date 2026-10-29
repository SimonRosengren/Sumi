import { AuthConfigSchema } from "@sumi/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApi } from "./helpers";

const PUBLIC_URL = "http://localhost:5173";

type GithubReply = { tokenBody?: unknown; userStatus?: number; userBody?: unknown; throws?: boolean };
let reply: GithubReply = {};

/** Stands in for github.com and api.github.com. */
const fakeFetch = vi.fn(async (input: string | URL | Request) => {
  if (reply.throws) throw new Error("offline");
  const url = String(input);
  if (url === "https://github.com/login/oauth/access_token") {
    return Response.json(reply.tokenBody ?? { access_token: "gho_abc" });
  }
  if (url === "https://api.github.com/user") {
    return Response.json(reply.userBody ?? { id: 99, login: "Octocat", name: "Octo Cat" }, { status: reply.userStatus ?? 200 });
  }
  throw new Error(`unexpected request to ${url}`);
}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const api = useApi({
  github: { clientId: "cid", clientSecret: "secret", publicUrl: PUBLIC_URL, allowedLogins: ["octocat"], fetch: fakeFetch },
});

beforeEach(() => {
  reply = {};
  vi.mocked(fakeFetch).mockClear();
});

/** Starts a sign-in and returns the state and the cookie the browser would send back. */
async function start() {
  const res = await api().app.request("/auth/github");
  const location = new URL(res.headers.get("location")!);
  const cookie = /sumi_oauth_state=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
  return { res, location, state: location.searchParams.get("state")!, cookie: `sumi_oauth_state=${cookie}` };
}

async function callback(query: Record<string, string>, cookie?: string) {
  const res = await api().app.request(`/auth/github/callback?${new URLSearchParams(query)}`, {
    headers: cookie ? { cookie } : {},
  });
  const hash = new URL(res.headers.get("location")!).hash.slice(1);
  return { res, hash: new URLSearchParams(hash) };
}

describe("GitHub sign-in", () => {
  it("is announced by /auth/config", async () => {
    const res = await api().call("GET", "/auth/config", { token: null });
    expect(AuthConfigSchema.parse(res.body)).toEqual({ github: true });
  });

  it("sends the browser to GitHub with a state that is also set as a cookie", async () => {
    const { res, location, state } = await start();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("cid");
    expect(location.searchParams.get("redirect_uri")).toBe(`${PUBLIC_URL}/api/auth/github/callback`);
    expect(location.searchParams.get("scope")).toBe("read:user");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`sumi_oauth_state=${state}; .*HttpOnly.*SameSite=Lax`, "i"));
  });

  it("signs an allowed user in and hands the web app a working token", async () => {
    const { state, cookie } = await start();
    const { res, hash } = await callback({ code: "c0de", state }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(new RegExp(`^${PUBLIC_URL}/#token=sumi_`));
    expect(res.headers.get("cache-control")).toBe("no-store");

    const me = await api().call("GET", "/me", { token: hash.get("token") });
    expect(me.body).toMatchObject({ kind: "human", name: "Octo Cat", githubId: 99 });

    const exchange = vi.mocked(fakeFetch).mock.calls[0]!;
    expect(JSON.parse(String(exchange[1]?.body))).toMatchObject({ code: "c0de", client_secret: "secret" });
  });

  it("matches logins case-insensitively and reuses the same user on the next sign-in", async () => {
    const first = await start();
    const a = (await callback({ code: "1", state: first.state }, first.cookie)).hash.get("token");
    const second = await start();
    const b = (await callback({ code: "2", state: second.state }, second.cookie)).hash.get("token");
    expect(a).not.toBe(b);
    const [ma, mb] = await Promise.all([a, b].map((token) => api().call("GET", "/me", { token })));
    expect(ma?.body.id).toBe(mb?.body.id);
  });

  it("falls back to the login when the profile has no name", async () => {
    reply = { userBody: { id: 100, login: "octocat", name: null } };
    const { state, cookie } = await start();
    const { hash } = await callback({ code: "c", state }, cookie);
    expect((await api().call("GET", "/me", { token: hash.get("token") })).body.name).toBe("octocat");
  });

  it("turns away users that are not on the allow-list, without creating them", async () => {
    reply = { userBody: { id: 555, login: "stranger", name: "Stranger" } };
    const { state, cookie } = await start();
    const { hash } = await callback({ code: "c", state }, cookie);
    expect(hash.get("token")).toBeNull();
    expect(hash.get("error")).toContain("stranger is not allowed");
    expect((await api().core.users.list()).some((u) => u.githubId === 555)).toBe(false);
  });

  it.each([
    ["no cookie", (s: string) => ({ query: { code: "c", state: s }, cookie: undefined })],
    ["a different state", (s: string) => ({ query: { code: "c", state: s }, cookie: "sumi_oauth_state=other" })],
    ["no code", (s: string, c: string) => ({ query: { state: s }, cookie: c })],
  ])("rejects a callback with %s", async (_name, build) => {
    const { state, cookie } = await start();
    const { query, cookie: sent } = build(state, cookie);
    const { hash } = await callback(query, sent);
    expect(hash.get("token")).toBeNull();
    expect(hash.get("error")).toContain("expired");
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("reports a cancelled sign-in", async () => {
    const { hash } = await callback({ error: "access_denied" });
    expect(hash.get("error")).toContain("cancelled");
  });

  it.each([
    ["GitHub rejecting the code", { tokenBody: { error: "bad_verification_code" } }],
    ["GitHub being unreachable", { throws: true }],
    ["the profile call failing", { userStatus: 500 }],
  ] as const)("reports %s as an error, not a token", async (_name, r) => {
    reply = r;
    const { state, cookie } = await start();
    const { hash } = await callback({ code: "c", state }, cookie);
    expect(hash.get("token")).toBeNull();
    expect(hash.get("error")).toBeTruthy();
  });
});
