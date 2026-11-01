import test from "node:test";
import assert from "node:assert/strict";
import { interaction, thing } from "../src/anwa.mjs";
import { createCalculator, calculatorRef } from "../demo/calculator/index.mjs";
import { createOrders, orderRef } from "../demo/orders/index.mjs";
import { createReports, reportServiceRef } from "../demo/reports/index.mjs";

const action = (target, name) => interaction(target, "action", name);
const property = (target, name) => interaction(target, "property", name);

test("catalog bootstraps discovery without a hard-coded URL", async () => {
  const app = createCalculator();
  assert.deepEqual(app.catalog().entrypoints, [calculatorRef]);
  const discovered = await app.discover(app.catalog().entrypoints[0]);
  assert.equal(discovered.description.title, "Calculator");
  const add = discovered.description.interactions.find(x => x.ref.name === "add");
  assert.deepEqual(add.ref, action(calculatorRef, "add"));
  assert.equal(add.description, "Add two numbers.");
});

test("stateless actions use Outcome + Context on success and domain failure", async () => {
  const app = createCalculator();
  const result = await app.interact(action(calculatorRef, "add"), { a: 2, b: 3 });
  assert.deepEqual(result.outcome, { kind: "settled", result: { ok: true, value: 5 } });
  assert.deepEqual(result.context, { links: [], affordances: [] });
  const err = await app.interact(action(calculatorRef, "divide"), { a: 1, b: 0 });
  assert.equal(err.outcome.result.error.code, "DIVIDE_BY_ZERO");
  assert.equal(err.outcome.result.error.retry.mode, "after-input-change");
  assert.deepEqual(err.context, { links: [], affordances: [] });
});

test("invalid input is typed failure, not thrown handler exception", async () => {
  const app = createCalculator();
  const result = await app.interact(action(calculatorRef, "add"), { a: "two", b: 3 });
  assert.equal(result.outcome.result.error.code, "INVALID_INPUT");
  assert.deepEqual(result.context, { links: [], affordances: [] });
});

test("code-backed guard and application-selected affordance navigation", async () => {
  const app = createOrders();
  const ref = orderRef("shipped");
  const discovery = await app.discover(ref);
  const blocked = discovery.context.affordances.find(x => x.ref.name === "cancel");
  assert.equal(blocked.applicability.state, "blocked");
  const result = await app.interact(action(ref, "cancel"), { reason: "test" });
  assert.equal(result.outcome.result.error.code, "ORDER_ALREADY_SHIPPED");
  assert.equal(result.context.links[0].rel, "shipment");
  const tracking = result.context.affordances.find(x => x.ref.name === "tracking");
  assert.equal(tracking.ref.kind, "property");
  assert.equal((await app.interact(tracking.ref)).outcome.result.value, "delivered");
});

test("app controls state model and same Result form covers changed state", async () => {
  const app = createOrders();
  const ref = orderRef("pending");
  assert.equal((await app.interact(property(ref, "summary"))).outcome.result.value.status, "pending");
  const cancelled = await app.interact(action(ref, "cancel"), { reason: "test" });
  assert.equal(cancelled.outcome.result.value.status, "cancelled");
  assert.equal((await app.interact(property(ref, "summary"))).outcome.result.value.status, "cancelled");
  assert.equal((await app.interact(action(ref, "cancel"), { reason: "again" })).outcome.result.error.code, "ALREADY_CANCELLED");
});

test("async acceptance is distinct from final success; observe artifact updates", async () => {
  const app = createReports();
  const call = await app.interact(action(reportServiceRef, "generate"), { topic: "Agent" });
  assert.equal(call.outcome.kind, "accepted");
  const execution = call.outcome.execution;
  assert.equal(execution.type, "Execution");
  assert.equal((await app.interact(property(execution, "result"))).outcome.result.error.code, "NOT_READY");
  assert.ok(call.context.affordances.some(x => x.ref.kind === "event"));
  const events = [];
  for await (const e of app.observe(interaction(execution, "event", "updates"))) events.push(e);
  assert.equal(events.at(-1).type, "settled");
  assert.equal(events.at(-1).response.outcome.result.ok, true);
  assert.ok(events.some(x => x.type === "artifact.delta"));
  assert.equal((await app.interact(property(execution, "status"))).outcome.result.value, "completed");
  assert.match((await app.interact(property(execution, "result"))).outcome.result.value, /Agent/);
});

test("service-level Thing is possible; per-object Thing is not mandated", () => {
  assert.deepEqual(createCalculator().catalog().entrypoints, [thing("Calculator", "main")]);
});
