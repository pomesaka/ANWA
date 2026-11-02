/** Authentication is adapter-owned; disclosure, resource access and observation are separate contracts. */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  createAnwaApp,
  isObservationDenied,
  ok,
  reply,
  type Manifest,
  type RequestContext,
} from "../src/anwa.ts";
import { createOrders } from "../demo/orders/index.ts";
import { success, failure } from "./support/outcome.ts";
const alice = { caller: { subject: "alice" } } as const;
const bob = { caller: { subject: "bob" } } as const;
const refs = ["order.get", "order.cancel", "shipment.track"];

const callers = [
  { name: "anonymous", caller: undefined, code: "AUTH_REQUIRED", visible: [] },
  {
    name: "authenticated non-owner",
    caller: bob,
    code: "PERMISSION_DENIED",
    visible: refs,
  },
  { name: "owner", caller: alice, code: null, visible: refs },
] satisfies Array<{
  name: string;
  caller: RequestContext | undefined;
  code: string | null;
  visible: string[];
}>;

describe("DISCOVERY — publishing names does not grant access to a resource", () => {
  test.each(callers)(
    "$name sees exactly the permitted descriptions",
    ({ caller, visible }) => {
      const app = createOrders();
      assert.deepEqual(
        app.catalog(caller).interactions.map((op) => op.ref),
        visible,
      );
      if (visible.length === 0)
        assert.throws(
          () => app.discover("order.cancel", caller),
          /undiscoverable/,
        );
      else
        assert.equal(
          app.discover("order.cancel", caller).description.ref,
          "order.cancel",
        );
    },
  );
  test.each([
    { name: "explicit false", policy: () => false, visible: false },
    {
      name: "policy throws",
      policy: () => {
        throw Error("secret");
      },
      visible: false,
    },
    { name: "explicit true", policy: () => true, visible: true },
  ])("$name determines coarse disclosure", ({ policy, visible }) => {
    const doc = {
      anwa: "0.2",
      entrypoints: ["secure.read"],
      interactions: {
        "secure.read": {
          kind: "query",
          description: "Private read",
          guard: "check",
          errors: { DENIED: "Denied" },
        },
      },
    } as const;
    const app = createAnwaApp(doc).bind(
      { "secure.read": { run: () => reply(ok("secret")), onDenied: () => [] } },
      {
        guards: {
          check: () => ({ allowed: false, error: { code: "DENIED" } }),
        },
        discoverable: policy,
      },
    );
    assert.deepEqual(
      app.catalog(alice).entrypoints,
      visible ? ["secure.read"] : [],
    );
    if (visible)
      assert.equal(app.describe("secure.read", alice).ref, "secure.read");
    else
      assert.throws(() => app.describe("secure.read", alice), /undiscoverable/);
  });
});

describe("AUTH — Query, Action and follow-up access are caller-scoped", () => {
  const operations = [
    {
      name: "read order",
      ref: "order.get",
      input: { orderId: "pending" },
      value: { id: "pending", status: "pending" },
    },
    {
      name: "cancel order",
      ref: "order.cancel",
      input: { orderId: "pending", reason: "Please" },
      value: { status: "cancelled" },
    },
    {
      name: "track shipment",
      ref: "shipment.track",
      input: { shipmentId: "shipped-ship" },
      value: "delivered",
    },
  ];
  const cases = operations.flatMap((operation) =>
    callers.map((caller) => ({
      ...operation,
      ...caller,
      name: `${caller.name}: ${operation.name}`,
    })),
  );
  test.each(cases)("$name", async ({ ref, input, caller, code, value }) => {
    const app = createOrders();
    const response = await app.follow({ ref, input }, caller);
    if (code === null) assert.deepEqual(success(response), value);
    else {
      failure(response, code);
      assert.deepEqual(response.context.next, []);
    }
    const expectedState =
      ref === "order.cancel" && code === null ? "cancelled" : "pending";
    assert.equal(
      success(await app.interact("order.get", { orderId: "pending" }, alice))
        .status,
      expectedState,
    );
  });
  test.each(callers.filter((row) => row.code !== null))(
    "a next candidate does not authorize $name",
    async ({ caller, code }) => {
      const app = createOrders();
      const refusal = await app.interact(
        "order.cancel",
        { orderId: "shipped", reason: "Please" },
        alice,
      );
      failure(refusal, "ORDER_ALREADY_SHIPPED");
      const tracking = refusal.context.next.find(
        (next) => next.ref === "shipment.track",
      );
      assert.ok(tracking, "the owner receives a tracking continuation");
      failure(await app.follow(tracking, caller), code!);
    },
  );
});

