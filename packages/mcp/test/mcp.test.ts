import { fileURLToPath } from "node:url";
import { createClient, OPERATIONS } from "@sumi/client";
import { DEFAULT_LANES } from "@sumi/contract";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createServer } from "../src/server";

const url = inject("apiUrl");
const token = inject("apiToken");

async function connect(tokenOverride = token): Promise<McpClient> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(createClient({ url, token: tokenOverride })).connect(serverSide);
  const mcp = new McpClient({ name: "test", version: "0" });
  await mcp.connect(clientSide);
  return mcp;
}

type Content = { type: string; text?: string }[];

/** Calls a tool and returns the parsed JSON payload; fails the test if the tool errored. */
async function call(mcp: McpClient, name: string, args: Record<string, unknown> = {}) {
  const res = await mcp.callTool({ name, arguments: args });
  const text = (res.content as Content)[0]?.text ?? "";
  return { isError: res.isError === true, text, data: res.isError ? undefined : JSON.parse(text) };
}

let mcp: McpClient;
beforeAll(async () => {
  mcp = await connect();
});
afterAll(async () => {
  await mcp.close();
});

describe("tools", () => {
  it("describes every tool", async () => {
    // Which tools exist is pinned by the parity tests below.
    const { tools } = await mcp.listTools();
    for (const t of tools) expect(t.description, t.name).toBeTruthy();
  });

  it("whoami and list_projects", async () => {
    expect((await call(mcp, "whoami")).data).toMatchObject({ name: "Tester", kind: "human" });
    const api = createClient({ url, token });
    await api.createProject({ key: "MCPA", name: "MCP A" });
    expect((await call(mcp, "list_projects")).data).toContainEqual({
      key: "MCPA",
      name: "MCP A",
      lanes: DEFAULT_LANES,
    });
  });

  it("creates, gets, lists, updates and moves tickets with concise output", async () => {
    await createClient({ url, token }).createProject({ key: "MCPB", name: "MCP B" });

    const created = await call(mcp, "create_ticket", {
      projectKey: "MCPB",
      title: "First",
      description: "Acceptance: it works",
      priority: "high",
      links: { repo: "acme/sumi" },
    });
    expect(created.data).toEqual({
      key: "MCPB-1",
      title: "First",
      status: "backlog",
      priority: "high",
      links: { repo: "acme/sumi" },
      description: "Acceptance: it works",
    });

    expect((await call(mcp, "get_ticket", { key: "MCPB-1" })).data).toEqual(created.data);

    const listed = await call(mcp, "list_tickets", { projectKey: "MCPB" });
    expect(listed.data).toEqual([
      { key: "MCPB-1", title: "First", status: "backlog", priority: "high", links: { repo: "acme/sumi" } },
    ]);
    expect((await call(mcp, "list_tickets", { projectKey: "MCPB", status: "done" })).data).toEqual([]);

    const moved = await call(mcp, "move_ticket", { key: "MCPB-1", status: "in_review" });
    expect(moved.data).toMatchObject({ key: "MCPB-1", status: "in_review" });
    expect(moved.data).not.toHaveProperty("description");
  });

  it("merges links on update and clears fields with null", async () => {
    await createClient({ url, token }).createProject({ key: "MCPC", name: "MCP C" });
    const me = (await call(mcp, "whoami")).data;
    await call(mcp, "create_ticket", {
      projectKey: "MCPC",
      title: "t",
      priority: "low",
      assigneeId: me.id,
      links: { repo: "acme/sumi", pr: 1 },
    });

    const merged = await call(mcp, "update_ticket", { key: "MCPC-1", links: { branch: "feat/x", pr: 2 } });
    expect(merged.data.links).toEqual({ repo: "acme/sumi", branch: "feat/x", pr: 2 });
    expect(merged.data).toMatchObject({ priority: "low", assigneeId: me.id });

    const cleared = await call(mcp, "update_ticket", { key: "MCPC-1", assigneeId: null, priority: null, title: "renamed" });
    expect(cleared.data.title).toBe("renamed");
    expect(cleared.data).not.toHaveProperty("assigneeId");
    expect(cleared.data).not.toHaveProperty("priority");
  });

  it("claims the next ticket for the calling agent, then reports none", async () => {
    const api = createClient({ url, token });
    await api.createProject({ key: "MCPD", name: "MCP D" });
    await api.createTicket({ projectKey: "MCPD", title: "ready", status: "todo" });
    const agent = await api.createAgent("Worker");
    const agentMcp = await connect(agent.token);
    try {
      const claimed = await call(agentMcp, "claim_next_ticket", { projectKey: "MCPD" });
      expect(claimed.data.ticket).toMatchObject({ key: "MCPD-1", status: "in_progress", assigneeId: agent.user.id });
      expect((await call(agentMcp, "claim_next_ticket", { projectKey: "MCPD" })).data).toEqual({ ticket: null });
    } finally {
      await agentMcp.close();
    }
  });
});

