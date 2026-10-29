import { fileURLToPath } from "node:url";
import { createClient } from "@sumi/client";
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
  it("exposes a small, documented tool set", async () => {
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "claim_next_ticket",
      "create_ticket",
      "get_ticket",
      "list_projects",
      "list_tickets",
      "move_ticket",
      "update_ticket",
      "whoami",
    ]);
    for (const t of tools) expect(t.description, t.name).toBeTruthy();
  });

  it("whoami and list_projects", async () => {
    expect((await call(mcp, "whoami")).data).toMatchObject({ name: "Tester", kind: "human" });
    const api = createClient({ url, token });
    await api.createProject({ key: "MCPA", name: "MCP A" });
    expect((await call(mcp, "list_projects")).data).toContainEqual({ key: "MCPA", name: "MCP A" });
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