describe("TRUST — only the separate trusted context establishes identity", () => {
  test("caller in application input is rejected without exposing private data", async () => {
    const app = createOrders();
    const response = await app.follow({
      ref: "order.get",
      input: { orderId: "pending", caller: { subject: "alice" } },
    });
    failure(response, "INVALID_INPUT");
    assert.deepEqual(response.context.next, []);
  });
  test.each([
    { name: "empty subject", request: { caller: { subject: "" } } },
    { name: "whitespace subject", request: { caller: { subject: " " } } },
    {
      name: "non-record claims",
      request: { caller: { subject: "alice", claims: [] } },
    },
  ])("$name is a trusted-adapter contract violation", async ({ request }) => {
    await assert.rejects(
      createOrders().interact(
        "order.get",
        { orderId: "pending" },
        request as any,
      ),
      /Invalid verified Caller|claims must be a record/,
    );
  });
});

describe("OBSERVE — subscription is lazy and Guard refusal prevents the stream from starting", () => {
  const doc = {
    anwa: "0.2",
    entrypoints: ["activity.events"],
    interactions: {
      "activity.events": {
        kind: "event",
        description: "Observe",
        guard: "check",
        errors: { DENIED: "Denied" },
      },
    },
  } as const satisfies Manifest;
  const cases = [
    {
      name: "allowed decision",
      guard: () => ({ allowed: true }),
      code: null,
      subscriptions: 1,
    },
    {
      name: "declared refusal",
      guard: () => ({ allowed: false, error: { code: "DENIED" } }),
      code: "DENIED",
      subscriptions: 0,
    },
    {
      name: "synchronous exception",
      guard: () => {
        throw Error("private");
      },
      code: "UNEXPECTED_ERROR",
      subscriptions: 0,
    },
    {
      name: "asynchronous rejection",
      guard: () => Promise.reject(Error("private")),
      code: "UNEXPECTED_ERROR",
      subscriptions: 0,
    },
    {
      name: "undeclared refusal",
      guard: () => ({ allowed: false, error: { code: "SECRET" } }),
      code: "UNEXPECTED_ERROR",
      subscriptions: 0,
    },
  ];
  test.each(cases)("$name", async ({ guard, code, subscriptions }) => {
    const trace: string[] = [];
    const app = createAnwaApp(doc).bind(
      {
        "activity.events": {
          run: async function* () {
            trace.push("subscribe");
            yield { kind: "update" };
          },
        },
      },
      {
        guards: {
          check: () => {
            trace.push("guard");
            return guard() as any;
          },
        },
      },
    );
    const stream = app.observe("activity.events");
    assert.deepEqual(
      trace,
      [],
      "constructing an iterable does not run application code",
    );
    const collect = async () => {
      const events = [];
      for await (const event of stream) events.push(event);
      return events;
    };
    if (code === null) assert.deepEqual(await collect(), [{ kind: "update" }]);
    else
      await assert.rejects(
        collect(),
        (error) => isObservationDenied(error) && error.code === code,
      );
    assert.deepEqual(trace, subscriptions ? ["guard", "subscribe"] : ["guard"]);
  });
});