describe("comments", () => {
  it("adds comments as the calling user and shows them in get_ticket", async () => {
    const api = createClient({ url, token });
    await api.createProject({ key: "MCPE", name: "MCP E" });
    await api.createTicket({ projectKey: "MCPE", title: "talk" });
    expect(await call(mcp, "get_ticket", { key: "MCPE-1" })).toMatchObject({ data: expect.not.objectContaining({ comments: expect.anything() }) });

    const me = (await call(mcp, "whoami")).data;
    const added = await call(mcp, "add_comment", { key: "MCPE-1", body: "Started" });
    expect(added.data).toMatchObject({ ticketKey: "MCPE-1" });
    expect(added.data).not.toHaveProperty("body");

    const got = await call(mcp, "get_ticket", { key: "MCPE-1" });
    expect(got.data.comments).toEqual([expect.objectContaining({ authorId: me.id, body: "Started" })]);
    expect((await call(mcp, "add_comment", { key: "MCPE-9", body: "x" })).isError).toBe(true);
  });
});

describe("lanes", () => {
  const laneIds = (data: { lanes: { id: string }[] }) => data.lanes.map((l) => l.id).join(" ");

  it("adds, renames, moves and removes lanes", async () => {
    await createClient({ url, token }).createProject({ key: "MCPL", name: "MCP lanes" });
    const added = await call(mcp, "add_lane", { projectKey: "MCPL", name: "QA" });
    expect(laneIds(added.data)).toBe("backlog todo in_progress in_review done qa");
    expect(laneIds((await call(mcp, "add_lane", { projectKey: "MCPL", name: "Icebox", position: 1 })).data)).toBe(
      "icebox backlog todo in_progress in_review done qa",
    );
    const renamed = await call(mcp, "rename_lane", { projectKey: "MCPL", laneId: "todo", name: "Ready" });
    expect(renamed.data.lanes).toContainEqual({ id: "todo", name: "Ready" });
    expect(laneIds((await call(mcp, "move_lane", { projectKey: "MCPL", laneId: "qa", position: 2 })).data)).toBe(
      "icebox qa backlog todo in_progress in_review done",
    );
    expect(laneIds((await call(mcp, "remove_lane", { projectKey: "MCPL", laneId: "icebox" })).data)).toBe(
      "qa backlog todo in_progress in_review done",
    );
    const listed = (await call(mcp, "list_projects")).data.find((p: { key: string }) => p.key === "MCPL");
    expect(laneIds(listed)).toBe("qa backlog todo in_progress in_review done");
  });

  it("explains why an edit is refused", async () => {
    await createClient({ url, token }).createProject({ key: "MCPM", name: "MCP lanes 2" });
    await call(mcp, "create_ticket", { projectKey: "MCPM", title: "stuck", status: "todo" });
    expect(await call(mcp, "remove_lane", { projectKey: "MCPM", laneId: "todo" })).toMatchObject({
      isError: true,
      text: "Lane Todo still has 1 ticket; move them first",
    });
    expect((await call(mcp, "rename_lane", { projectKey: "MCPM", laneId: "nope", name: "X" })).text).toContain("has no lane nope");
    expect((await call(mcp, "move_lane", { projectKey: "MCPM", laneId: "todo", position: 0 })).isError).toBe(true);
  });
});

