import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AnwaApp, fail, thing, interaction } from "../src/anwa.mjs";
import { validateManifest, generateTypes } from "../src/schema-tools.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const fixtures = [
  read("../demo/calculator/anwa.json"),
  read("../demo/orders/anwa.json"),
  read("../demo/reports/anwa.json")
];
const target = thing("Test", "main");
const ref = interaction(target, "action", "run");
const schema = (errors = { EXPECTED_FAILURE: "Known domain failure" }, guard) => ({
  anwa: "0.1", entrypoints: [target],
  things: {
    Test: {
      title: "Test application",
      description: "Validates the declared domain error contract.",
      actions: {
        run: {
          description: "Execute an action.",
          errors,
          ...(guard ? { guard } : {})
        }
      }
    }
  }
});

test("all three demo manifests pass the supported schema checks", () => {
  for (const manifest of fixtures) assert.deepEqual(validateManifest(manifest), []);
});

test("invalid description, unresolved link and unsupported schema keyword are diagnosed", () => {
  const doc = structuredClone(fixtures[1]);
  doc.things.Order.actions.cancel.description = "";
  doc.things.Order.links.shipment.target = "UnknownThing";
  doc.things.Order.actions.cancel.input.pattern = "[a-z]";
  const messages = validateManifest(doc).map(x => x.path + ": " + x.message);
  assert.ok(messages.some(x => x.includes("cancel.description")));
  assert.ok(messages.some(x => x.includes("links.shipment.target")));
  assert.ok(messages.some(x => x.includes("cancel.input.pattern")));
  assert.throws(() => new AnwaApp(doc), /schema validation failed/);
});

test("type generation includes input/output and enumerated error codes", () => {
  const types = generateTypes(fixtures[1]);
  assert.match(types, /OrderCancelActionInput/);
  assert.match(types, /"reason": string/);
  assert.match(types, /OrderCancelActionHandler/);
  assert.match(types, /"ORDER_ALREADY_SHIPPED"/);
  assert.match(types, /"ALREADY_CANCELLED"/);
  assert.match(types, /"UNEXPECTED_ERROR"/);
});

test("declared domain errors remain typed and are discoverable", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => fail("EXPECTED_FAILURE", "Declared failure") }
  });
  const discovered = await app.discover(target);
  assert.deepEqual(discovered.description.interactions[0].errors, {
    EXPECTED_FAILURE: "Known domain failure"
  });
  const result = await app.interact(ref);
  assert.equal(result.outcome.result.error.code, "EXPECTED_FAILURE");
  assert.deepEqual(result.context, { next: [] });
});

test("undeclared handler errors become UNEXPECTED_ERROR without leaking details", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => fail("SECRET_FAILURE", "credentials are secret") }
  });
  const result = await app.interact(ref);
  assert.deepEqual(result.outcome.result.error, {
    code: "UNEXPECTED_ERROR",
    message: "Unexpected application failure",
    effects: "unknown"
  });
  assert.deepEqual(result.context, { next: [] });
});

test("undeclared guard errors become UNEXPECTED_ERROR, not a leaked policy detail", async () => {
  const app = new AnwaApp(schema(undefined, "check")).bind("Test", {
    guards: {
      check: async () => ({ allowed: false, error: { code: "SECRET_POLICY", message: "secret" } })
    },
    actions: { run: async () => { throw Error("Must not run"); } }
  });
  const result = await app.interact(ref);
  assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
});

test("reserved domain error code fails schema validation", () => {
  assert.ok(validateManifest(schema({ UNEXPECTED_ERROR: "Reserved" })).some(x => x.message.includes("Reserved")));
});

test("unexpected handler exception and context failure share opaque error", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => { throw Error("Internal credentials"); } },
    context: () => { throw Error("Context failed"); }
  });
  const result = await app.interact(ref);
  assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
  assert.deepEqual(result.context, { next: [] });
});

test("agent-oriented semantic annotations are validated and exposed, without changing business logic", async () => {
  const doc = structuredClone(fixtures[0]);
  doc.things.Calculator.semanticTypes = ["urn:example:calculation-service"];
  doc.things.Calculator.actions.add.semanticTypes = ["urn:example:arithmetic-addition"];
  assert.deepEqual(validateManifest(doc), []);
  const app = new AnwaApp(doc).bind("Calculator", {
    actions: {
      add: async ({input}) => ({ok: true, value: input.a + input.b}),
      divide: async ({input}) => ({ok: true, value: input.a / input.b})
    }
  });
  const catalog = app.catalog();
  assert.deepEqual(catalog.things[0].semanticTypes, ["urn:example:calculation-service"]);
  const d = await app.discover(thing("Calculator", "main"));
  const add = d.description.interactions.find(i => i.ref.name === "add");
  assert.deepEqual(add.semanticTypes, ["urn:example:arithmetic-addition"]);
  assert.equal(add.hasSideEffects, false);
  assert.equal(add.idempotent, true);
  assert.equal((await app.interact(refFor(thing("Calculator", "main"), "add"), {a: 2, b: 2}))
    .outcome.result.value, 4);
});

