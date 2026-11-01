import { test } from "bun:test";
import assert from "node:assert/strict";
import { createCalculator } from "../demo/calculator/index.ts";
import { createOrders } from "../demo/orders/index.ts";
import { createReports } from "../demo/reports/index.ts";

test("Interaction catalog and Discovery have no Thing", () => {
  const app = createCalculator();
  assert.deepEqual(app.catalog().entrypoints, [
    "calculator.add",
    "calculator.divide",
  ]);
  assert.equal(Object.hasOwn(app.catalog(), "things"), false);
  const discovered = app.discover("calculator.divide");
  assert.equal(discovered.description.ref, "calculator.divide");
  assert.equal(discovered.description.kind, "action");
  assert.deepEqual(discovered.context, { next: [] });
});

test("Calculator handlers construct their own Outcome + Context", async () => {
  const app = createCalculator();
  assert.deepEqual(await app.interact("calculator.add", { a: 2, b: 3 }), {
    outcome: { kind: "settled", result: { ok: true, value: 5 } },
    context: { next: [] },
  });
  const error = await app.interact("calculator.divide", { a: 1, b: 0 });
  assert.equal(error.outcome.kind, "settled");
  if (error.outcome.kind === "settled") {
    assert.equal(error.outcome.result.ok, false);
    if (!error.outcome.result.ok)
      assert.equal(error.outcome.result.error.code, "DIVIDE_BY_ZERO");
  }
});

test("Input contract validation returns INVALID_INPUT", async () => {
  // Dynamic agent input still undergoes runtime validation.
  const response = await createCalculator().follow({ref: "calculator.add", input: {
    a: "bad", b: 3,
  }});
  assert.equal(response.outcome.kind, "settled");
  if (response.outcome.kind === "settled" && !response.outcome.result.ok)
    assert.equal(response.outcome.result.error.code, "INVALID_INPUT");
  assert.deepEqual(response.context, { next: [] });
});

test("Orders use standalone Interactions; each handler selects next Interactions", async () => {
  const app = createOrders();
  assert.equal(Object.hasOwn(app.catalog(), "things"), false);
  assert.equal(
    Object.hasOwn(app.describe("order.cancel"), "subjectType"),
    false,
  );
  const result = await app.interact("order.cancel", {
    orderId: "pending",
    reason: "Changed mind",
  });
  assert.equal(result.outcome.kind, "settled");
  if (result.outcome.kind === "settled" && result.outcome.result.ok)
    assert.deepEqual(result.outcome.result.value, { status: "cancelled" });
  assert.deepEqual(
    result.context.next.find((x) => x.ref === "order.get")?.input,
    { orderId: "pending" },
  );
  const confirmed = await app.interact("order.get", { orderId: "pending" });
  if (confirmed.outcome.kind === "settled" && confirmed.outcome.result.ok)
    assert.equal(
      (confirmed.outcome.result.value as { status: string }).status,
      "cancelled",
    );
});

test("Shipped-order failure offers tracking without a central context resolver", async () => {
  const app = createOrders();
  const failed = await app.interact("order.cancel", {
    orderId: "shipped",
    reason: "Changed mind",
  });
  assert.equal(failed.outcome.kind, "settled");
  if (failed.outcome.kind === "settled" && !failed.outcome.result.ok)
    assert.equal(failed.outcome.result.error.code, "ORDER_ALREADY_SHIPPED");
  const next = failed.context.next.find((x) => x.ref === "shipment.track");
  assert.ok(next);
  assert.deepEqual(next.input, { shipmentId: "shipped-ship" });
  assert.equal(next.guidance?.level, "recommended");
  const tracking = await app.follow(next);
  if (tracking.outcome.kind === "settled" && tracking.outcome.result.ok)
    assert.equal(tracking.outcome.result.value, "delivered");
  assert.equal(
    failed.context.next.some((x) => x.ref === "order.cancel"),
    false,
  );
});

test("Report accepted work, per-handler retry and Event observation without a Thing", async () => {
  const app = createReports();
  assert.equal(Object.hasOwn(app.catalog(), "things"), false);
  const started = await app.interact("report.generate", { topic: "ANWA" });
  assert.equal(started.outcome.kind, "accepted");
  if (started.outcome.kind !== "accepted") throw Error("Expected accepted");
  const executionId = started.outcome.execution.id;
  const waiting = await app.interact("execution.result", { executionId });
  if (waiting.outcome.kind === "settled" && !waiting.outcome.result.ok)
    assert.equal(waiting.outcome.result.error.code, "NOT_READY");
  const retry = waiting.context.next.find((x) => x.guidance?.kind === "retry");
  assert.ok(retry);
  assert.equal(retry.ref, "execution.result");
  assert.deepEqual(retry.input, { executionId });
  assert.equal(retry.when?.after, "PT0.05S");
  const events: unknown[] = [];
  for await (const event of app.observe("execution.updates", { executionId }))
    events.push(event);
  const last = events.at(-1) as {
    type: string;
    response: { outcome: { kind: string } };
  };
  assert.equal(last.type, "settled");
  assert.equal(last.response.outcome.kind, "settled");
  const done = await app.interact("execution.result", { executionId });
  if (done.outcome.kind === "settled" && done.outcome.result.ok)
    assert.match(done.outcome.result.value as string, /ANWA/);
});