describe("users and activity", () => {
  it("lists users with id, name and kind", async () => {
    const me = (await call(mcp, "whoami")).data;
    const users = (await call(mcp, "list_users")).data;
    expect(users).toContainEqual({ id: me.id, name: "Tester", kind: "human" });
  });

  it("lists activity concisely, newest first, with filters", async () => {
    const api = createClient({ url, token });
    await api.createProject({ key: "MCPN", name: "MCP activity" });
    await api.createTicket({ projectKey: "MCPN", title: "one" });
    await api.moveTicket("MCPN-1", { status: "done" });
    const me = (await call(mcp, "whoami")).data;

    const log = (await call(mcp, "list_activity", { projectKey: "MCPN" })).data;
    expect(log.map((e: { action: string }) => e.action)).toEqual(["ticket.moved", "ticket.created", "project.created"]);
    expect(log[0]).toMatchObject({ actorId: me.id, ticketKey: "MCPN-1", data: { from: "backlog", to: "done" } });
    expect(log[0]).not.toHaveProperty("projectKey");
    expect(log[2]).toMatchObject({ projectKey: "MCPN" });
    expect((await call(mcp, "list_activity", { ticketKey: "MCPN-1", limit: 1 })).data).toHaveLength(1);
  });
});

describe("parity with the client", () => {
  const entries = Object.entries(OPERATIONS).flatMap(([op, { mcp }]) => (typeof mcp === "string" ? [[op, mcp] as const] : []));

  it.each(entries)("%s is the tool %s", async (_op, tool) => {
    const names = (await mcp.listTools()).tools.map((t) => t.name);
    expect(names).toContain(tool);
  });

  it("has no tool that the table does not know", async () => {
    const known = new Set(Object.values(OPERATIONS).flatMap(({ mcp }) => (typeof mcp === "string" ? [mcp] : [])));
    const names = (await mcp.listTools()).tools.map((t) => t.name);
    expect(names.filter((n) => !known.has(n))).toEqual([]);
  });
});

describe("errors", () => {
  it("returns API failures as tool errors the agent can read", async () => {
    const missing = await call(mcp, "get_ticket", { key: "NOPE-1" });
    expect(missing).toMatchObject({ isError: true, text: "Ticket NOPE-1 not found" });
    const noProject = await call(mcp, "create_ticket", { projectKey: "NOPE", title: "x" });
    expect(noProject).toMatchObject({ isError: true, text: "Project NOPE not found" });
  });

  it("rejects invalid arguments before calling the API", async () => {
    const badStatus = await call(mcp, "move_ticket", { key: "MCPB-1", status: "nope" });
    expect(badStatus.isError).toBe(true);
    const badKey = await call(mcp, "get_ticket", { key: "not-a-key" });
    expect(badKey.isError).toBe(true);
  });

  it("reports a bad token as a tool error", async () => {
    const bad = await connect("sumi_wrong");
    try {
      expect(await call(bad, "whoami")).toMatchObject({ isError: true, text: "Missing or invalid token" });
    } finally {
      await bad.close();
    }
  });
});

describe("stdio entry point", () => {
  it("serves the tools over stdio with config from the environment", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("../src/main.ts", import.meta.url))],
      env: { PATH: process.env.PATH ?? "", SUMI_URL: url, SUMI_TOKEN: token },
      stderr: "pipe",
    });
    const stdio = new McpClient({ name: "test", version: "0" });
    await stdio.connect(transport);
    try {
      expect((await call(stdio, "whoami")).data).toMatchObject({ name: "Tester" });
    } finally {
      await stdio.close();
    }
  });

  it("exits with a clear message when SUMI_TOKEN is missing", async () => {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/main.ts", import.meta.url))], {
      // Empty, not absent: main.ts loads the repo's .env, which must not supply a token here.
      env: { PATH: process.env.PATH ?? "", SUMI_TOKEN: "" },
      encoding: "utf8",
    });
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("SUMI_TOKEN is not set");
  });
});