function refFor(thingRef, name) {
  return interaction(thingRef, "action", name);
}

test("semantic and effect declarations have precise scope and conservative defaults", () => {
  const doc = structuredClone(fixtures[1]);
  assert.equal(doc.things.Order.actions.cancel.hasSideEffects, true);
  assert.equal(doc.things.Order.actions.cancel.idempotent, false);
  doc.things.Order.properties.summary.hasSideEffects = false;
  doc.things.Order.actions.cancel.semanticTypes = ["relative-not-a-uri"];
  const paths = validateManifest(doc).map(d => d.path);
  assert.ok(paths.some(p => p.includes("summary.hasSideEffects")));
  assert.ok(paths.some(p => p.includes("cancel.semanticTypes")));
  delete doc.things.Order.properties.summary.hasSideEffects;
  delete doc.things.Order.actions.cancel.semanticTypes;
  delete doc.things.Order.actions.cancel.hasSideEffects;
  delete doc.things.Order.actions.cancel.idempotent;
  assert.deepEqual(validateManifest(doc), []);
  const app = new AnwaApp(doc).bind("Order", {
    properties: { summary: async () => ({ok:true,value:{id:"x",status:"pending"}}) },
    actions: { cancel: async () => ({ok:true,value:{status:"cancelled"}}) },
    guards: { canCancel: async () => ({allowed:true}) }
  }).bind("Shipment", { properties:{tracking:async()=>({ok:true,value:"delivered"})} });
  const cancel = app.describe(thing("Order", "x")).interactions.find(x => x.ref.name === "cancel");
  assert.equal(Object.hasOwn(cancel, "hasSideEffects"), false);
  assert.equal(Object.hasOwn(cancel, "idempotent"), false);
  // Omitted values remain UNKNOWN; they do not default to false.
});

test("Action boolean flags reject textual or non-Action values", () => {
  const bad = structuredClone(fixtures[1]);
  bad.things.Order.actions.cancel.hasSideEffects = "false";
  bad.things.Order.properties.summary.idempotent = true;
  const paths = validateManifest(bad).map(x => x.path);
  assert.ok(paths.some(p => p.endsWith("cancel.hasSideEffects")));
  assert.ok(paths.some(p => p.endsWith("summary.idempotent")));
});

test("Context next can recommend a timed retry of the same Interaction", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => fail("EXPECTED_FAILURE", "Try later", { effects: "none" }) },
    context: ({ interaction: source, outcome }) => ({
      next: source && outcome?.result?.ok === false ? [{
        ref: source,
        guidance: { kind: "retry", level: "recommended" },
        when: { after: "PT30S" }
      }] : []
    })
  });
  const r = await app.interact(ref);
  assert.equal(r.outcome.result.error.code, "EXPECTED_FAILURE");
  assert.deepEqual(r.context.next[0], {
    ref, guidance: { kind: "retry", level: "recommended" },
    when: { after: "PT30S" }
  });
  assert.equal(Object.hasOwn(r.outcome.result.error, "retry"), false);
});

test("Context next may direct Discovery to a Thing without inventing an Action", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => ({ ok: true, value: null }) },
    context: () => ({ next: [{ kind: "discover", ref: target,
      guidance: { level: "available" } }] })
  });
  const r = await app.interact(ref);
  assert.deepEqual(r.context.next, [{ kind: "discover", ref: target,
    guidance: { level: "available" } }]);
});

test("Invalid guidance, timing and old Context fields are rejected, not silently accepted", async () => {
  for (const bad of [
    { next: [{ ref, guidance: { kind: "retry", level: "critical" } }] },
    { next: [{ ref, when: { after: "tomorrow" } }] },
    { next: [{ ref, when: { after: "P" } }] },
    { next: [{ kind: "discover", ref: target, guidance: { kind: "retry" } }] },
    { links: [], affordances: [] }
  ]) {
    const app = new AnwaApp(schema()).bind("Test", {
      actions: { run: async () => ({ ok: true, value: null }) },
      context: () => bad
    });
    const result = await app.interact(ref);
    assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
    assert.deepEqual(result.context, { next: [] });
  }
});

test("Error retry is rejected in favor of contextual next retry guidance", async () => {
  const app = new AnwaApp(schema()).bind("Test", {
    actions: { run: async () => fail("EXPECTED_FAILURE", "Try later",
      { retry: { mode: "after", after: "PT10S" } }) }
  });
  const result = await app.interact(ref);
  assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
  assert.deepEqual(result.context, { next: [] });
});
