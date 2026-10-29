import type { Core } from "@sumi/core";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

export interface GithubOptions {
  clientId: string;
  clientSecret: string;
  /** Where people open the web app, e.g. `http://localhost:5173`. The browser is sent back here after sign-in. */
  publicUrl: string;
  /** GitHub logins that may sign in (compared case-insensitively). Everyone else is turned away. */
  allowedLogins: string[];
  fetch?: typeof fetch;
}

const STATE_COOKIE = "sumi_oauth_state";
const STATE_TTL_S = 600;

/** The path the web app proxies to the API (see packages/web), so GitHub calls back through it. */
const API_PREFIX = "/api";

const GithubUserSchema = z.object({ id: z.number().int(), login: z.string(), name: z.string().nullable() });
const AccessTokenSchema = z.object({ access_token: z.string().optional(), error: z.string().optional() });

/**
 * GitHub OAuth sign-in for humans (ADR 0021). The callback turns a GitHub identity into a
 * Sumi user and an API token, and hands the token to the web app in the URL fragment, which
 * browsers never send to a server. The web app stores it like a pasted token.
 */
export function githubAuth(core: Core, opts: GithubOptions) {
  const app = new Hono();
  const fetchImpl = opts.fetch ?? fetch;
  const publicUrl = opts.publicUrl.replace(/\/+$/, "");
  const callbackUrl = `${publicUrl}${API_PREFIX}/auth/github/callback`;
  const allowed = new Set(opts.allowedLogins.map((l) => l.toLowerCase()));
  const secure = publicUrl.startsWith("https:");

  const back = (c: { redirect: (url: string, status: 302) => Response; header: (k: string, v: string) => void }, hash: string) => {
    c.header("Cache-Control", "no-store");
    return c.redirect(`${publicUrl}/#${hash}`, 302);
  };
  const fail = (c: Parameters<typeof back>[0], message: string) => back(c, `error=${encodeURIComponent(message)}`);

  app.get("/auth/github", (c) => {
    const state = crypto.randomUUID();
    setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: "Lax", secure, path: "/", maxAge: STATE_TTL_S });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: opts.clientId,
      redirect_uri: callbackUrl,
      scope: "read:user",
      state,
    }).toString();
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/github/callback", async (c) => {
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    const { code, state, error } = c.req.query();
    if (error) return fail(c, "GitHub sign-in was cancelled");
    if (!code || !state || state !== expected) return fail(c, "The sign-in expired. Try again.");

    let github: z.infer<typeof GithubUserSchema>;
    try {
      const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      });
      const accessToken = AccessTokenSchema.parse(await tokenRes.json()).access_token;
      if (!accessToken) return fail(c, "GitHub did not accept the sign-in. Try again.");
      const userRes = await fetchImpl("https://api.github.com/user", {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json", "user-agent": "sumi" },
      });
      if (!userRes.ok) return fail(c, "Could not read your GitHub profile.");
      github = GithubUserSchema.parse(await userRes.json());
    } catch (err) {
      console.error("GitHub sign-in failed", err);
      return fail(c, "Could not reach GitHub. Try again.");
    }

    if (!allowed.has(github.login.toLowerCase())) {
      return fail(c, `GitHub user ${github.login} is not allowed to sign in here.`);
    }
    const user = await core.users.signInWithGithub({
      githubId: github.id,
      name: (github.name?.trim() || github.login).slice(0, 100),
    });
    const token = await core.tokens.create(user.id, user.id);
    return back(c, `token=${token}`);
  });

  return app;
}
