import {
  ActivityEntrySchema,
  AgentCreatedSchema,
  ProjectSchema,
  TicketSchema,
  TokenInfoSchema,
  UserSchema,
} from "@sumi/contract";
import { describe, expect, it, inject } from "vitest";
import { z } from "zod";
import { run } from "../src/cli";

interface Result {
  code: number;
  out: string;
  err: string;
}

async function sumi(args: string[], env: Record<string, string | undefined> = {}): Promise<Result> {
  let out = "";
  let err = "";
  const code = await run(args, {
    env: { SUMI_URL: inject("apiUrl"), SUMI_TOKEN: inject("apiToken"), ...env },
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
  });
  return { code, out, err };
}

/** Runs with --json and parses stdout with a contract schema. */
async function sumiJson<S extends z.ZodType>(schema: S, args: string[], env?: Record<string, string | undefined>) {
  const res = await sumi(["--json", ...args], env);
  expect(res.err).toBe("");
  expect(res.code).toBe(0);
  return schema.parse(JSON.parse(res.out)) as z.output<S>;
}

describe("configuration", () => {
  it("explains a missing token", async () => {
    const res = await sumi(["whoami"], { SUMI_TOKEN: "" });
    expect(res.code).toBe(1);
    expect(res.err).toContain("SUMI_TOKEN is not set");
    expect(res.out).toBe("");
  });

  it("reports an invalid token as an API error", async () => {
    const res = await sumi(["whoami"], { SUMI_TOKEN: "sumi_wrong" });
    expect(res).toMatchObject({ code: 1, err: "error: Missing or invalid token\n" });
  });

  it("reports an unreachable API", async () => {
    const res = await sumi(["whoami"], { SUMI_URL: "http://localhost:1" });
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/^error: Cannot reach the API at http:\/\/localhost:1/);
  });

  it("prints errors as JSON on stderr with --json", async () => {
    const res = await sumi(["--json", "whoami"], { SUMI_TOKEN: "sumi_wrong" });
    expect(res.code).toBe(1);
    expect(res.out).toBe("");
    expect(JSON.parse(res.err)).toEqual({ error: { code: "unauthenticated", message: "Missing or invalid token" } });
  });

  it("shows help without needing a token", async () => {
    const res = await sumi(["ticket", "--help"], { SUMI_TOKEN: "" });
    expect(res.code).toBe(0);
    expect(res.out).toContain("claim");
  });
});

describe("whoami and agents", () => {
  it("shows the token's user", async () => {
    const user = await sumiJson(UserSchema, ["whoami"]);
    expect(user).toMatchObject({ name: "Tester", kind: "human" });
    const text = await sumi(["whoami"]);
    expect(text.out).toBe(`Tester (human)  ${user.id}\n`);
  });

  it("creates an agent whose token works and is attributed", async () => {
    const { user, token } = await sumiJson(AgentCreatedSchema, ["agent", "create", "Claude"]);
    expect(user).toMatchObject({ kind: "agent", name: "Claude" });
    const me = await sumiJson(UserSchema, ["whoami"], { SUMI_TOKEN: token });
    expect(me.id).toBe(user.id);

    const denied = await sumi(["agent", "create", "Sneaky"], { SUMI_TOKEN: token });
    expect(denied.code).toBe(1);
    expect(denied.err).toContain("Only humans");
  });
});

describe("tokens", () => {
  it("rotates an agent's token: create, list, revoke", async () => {
    const { user, token: first } = await sumiJson(AgentCreatedSchema, ["agent", "create", "Rotating"]);
    const { token: second } = await sumiJson(z.object({ token: z.string() }), ["token", "create", "--user", user.id]);
    expect((await sumi(["token", "create", "--user", user.id])).out).toMatch(/^Token \(shown once\): sumi_/);

    const listed = await sumiJson(z.array(TokenInfoSchema), ["token", "list", "--user", user.id]);
    expect(listed).toHaveLength(3);
    const text = await sumi(["token", "list", "--user", user.id]);
    expect(text.out).toContain(listed[0]!.id);
    expect(text.out).not.toContain(second);

    for (const t of listed) {
      expect((await sumi(["token", "revoke", t.id])).out).toBe(`Revoked ${t.id}\n`);
    }
    for (const token of [first, second]) {
      expect((await sumi(["whoami"], { SUMI_TOKEN: token })).err).toContain("Missing or invalid token");
    }
    expect((await sumi(["token", "list", "--user", user.id])).out).toBe("No tokens\n");
  });

  it("explains a token id that does not exist", async () => {
    expect((await sumi(["token", "revoke", "0123456789abcdef"])).err).toContain("not found");
  });
});

