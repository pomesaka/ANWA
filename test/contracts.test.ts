import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AnwaApp,
  fail,
  ok,
  reply,
  type Manifest,
  type InteractionResponse,
} from "../src/anwa.ts";
import { validateManifest, generateTypes } from "../src/schema-tools.ts";

const fixture = (path: string): Manifest =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Manifest;
const manifests = [
  fixture("../demo/calculator/anwa.json"),
  fixture("../demo/orders/anwa.json"),
  fixture("../demo/reports/anwa.json"),
];
const minimal = (): Manifest => ({
  anwa: "0.2",
  entrypoints: ["test.run"],
  interactions: {
    "test.run": {
      kind: "action",
      description: "Test a domain operation",
      errors: { EXPECTED_FAILURE: "Declared failure" },
    },
  },
});

test("Three demo manifests validate without Thing declarations", () => {
  for (const manifest of manifests) {
    assert.deepEqual(validateManifest(manifest), []);
    assert.deepEqual(Object.keys(manifest).sort(), [
      "anwa",
      "entrypoints",
      "interactions",
    ]);
  }
});

test("Thing and subjectType are forbidden core fields", () => {
  const old = structuredClone(manifests[1]) as Manifest & { things?: unknown };
  old.things = { Order: { title: "Order", description: "Not core" } };
  const interaction = old.interactions[
    "order.cancel"
  ] as (typeof old.interactions)[string] & { subjectType?: string };
  interaction.subjectType = "Order";
  const issues = validateManifest(old).map((d) => d.path);
  assert.ok(issues.includes("$.things"));
  assert.ok(issues.some((x) => x.endsWith("subjectType")));
  assert.throws(() => new AnwaApp(old), /schema invalid/);
});

test("Schema detects unknown entrypoints and unsupported payload keywords", () => {
  const bad = structuredClone(manifests[1]);
  bad.entrypoints = ["missing"];
  const schema = bad.interactions["order.get"].input as object as Record<
    string,
    unknown
  >;
  schema.pattern = "not supported";
  const issues = validateManifest(bad).map((x) => x.path);
  assert.ok(issues.some((x) => x.includes("entrypoints")));
  assert.ok(issues.some((x) => x.includes("pattern")));
});

test("Type generation is keyed by top-level InteractionRef", () => {
  const text = generateTypes(manifests[1]);
  assert.match(text, /OrderCancelInput/);
  assert.match(text, /OrderCancelHandler/);
  assert.match(text, /"ORDER_ALREADY_SHIPPED"/);
  assert.match(text, /"UNEXPECTED_ERROR"/);
  assert.match(text, /ShipmentTrackHandler/);
});

test("Binding rejects absent or undeclared handlers", () => {
  const app = new AnwaApp(manifests[0]);
  assert.throws(
    () => app.bind({ "calculator.add": async () => reply(ok(1)) }),
    /Unbound interaction/,
  );
  assert.throws(
    () =>
      app.bind({
        "calculator.add": async () => reply(ok(1)),
        "calculator.divide": async () => reply(ok(1)),
        unknown: async () => reply(ok(1)),
      }),
    /Unknown or invalid/,
  );
});

test("Runtime enforces named guard before run and uses per-Interaction onDenied", async () => {
  const doc = {
    anwa: "0.2",
    entrypoints: ["test.run"],
    interactions: {
      "test.run": {
        kind: "action",
        description: "Guarded operation",
        guard: "check",
        errors: { EXPECTED_FAILURE: "Guard rejected" },
      },
    },
  } as const satisfies Manifest;
  let executed = 0;
  let checks = 0;
  const app = new AnwaApp(doc).bind(
    {
      "test.run": {
        run: async () => {
          executed++;
          return reply(ok(null));
        },
        onDenied: ({ error }) => {
          assert.equal(error.code, "EXPECTED_FAILURE");
          return [
            {
              ref: "test.run",
              guidance: { kind: "retry", level: "available" },
              when: { after: "PT30S" },
            },
          ];
        },
      },
    },
    {
      guards: {
        check: async () => {
          checks++;
          return {
            allowed: false,
            error: { code: "EXPECTED_FAILURE", effects: "none" },
          };
        },
      },
    },
  );
  const result = await app.interact("test.run");
  assert.equal(executed, 0);
  assert.equal(checks, 1);
  assert.equal(result.outcome.kind, "settled");
  if (result.outcome.kind === "settled" && !result.outcome.result.ok)
    assert.equal(result.outcome.result.error.code, "EXPECTED_FAILURE");
  assert.equal(result.context.next[0].ref, "test.run");
});

test("Missing denial callback is rejected instead of silently bypassing policy", () => {
  const doc = {
    anwa: "0.2",
    entrypoints: ["test.run"],
    interactions: {
      "test.run": {
        kind: "action",
        description: "Guarded action",
        guard: "check",
        errors: { EXPECTED_FAILURE: "Denied" },
      },
    },
  } as const satisfies Manifest;
  const app = new AnwaApp(doc);
  assert.throws(
    () =>
      app.bind(
        {
          // @ts-expect-error deliberate invalid binding checked again at runtime
          "test.run": { run: async () => reply(ok(null)) },
        },
        { guards: { check: async () => ({ allowed: true }) } },
      ),
    /onDenied/,
  );
});

test("Undeclared errors are mapped to opaque framework errors", async () => {
  const app = new AnwaApp(minimal()).bind({
    "test.run": async () => reply(fail("SECRET", "private")),
  });
  const result = await app.interact("test.run");
  if (result.outcome.kind === "settled" && !result.outcome.result.ok)
    assert.deepEqual(result.outcome.result.error, {
      code: "UNEXPECTED_ERROR",
      message: "Unexpected application failure",
      effects: "unknown",
    });
  assert.deepEqual(result.context, { next: [] });
});

test("Handler must return Outcome + Context, not just a bare Result", async () => {
  const app = new AnwaApp(minimal()).bind({
    "test.run": async () => ok(null) as unknown as import("../src/anwa.ts").SettledResponse,
  });
  const result = await app.interact("test.run");
  if (result.outcome.kind === "settled" && !result.outcome.result.ok)
    assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
});

test("Invalid next candidate prevents success with malformed guidance", async () => {
  for (const next of [
    [{ ref: "missing" }],
    [{ ref: "test.run", when: { after: "tomorrow" } }],
    [{ ref: "test.run", guidance: { level: "critical" } }],
    [{ ref: "test.run", input: { unknown: true } }],
  ]) {
    const app = new AnwaApp(minimal()).bind({
      "test.run": async () => reply(ok(null), next as any),
    });
    const result = await app.interact("test.run");
    if (result.outcome.kind === "settled" && !result.outcome.result.ok)
      assert.equal(result.outcome.result.error.code, "UNEXPECTED_ERROR");
    assert.deepEqual(result.context, { next: [] });
  }
});

test("Each Handler chooses its own Context independently", async () => {
  const base = minimal();
  const doc: Manifest = { ...base, interactions: { ...base.interactions,
    "test.read": {kind: "query", description: "Read something"} } };
  const app = new AnwaApp(doc).bind({
    "test.run": async () =>
      reply(ok(null), [
        { ref: "test.read", guidance: { level: "recommended" } },
      ]),
    "test.read": async () =>
      reply(ok("read"), [
        { ref: "test.run", guidance: { level: "available" } },
      ]),
  });
  const one = await app.interact("test.run");
  const two = await app.interact("test.read");
  assert.equal(one.context.next[0].ref, "test.read");
  assert.equal(two.context.next[0].ref, "test.run");
});
