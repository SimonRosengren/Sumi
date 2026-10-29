import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "../src";
import { hashToken } from "../src/tokens";
import { useCore } from "./helpers";

const core = useCore();

describe("tokens", () => {
  it("lets a human create a token for themselves and authenticate with it", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const token = await core().tokens.create(alice.id, alice.id);
    expect(token).toMatch(/^sumi_[\w-]{43}$/);
    expect(await core().tokens.authenticate(token)).toEqual(alice);
  });

  it("rejects unknown tokens", async () => {
    expect(await core().tokens.authenticate("sumi_unknown")).toBeNull();
    expect(await core().tokens.authenticate("")).toBeNull();
  });

  it("is limited to humans, and the target must exist", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user: bot } = await core().users.createAgent(alice.id, { name: "Bot" });
    await expect(core().tokens.create(bot.id, bot.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(core().tokens.create("ghost", alice.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().tokens.create(alice.id, "ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records who created the token", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user: bot } = await core().users.createAgent(alice.id, { name: "Bot" });
    await core().tokens.create(alice.id, bot.id);
    const [entry] = await core().activity.list({ limit: 1 });
    expect(entry).toMatchObject({ actorId: alice.id, action: "token.created", data: { userId: bot.id } });
    expect(entry?.projectKey).toBeUndefined();
  });
});

describe("createAgent", () => {
  it("creates an agent user with a working token and logs it", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user, token } = await core().users.createAgent(alice.id, { name: "Claude" });
    expect(user).toMatchObject({ kind: "agent", name: "Claude" });
    expect(await core().tokens.authenticate(token)).toEqual(user);
    const [entry] = await core().activity.list({ limit: 1 });
    expect(entry).toMatchObject({ actorId: alice.id, action: "agent.created", data: { agentId: user.id } });
  });

  it("is limited to humans and validates the name", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user: bot } = await core().users.createAgent(alice.id, { name: "Bot" });
    await expect(core().users.createAgent(bot.id, { name: "Other" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(core().users.createAgent("ghost", { name: "Other" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().users.createAgent(alice.id, { name: " " })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("list and revoke", () => {
  it("lists a user's tokens without secrets, and revoking one stops it working", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const keep = await core().tokens.create(alice.id, alice.id);
    const lost = await core().tokens.create(alice.id, alice.id);

    const listed = await core().tokens.list(alice.id);
    expect(listed).toHaveLength(2);
    expect(listed.every((t) => t.userId === alice.id && /^[0-9a-f]{16}$/.test(t.id))).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(keep);

    const lostId = (await core().tokens.list(alice.id)).find((t) => hashToken(lost).startsWith(t.id))!.id;
    await core().tokens.revoke(alice.id, lostId);
    expect(await core().tokens.authenticate(lost)).toBeNull();
    expect(await core().tokens.authenticate(keep)).toEqual(alice);
    expect(await core().tokens.list(alice.id)).toHaveLength(1);

    const [entry] = await core().activity.list({ limit: 1 });
    expect(entry).toMatchObject({
      actorId: alice.id,
      action: "token.revoked",
      data: { userId: alice.id, tokenId: lostId },
    });
  });

  it("lets a human list and revoke an agent's tokens", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user: bot, token } = await core().users.createAgent(alice.id, { name: "Bot" });
    const [info] = await core().tokens.list(alice.id, bot.id);
    await core().tokens.revoke(alice.id, info!.id);
    expect(await core().tokens.authenticate(token)).toBeNull();
  });

  it("is limited to humans and rejects unknown or malformed ids", async () => {
    const alice = await core().users.create({ kind: "human", name: "Alice" });
    const { user: bot } = await core().users.createAgent(alice.id, { name: "Bot" });
    await expect(core().tokens.list(bot.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(core().tokens.list(alice.id, "ghost")).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().tokens.revoke(bot.id, "0123456789abcdef")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(core().tokens.revoke(alice.id, "0123456789abcdef")).rejects.toBeInstanceOf(NotFoundError);
    await expect(core().tokens.revoke(alice.id, ".*")).rejects.toBeInstanceOf(ValidationError);
  });
});
