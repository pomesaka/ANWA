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
  assert.deepEqual(result.context, { links: [], affordances: [] });
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
  assert.deepEqual(result.context, { links: [], affordances: [] });
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
  assert.deepEqual(result.context, { links: [], affordances: [] });
});