describe("projects and tickets", () => {
  it("runs the whole lifecycle in text and JSON", async () => {
    const created = await sumi(["project", "create", "CLI", "CLI tests"]);
    expect(created).toMatchObject({ code: 0, out: "Created CLI  CLI tests\n" });
    const projects = await sumiJson(z.array(ProjectSchema), ["project", "list"]);
    expect(projects.map((p) => p.key)).toContain("CLI");
    expect((await sumi(["project", "list"])).out).toContain("CLI  CLI tests");

    const t1 = await sumiJson(TicketSchema, [
      "ticket", "create", "CLI", "First ticket",
      "--description", "Some **markdown**", "--status", "todo", "--priority", "high",
      "--repo", "acme/sumi", "--branch", "feat/x", "--pr", "7",
    ]);
    expect(t1).toMatchObject({
      key: "CLI-1",
      status: "todo",
      priority: "high",
      description: "Some **markdown**",
      links: { repo: "acme/sumi", branch: "feat/x", pr: 7 },
    });
    await sumi(["ticket", "create", "CLI", "Second ticket"]);

    const got = await sumiJson(TicketSchema, ["ticket", "get", "CLI-1"]);
    expect(got).toEqual(t1);
    const detail = (await sumi(["ticket", "get", "CLI-1"])).out;
    expect(detail).toContain("CLI-1  First ticket");
    expect(detail).toContain("pr:       #7");
    expect(detail).toContain("Some **markdown**");

    const list = (await sumi(["ticket", "list", "CLI"])).out.trimEnd().split("\n");
    expect(list).toEqual([
      "CLI-1  todo         high    First ticket",
      "CLI-2  backlog      -       Second ticket",
    ]);
    const todos = await sumiJson(z.array(TicketSchema), ["ticket", "list", "CLI", "--status", "todo"]);
    expect(todos.map((t) => t.key)).toEqual(["CLI-1"]);
    expect((await sumi(["ticket", "list", "CLI", "--status", "done"])).out).toBe("No tickets\n");

    const moved = await sumiJson(TicketSchema, ["ticket", "move", "CLI-2", "in_review"]);
    expect(moved.status).toBe("in_review");

    const log = await sumiJson(z.array(ActivityEntrySchema), ["activity", "--ticket", "CLI-2"]);
    expect(log.map((e) => e.action)).toEqual(["ticket.moved", "ticket.created"]);
    const limited = await sumiJson(z.array(ActivityEntrySchema), ["activity", "--project", "CLI", "--limit", "1"]);
    expect(limited).toHaveLength(1);
  });

  it("updates only the given fields and clears with none", async () => {
    await sumi(["project", "create", "UPD", "Update"]);
    const me = await sumiJson(UserSchema, ["whoami"]);
    await sumi([
      "ticket", "create", "UPD", "Old", "--description", "keep", "--priority", "low",
      "--assignee", me.id, "--repo", "acme/sumi", "--pr", "1",
    ]);

    const renamed = await sumiJson(TicketSchema, ["ticket", "update", "UPD-1", "--title", "New"]);
    expect(renamed).toMatchObject({ title: "New", description: "keep", priority: "low", assigneeId: me.id });

    const cleared = await sumiJson(TicketSchema, ["ticket", "update", "UPD-1", "--assignee", "none", "--priority", "none"]);
    expect(cleared.assigneeId).toBeUndefined();
    expect(cleared.priority).toBeUndefined();
    expect(cleared.title).toBe("New");
  });

  it("merges link options into the existing links instead of replacing them", async () => {
    await sumi(["project", "create", "LNK", "Links"]);
    await sumi(["ticket", "create", "LNK", "t", "--repo", "acme/sumi", "--pr", "1"]);
    const updated = await sumiJson(TicketSchema, ["ticket", "update", "LNK-1", "--branch", "feat/y", "--pr", "2"]);
    expect(updated.links).toEqual({ repo: "acme/sumi", branch: "feat/y", pr: 2 });
  });

  it("claims the next todo ticket for the caller, then reports none", async () => {
    await sumi(["project", "create", "CLM", "Claim"]);
    await sumi(["ticket", "create", "CLM", "backlog one"]);
    await sumi(["ticket", "create", "CLM", "todo one", "--status", "todo"]);
    const { user, token } = await sumiJson(AgentCreatedSchema, ["agent", "create", "Worker"]);

    const claimed = await sumiJson(z.object({ ticket: TicketSchema.nullable() }), ["ticket", "claim", "CLM"], {
      SUMI_TOKEN: token,
    });
    expect(claimed.ticket).toMatchObject({ key: "CLM-2", status: "in_progress", assigneeId: user.id });

    const none = await sumi(["ticket", "claim", "CLM"], { SUMI_TOKEN: token });
    expect(none).toMatchObject({ code: 0, out: "No ticket available\n" });
    const noneJson = await sumi(["--json", "ticket", "claim", "CLM"], { SUMI_TOKEN: token });
    expect(JSON.parse(noneJson.out)).toEqual({ ticket: null });
  });
});

describe("errors", () => {
  it("reports API errors as a single line and exit code 1", async () => {
    const missing = await sumi(["ticket", "get", "NOPE-1"]);
    expect(missing).toMatchObject({ code: 1, out: "", err: "error: Ticket NOPE-1 not found\n" });

    await sumi(["project", "create", "DUP", "Dup"]);
    const dup = await sumi(["project", "create", "DUP", "Again"]);
    expect(dup).toMatchObject({ code: 1, err: "error: Project DUP already exists\n" });

    const badKey = await sumi(["project", "create", "bad key", "x"]);
    expect(badKey.code).toBe(1);
    expect(badKey.err).toContain("key:");
  });

  it("rejects bad usage before calling the API", async () => {
    const cases = [
      ["ticket", "move", "CLI-1", "nope"],
      ["ticket", "create", "CLI", "x", "--pr", "abc"],
      ["ticket", "create", "CLI", "x", "--priority", "urgent"],
      ["ticket", "list"],
      ["activity", "--limit", "0"],
      ["bogus"],
    ];
    for (const args of cases) {
      const res = await sumi(args);
      expect(res.code, args.join(" ")).toBe(1);
      expect(res.out).toBe("");
      expect(res.err).not.toBe("");
    }
  });
});
