import { zValidator } from "@hono/zod-validator";
import {
  ClaimNextInputSchema,
  CreateAgentInputSchema,
  CreateProjectInputSchema,
  CreateTicketInputSchema,
  ListActivityInputSchema,
  ListTicketsInputSchema,
  MoveTicketInputSchema,
  TicketKeySchema,
  UpdateTicketInputSchema,
  type ErrorCode,
  type ErrorResponse,
  type User,
} from "@sumi/contract";
import { SumiError, type Core } from "@sumi/core";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

type Env = { Variables: { user: User } };

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 500> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  internal: 500,
};

function fail(c: Context, code: ErrorCode, message: string) {
  const body: ErrorResponse = { error: { code, message } };
  return c.json(body, STATUS[code]);
}

/** Validates with a contract schema and reports failures in the standard error shape. */
const validate = <Target extends "json" | "query" | "param", S extends z.ZodType>(target: Target, schema: S) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
      return fail(c, "validation", message);
    }
  });

const PING_MS = 25_000;

const KeyParamSchema = z.object({ key: TicketKeySchema });

export function createApp(core: Core) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof SumiError) return fail(c, err.code, err.message);
    // Hono raises 400 for unparseable request bodies (e.g. malformed JSON).
    if (err instanceof HTTPException && err.status === 400) return fail(c, "validation", err.message);
    console.error(err);
    return fail(c, "internal", "Internal server error");
  });
  app.notFound((c) => fail(c, "not_found", "Route not found"));

  app.get("/health", (c) => c.json({ ok: true }));

  // Everything below requires `Authorization: Bearer <token>`.
  app.use("*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = /^Bearer (.+)$/i.exec(header)?.[1];
    const user = token ? await core.tokens.authenticate(token) : null;
    if (!user) return fail(c, "unauthenticated", "Missing or invalid token");
    c.set("user", user);
    await next();
  });

  app.get("/me", (c) => c.json(c.get("user")));

  app.get("/users", async (c) => c.json(await core.users.list()));

  app.post("/agents", validate("json", CreateAgentInputSchema), async (c) => {
    const created = await core.users.createAgent(c.get("user").id, c.req.valid("json"));
    return c.json(created, 201);
  });

  app.get("/projects", async (c) => c.json(await core.projects.list()));

  app.post("/projects", validate("json", CreateProjectInputSchema), async (c) => {
    const project = await core.projects.create(c.get("user").id, c.req.valid("json"));
    return c.json(project, 201);
  });

  app.get("/tickets", validate("query", ListTicketsInputSchema), async (c) =>
    c.json(await core.tickets.list(c.req.valid("query"))),
  );

  app.post("/tickets", validate("json", CreateTicketInputSchema), async (c) => {
    const ticket = await core.tickets.create(c.get("user").id, c.req.valid("json"));
    return c.json(ticket, 201);
  });

  // Registered before "/tickets/:key" routes so "claim-next" is never read as a key.
  app.post("/tickets/claim-next", validate("json", ClaimNextInputSchema), async (c) => {
    const ticket = await core.tickets.claimNext(c.get("user").id, c.req.valid("json"));
    return c.json({ ticket });
  });

  app.get("/tickets/:key", validate("param", KeyParamSchema), async (c) => {
    const { key } = c.req.valid("param");
    const ticket = await core.tickets.get(key);
    return ticket ? c.json(ticket) : fail(c, "not_found", `Ticket ${key} not found`);
  });

  app.patch("/tickets/:key", validate("param", KeyParamSchema), validate("json", UpdateTicketInputSchema), async (c) => {
    const { key } = c.req.valid("param");
    return c.json(await core.tickets.update(c.get("user").id, key, c.req.valid("json")));
  });

  app.post("/tickets/:key/move", validate("param", KeyParamSchema), validate("json", MoveTicketInputSchema), async (c) => {
    const { key } = c.req.valid("param");
    return c.json(await core.tickets.move(c.get("user").id, key, c.req.valid("json")));
  });

  app.get("/activity", validate("query", ListActivityInputSchema), async (c) =>
    c.json(await core.activity.list(c.req.valid("query"))),
  );

  /**
   * Server-sent events: one `activity` event (an ActivityEntry as JSON) per change,
   * for every project. `ready` is sent once the subscription is live; a client that
   * (re)connects should reload its data after `ready`, since events are not replayed.
   * `ping` keeps idle connections open through proxies.
   */
  app.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      let end!: () => void;
      const ended = new Promise<void>((resolve) => (end = resolve));
      stream.onAbort(end);

      const stop = await core.activity.subscribe(
        (entry) => void stream.writeSSE({ event: "activity", data: JSON.stringify(entry) }).catch(end),
        (err) => {
          console.error(err);
          end(); // closing makes the client reconnect, which resubscribes
        },
      );
      try {
        await stream.writeSSE({ event: "ready", data: "" });
        const timer = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }).catch(end), PING_MS);
        try {
          await ended;
        } finally {
          clearInterval(timer);
        }
      } finally {
        await stop();
      }
    }),
  );

  return app;
}

export type App = ReturnType<typeof createApp>;
