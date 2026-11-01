import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  AnwaApp,
  ObservationDenied,
  ok,
  reply,
  type Manifest,
} from "../src/anwa.ts";
import { createOrders } from "../demo/orders/index.ts";

const alice = { caller: { subject: "alice" } } as const;
const bob = { caller: { subject: "bob" } } as const;

test("Discovery is filtered for anonymous callers and visible to authenticated callers", () => {
  const app = createOrders();
  assert.deepEqual(app.catalog().entrypoints, []);
  assert.deepEqual(app.catalog().interactions, []);
  assert.throws(() => app.discover("order.cancel"), /undiscoverable/);
  assert.equal(app.catalog(alice).interactions.length, 3);
  assert.equal(
    app.discover("order.cancel", alice).description.ref,
    "order.cancel",
  );
  assert.equal(app.catalog(bob).interactions.length, 3);
});

test("Query Guards protect private order data from anonymous and other callers", async () => {
  const app = createOrders();
  for (const [request, expected] of [
    [undefined, "AUTH_REQUIRED"],
    [bob, "PERMISSION_DENIED"],
  ] as const) {
    const response = await app.interact(
      "order.get",
      { orderId: "pending" },
      request,
    );
    assert.equal(response.outcome.kind, "settled");
    if (response.outcome.kind === "settled" && !response.outcome.result.ok)
      assert.equal(response.outcome.result.error.code, expected);
    assert.deepEqual(response.context, { next: [] });
  }
  const allowed = await app.interact(
    "order.get",
    { orderId: "pending" },
    alice,
  );
  if (allowed.outcome.kind !== "settled" || !allowed.outcome.result.ok)
    throw Error("Expected success");
  assert.equal(allowed.outcome.result.value.id, "pending");
});

test("Denied mutation does not modify state; guarded Shipment Query rejects other users", async () => {
  const app = createOrders();
  const forbidden = await app.interact(
    "order.cancel",
    { orderId: "pending", reason: "Please" },
    bob,
  );
  if (forbidden.outcome.kind !== "settled" || forbidden.outcome.result.ok)
    throw Error("Expected denial");
  assert.equal(forbidden.outcome.result.error.code, "PERMISSION_DENIED");
  const state = await app.interact("order.get", { orderId: "pending" }, alice);
  if (state.outcome.kind !== "settled" || !state.outcome.result.ok)
    throw Error("Expected state");
  assert.equal(state.outcome.result.value.status, "pending");
  const denied = await app.interact(
    "shipment.track",
    { shipmentId: "shipped-ship" },
    bob,
  );
  if (denied.outcome.kind !== "settled" || denied.outcome.result.ok)
    throw Error("Expected tracking denial");
  assert.equal(denied.outcome.result.error.code, "PERMISSION_DENIED");
  const shipped = await app.interact(
    "order.cancel",
    { orderId: "shipped", reason: "Please" },
    alice,
  );
  assert.equal(shipped.context.next.length, 2);
  const tracking = await app.follow(shipped.context.next[1], alice);
  if (tracking.outcome.kind !== "settled" || !tracking.outcome.result.ok)
    throw Error("Expected tracking");
  assert.equal(tracking.outcome.result.value, "delivered");
});

test("Unguarded Interactions require explicit public declarations and Discovery cannot leak them", async () => {
  const manifest = {
    anwa: "0.2",
    entrypoints: ["public.read"],
    interactions: {
      "public.read": { kind: "query", description: "A public query" },
    },
  } as const satisfies Manifest;
  const app = new AnwaApp(manifest);
  assert.throws(
    () => app.bind({ "public.read": async () => reply(ok("ok")) }, {}),
    /requires a named Guard or explicit public/,
  );
  app.bind(
    { "public.read": async () => reply(ok("ok")) },
    { public: ["public.read"] },
  );
  assert.equal(app.catalog().interactions.length, 1);
  const result = await app.interact("public.read");
  assert.equal(result.outcome.kind, "settled");
  assert.throws(
    () =>
      new AnwaApp(manifest).bind(
        {
          "public.read": async () => reply(ok("ok")),
        },
        { public: ["nonexistent" as "public.read"] },
      ),
    /Undeclared public/,
  );
});

test("Discovery policy failures fail closed and cannot leak guarded Interaction descriptions", () => {
  const manifest = {
    anwa: "0.2",
    entrypoints: ["secure.read"],
    interactions: {
      "secure.read": {
        kind: "query",
        description: "Sensitive description",
        guard: "canRead",
        errors: { AUTH_REQUIRED: "Auth is required" },
      },
    },
  } as const satisfies Manifest;
  const app = new AnwaApp(manifest).bind(
    {
      "secure.read": {
        run: async () => reply(ok("secret")),
        onDenied: () => [],
      },
    },
    {
      guards: {
        canRead: async () => ({
          allowed: false,
          error: { code: "AUTH_REQUIRED" },
        }),
      },
      discoverable: () => {
        throw Error("Policy failure");
      },
    },
  );
  assert.deepEqual(app.catalog(alice).interactions, []);
  assert.throws(() => app.describe("secure.read", alice), /undiscoverable/);
});

test("Event Guards deny subscription before stream execution and accept verified callers", async () => {
  const manifest = {
    anwa: "0.2",
    entrypoints: ["activity.events"],
    interactions: {
      "activity.events": {
        kind: "event",
        description: "Private activity stream",
        guard: "canObserve",
        errors: { AUTH_REQUIRED: "Caller is required" },
      },
    },
  } as const satisfies Manifest;
  let subscribed = 0;
  const app = new AnwaApp(manifest).bind(
    {
      "activity.events": {
        run: async function* () {
          subscribed++;
          yield { kind: "update" };
        },
      },
    },
    {
      discoverable: ({ caller }) => caller !== null,
      guards: {
        canObserve: async ({ caller }) =>
          caller
            ? { allowed: true }
            : { allowed: false, error: { code: "AUTH_REQUIRED" } },
      },
    },
  );
  assert.deepEqual(app.catalog().interactions, []);
  assert.equal(app.catalog(alice).interactions.length, 1);
  const stream = app.observe("activity.events");
  await assert.rejects(
    async () => {
      for await (const event of stream) void event;
    },
    (err: unknown) =>
      err instanceof ObservationDenied && err.code === "AUTH_REQUIRED",
  );
  assert.equal(subscribed, 0);
  const received = [];
  for await (const item of app.observe("activity.events", undefined, {}, alice))
    received.push(item);
  assert.deepEqual(received, [{ kind: "update" }]);
  assert.equal(subscribed, 1);
});

test("Caller identity is not taken from untrusted Interaction input", async () => {
  const app = createOrders();
  const result = await app.follow({
    ref: "order.get",
    input: { orderId: "pending", caller: { subject: "alice" } },
  });
  if (result.outcome.kind !== "settled" || result.outcome.result.ok)
    throw Error("Expected validation failure");
  assert.equal(result.outcome.result.error.code, "INVALID_INPUT");
  await assert.rejects(
    async () =>
      app.interact(
        "order.get",
        { orderId: "pending" },
        { caller: { subject: "" } },
      ),
    /Invalid verified Caller/,
  );
});
