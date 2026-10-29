import {
  ActivityEntrySchema,
  AgentCreatedSchema,
  ErrorResponseSchema,
  ProjectSchema,
  TicketSchema,
  TokenCreatedSchema,
  TokenInfoSchema,
  UserSchema,
} from "@sumi/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useApi } from "./helpers";

const api = useApi();

describe("auth", () => {
  it("serves /health without a token", async () => {
    const res = await api().call("GET", "/health", { token: null });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  it.each([
    ["no token", null],
    ["an unknown token", "sumi_nope"],
  ])("rejects %s with 401", async (_name, token) => {
    const res = await api().call("GET", "/me", { token });
    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("unauthenticated");
  });

  it("returns the authenticated user", async () => {
    const res = await api().call("GET", "/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: api().aliceId, kind: "human", name: "Alice" });
  });

  it("returns 404 in the standard shape for unknown routes", async () => {
    const res = await api().call("GET", "/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("not_found");
  });
});

describe("agents", () => {
  it("lets a human create an agent whose token works and is attributed", async () => {
    const created = await api().call("POST", "/agents", { body: { name: "Claude" } });
    expect(created.status).toBe(201);
    const { user, token } = AgentCreatedSchema.parse(created.body);
    expect(user).toMatchObject({ kind: "agent", name: "Claude" });

    const me = await api().call("GET", "/me", { token });
    expect(me.body).toMatchObject({ id: user.id, kind: "agent" });

    const project = await api().call("POST", "/projects", { token, body: { key: "AGT", name: "Agent made" } });
    expect(project.status).toBe(201);
    const log = await api().call("GET", "/activity?projectKey=AGT");
    expect(log.body[0]).toMatchObject({ actorId: user.id, action: "project.created" });
  });

  it("lists users so clients can show names", async () => {
    const res = await api().call("GET", "/users");
    expect(res.status).toBe(200);
    expect(z.array(UserSchema).parse(res.body).map((u) => u.id)).toContain(api().aliceId);
  });

  it("forbids agents from creating agents", async () => {
    const { token } = AgentCreatedSchema.parse(
      (await api().call("POST", "/agents", { body: { name: "Bot" } })).body,
    );
    const res = await api().call("POST", "/agents", { token, body: { name: "Sneaky" } });
    expect(res.status).toBe(403);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("forbidden");
  });

  it("validates the body", async () => {
    const res = await api().call("POST", "/agents", { body: { name: "" } });
    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("validation");
  });
});

describe("projects and tickets", () => {
  it("runs the whole ticket lifecycle", async () => {
    const project = await api().call("POST", "/projects", { body: { key: "FLOW", name: "Flow" } });
    expect(project.status).toBe(201);
    expect(ProjectSchema.parse(project.body).key).toBe("FLOW");
    const projects = await api().call("GET", "/projects");
    expect(z.array(ProjectSchema).parse(projects.body).map((p) => p.key)).toContain("FLOW");

    const created = await api().call("POST", "/tickets", {
      body: { projectKey: "FLOW", title: "First", status: "todo", links: { repo: "acme/sumi", pr: 3 } },
    });
    expect(created.status).toBe(201);
    const ticket = TicketSchema.parse(created.body);
    expect(ticket).toMatchObject({ key: "FLOW-1", status: "todo", links: { repo: "acme/sumi", pr: 3 } });
    expect(ticket.createdAt).toBeInstanceOf(Date);

    const got = await api().call("GET", "/tickets/FLOW-1");
    expect(TicketSchema.parse(got.body)).toEqual(ticket);

    const patched = await api().call("PATCH", "/tickets/FLOW-1", { body: { title: "Renamed", priority: "high" } });
    expect(patched.body).toMatchObject({ title: "Renamed", priority: "high" });

    const moved = await api().call("POST", "/tickets/FLOW-1/move", { body: { status: "in_review" } });
    expect(moved.body.status).toBe("in_review");

    const list = await api().call("GET", "/tickets?projectKey=FLOW&status=in_review");
    expect(z.array(TicketSchema).parse(list.body).map((t) => t.key)).toEqual(["FLOW-1"]);
    const none = await api().call("GET", "/tickets?projectKey=FLOW&status=done");
    expect(none.body).toEqual([]);

    const log = await api().call("GET", "/activity?ticketKey=FLOW-1");
    const entries = z.array(ActivityEntrySchema).parse(log.body);
    expect(entries.map((e) => e.action)).toEqual(["ticket.moved", "ticket.updated", "ticket.created"]);
    expect(entries.every((e) => e.actorId === api().aliceId)).toBe(true);
  });

  it("claims the next todo ticket for the caller, then reports none left", async () => {
    await api().call("POST", "/projects", { body: { key: "CLAIM", name: "Claim" } });
    await api().call("POST", "/tickets", { body: { projectKey: "CLAIM", title: "only", status: "todo" } });
    const { user, token } = AgentCreatedSchema.parse(
      (await api().call("POST", "/agents", { body: { name: "Worker" } })).body,
    );

    const first = await api().call("POST", "/tickets/claim-next", { token, body: { projectKey: "CLAIM" } });
    expect(first.status).toBe(200);
    expect(first.body.ticket).toMatchObject({ key: "CLAIM-1", status: "in_progress", assigneeId: user.id });

    const second = await api().call("POST", "/tickets/claim-next", { token, body: { projectKey: "CLAIM" } });
    expect(second).toEqual({ status: 200, body: { ticket: null } });
  });

  it("limits activity with the limit query", async () => {
    const res = await api().call("GET", "/activity?limit=1");
    expect(res.body).toHaveLength(1);
  });
});

describe("errors", () => {
  it("maps core errors to statuses", async () => {
    await api().call("POST", "/projects", { body: { key: "ERR", name: "Err" } });
    const dup = await api().call("POST", "/projects", { body: { key: "ERR", name: "Again" } });
    expect(dup.status).toBe(409);
    expect(ErrorResponseSchema.parse(dup.body).error.code).toBe("conflict");

    const missing = await api().call("GET", "/tickets/ERR-99");
    expect(missing.status).toBe(404);
    const missingMove = await api().call("POST", "/tickets/ERR-99/move", { body: { status: "done" } });
    expect(missingMove.status).toBe(404);
    const noProject = await api().call("POST", "/tickets", { body: { projectKey: "NONE", title: "x" } });
    expect(noProject.status).toBe(404);
  });

  it("rejects invalid input with 400 in the standard shape", async () => {
    const cases = [
      api().call("POST", "/projects", { body: { key: "bad key", name: "x" } }),
      api().call("POST", "/tickets", { body: { projectKey: "ERR", title: "" } }),
      api().call("POST", "/tickets/ERR-1/move", { body: { status: "nope" } }),
      api().call("PATCH", "/tickets/ERR-1", { body: {} }),
      api().call("GET", "/tickets/not-a-key"),
      api().call("GET", "/tickets"),
      api().call("GET", "/activity?limit=0"),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe("validation");
    }
  });

  it("rejects malformed JSON with 400", async () => {
    // Raw request: the helper always sends valid JSON.
    const { core, token } = api();
    const { createApp } = await import("../src");
    const res = await createApp(core).request("/projects", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /events", () => {
  it("requires a token", async () => {
    const res = await api().call("GET", "/events", { token: null });
    expect(res.status).toBe(401);
  });

  it("streams ready, then one activity event per change", async () => {
    const h = api();
    const res = await h.app.request("/events", { headers: { authorization: `Bearer ${h.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before "${needle}": ${text}`);
        text += decoder.decode(value);
      }
    };

    await until("event: ready");
    await h.call("POST", "/projects", { body: { key: "LIVE", name: "Live" } });
    await until("event: activity");
    const data = /data: (.+)/.exec(text.slice(text.indexOf("event: activity")))?.[1];
    expect(ActivityEntrySchema.parse(JSON.parse(data!))).toMatchObject({
      action: "project.created",
      projectKey: "LIVE",
      actorId: h.aliceId,
    });
    await reader.cancel();
  });
});

describe("tokens", () => {
  it("creates, lists and revokes tokens", async () => {
    const h = api();
    const created = await h.call("POST", "/tokens", { body: {} });
    expect(created.status).toBe(201);
    const token = TokenCreatedSchema.parse(created.body).token;
    expect((await h.call("GET", "/me", { token })).status).toBe(200);

    const listed = await h.call("GET", "/tokens");
    expect(listed.status).toBe(200);
    const infos = z.array(TokenInfoSchema).parse(listed.body);
    expect(infos.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(listed.body)).not.toContain(token);

    const id = infos[0]!.id; // newest: the one just created
    expect((await h.call("DELETE", `/tokens/${id}`)).status).toBe(204);
    expect((await h.call("GET", "/me", { token })).status).toBe(401);
    expect((await h.call("DELETE", `/tokens/${id}`)).status).toBe(404);
  });

  it("manages an agent's tokens", async () => {
    const h = api();
    const agent = AgentCreatedSchema.parse((await h.call("POST", "/agents", { body: { name: "Rotator" } })).body);
    const more = await h.call("POST", "/tokens", { body: { userId: agent.user.id } });
    expect(more.status).toBe(201);
    const listed = z.array(TokenInfoSchema).parse((await h.call("GET", `/tokens?userId=${agent.user.id}`)).body);
    expect(listed).toHaveLength(2);
    for (const t of listed) await h.call("DELETE", `/tokens/${t.id}`);
    expect((await h.call("GET", "/me", { token: agent.token })).status).toBe(401);
  });

  it("is limited to humans and validates ids", async () => {
    const h = api();
    const agent = AgentCreatedSchema.parse((await h.call("POST", "/agents", { body: { name: "Nosy" } })).body);
    expect((await h.call("GET", "/tokens", { token: agent.token })).status).toBe(403);
    expect((await h.call("DELETE", "/tokens/0123456789abcdef", { token: agent.token })).status).toBe(403);
    expect((await h.call("DELETE", "/tokens/nope")).status).toBe(400);
    expect((await h.call("GET", "/tokens?userId=ghost")).status).toBe(404);
    expect((await h.call("GET", "/tokens", { token: null })).status).toBe(401);
  });
});

describe("GET /auth/config", () => {
  it("is public and says GitHub sign-in is off by default", async () => {
    const res = await api().call("GET", "/auth/config", { token: null });
    expect(res).toEqual({ status: 200, body: { github: false } });
  });

  it("does not expose the GitHub routes when it is off", async () => {
    const res = await api().app.request("/auth/github");
    expect(res.status).toBe(401);
  });
});
