/** ANWA v0.2 executable contract: schema acceptance, binding and dispatch are independent tables. */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAnwaApp,
  fail,
  ok,
  reply,
  type Manifest,
  type NextInteraction,
} from "../src/anwa.ts";
import {
  validateManifest,
  generateTypes,
  generateManifestModule,
} from "../src/schema-tools.ts";
import { schema as generatedTodo } from "../demo/todo/contract.generated.ts";
import { success, failure, opaqueFailure } from "./support/outcome.ts";

const action = {
  kind: "action",
  description: "Execute a contract fixture",
  hasSideEffects: true,
  idempotent: false,
  input: {
    type: "object",
    properties: { key: { type: "string" } },
    required: ["key"],
    additionalProperties: false,
  },
  output: { type: "string" },
  errors: { DENIED: "Policy refused this operation" },
} as const;
const manifest = (override: Record<string, unknown> = {}): Manifest =>
  ({
    anwa: "0.2",
    entrypoints: ["test.run"],
    interactions: { "test.run": { ...action, ...override } },
  }) as Manifest;
const loadDemo = (name: string): Manifest =>
  JSON.parse(
    readFileSync(new URL(`../demo/${name}/anwa.json`, import.meta.url), "utf8"),
  );

describe("SCHEMA — Action semantics are explicit, not inferred", () => {
  const cases = [
    {
      name: "both true are accepted",
      flags: { hasSideEffects: true, idempotent: true },
      paths: [],
    },
    {
      name: "both false are accepted",
      flags: { hasSideEffects: false, idempotent: false },
      paths: [],
    },
    {
      name: "missing hasSideEffects is rejected",
      flags: { hasSideEffects: undefined },
      paths: ["hasSideEffects"],
    },
    {
      name: "missing idempotent is rejected",
      flags: { idempotent: undefined },
      paths: ["idempotent"],
    },
    {
      name: "null is not an explicit boolean",
      flags: { idempotent: null },
      paths: ["idempotent"],
    },
    {
      name: "string false is not boolean false",
      flags: { hasSideEffects: "false" },
      paths: ["hasSideEffects"],
    },
    {
      name: "Query forbids Action flags",
      flags: { kind: "query" },
      paths: ["hasSideEffects", "idempotent"],
    },
    {
      name: "Event forbids Action flags",
      flags: { kind: "event" },
      paths: ["hasSideEffects", "idempotent"],
    },
  ];
  test.each(cases)("$name", ({ flags, paths }) => {
    const doc = manifest(flags);
    assert.deepEqual(
      validateManifest(doc)
        .map((d) => d.path)
        .sort(),
      paths.map((p) => "$.interactions.test.run." + p).sort(),
    );
  });
});

describe("SCHEMA — invalid declarations identify the offending field", () => {
  const cases = [
    {
      name: "Thing is not a root capability",
      document: { ...manifest(), things: {} },
      path: "$.things",
    },
    {
      name: "subjectType is not an Interaction property",
      document: manifest({ subjectType: "Task" }),
      path: "$.interactions.test.run.subjectType",
    },
    {
      name: "entrypoint must name a declared operation",
      document: { ...manifest(), entrypoints: ["missing"] },
      path: "$.entrypoints[0]",
    },
    {
      name: "unsupported payload keyword is rejected",
      document: manifest({ input: { type: "string", pattern: "x" } }),
      path: "$.interactions.test.run.input.pattern",
    },
    {
      name: "unknown ref is rejected",
      document: manifest({ output: { $ref: "#/$defs/Missing" } }),
      path: "$.interactions.test.run.output.$ref",
    },
    {
      name: "ref cannot have sibling keywords",
      document: {
        ...manifest({ output: { $ref: "#/$defs/Text", type: "string" } }),
        $defs: { Text: { type: "string" } },
      },
      path: "$.interactions.test.run.output",
    },
    {
      name: "recursive definitions are rejected",
      document: {
        ...manifest(),
        $defs: { A: { $ref: "#/$defs/B" }, B: { $ref: "#/$defs/A" } },
      },
      path: "$.$defs.A",
    },
  ];
  test.each(cases)("$name", ({ document, path }) => {
    assert.deepEqual(
      validateManifest(document).map((d) => d.path),
      [path],
    );
    assert.throws(
      () => createAnwaApp(document as Manifest),
      /ANWA schema invalid/,
    );
  });
});

describe("CODEGEN — all published examples are valid contracts", () => {
  test.each(["calculator", "orders", "reports", "todo"])(
    "%s validates",
    (demo) => {
      assert.deepEqual(validateManifest(loadDemo(demo)), []);
    },
  );
  test("shared Todo definitions expand to the checked-in literal contract", () => {
    const generated = generateManifestModule(loadDemo("todo"));
    const literal = generated
      .split("export const schema = ")[1]
      .split(" as const satisfies Manifest;")[0];
    assert.deepEqual(JSON.parse(literal), generatedTodo);
  });
  test.each([
    "OrderCancelInput",
    "OrderCancelHandler",
    '"ORDER_ALREADY_SHIPPED"',
    '"UNEXPECTED_ERROR"',
    "ShipmentTrackHandler",
  ])("Orders declaration contains %s", (declaration) =>
    assert.ok(generateTypes(loadDemo("orders")).includes(declaration)),
  );
});

describe("BIND — configuration fails before serving requests", () => {
  const run = () => reply(ok("ran"));
  const cases = [
    {
      name: "unguarded operation must be explicitly public",
      document: manifest(),
      handlers: { "test.run": run },
      options: {},
      error: /explicit public/,
    },
    {
      name: "missing handler cannot be served",
      document: manifest(),
      handlers: {},
      options: { public: ["test.run"] },
      error: /Unbound or invalid/,
    },
    {
      name: "undeclared handler cannot be registered",
      document: manifest(),
      handlers: { "test.run": run, missing: run },
      options: { public: ["test.run"] },
      error: /Unknown or invalid/,
    },
    {
      name: "public list cannot bypass a Guard",
      document: manifest({ guard: "check" }),
      handlers: { "test.run": { run, onDenied: () => [] } },
      options: {
        public: ["test.run"],
        guards: { check: () => ({ allowed: true }) },
      },
      error: /cannot bypass Guard/,
    },
    {
      name: "guard name must be bound",
      document: manifest({ guard: "check" }),
      handlers: { "test.run": { run, onDenied: () => [] } },
      options: {},
      error: /Missing Guard/,
    },
    {
      name: "guarded Query or Action must own its denial context",
      document: manifest({ guard: "check" }),
      handlers: { "test.run": { run } },
      options: { guards: { check: () => ({ allowed: true }) } },
      error: /onDenied/,
    },
    {
      name: "public list must use declared references",
      document: manifest(),
      handlers: { "test.run": run },
      options: { public: ["missing"] },
      error: /Undeclared public/,
    },
  ];
  test.each(cases)("$name", ({ document, handlers, options, error }) => {
    // Malformed JavaScript bindings deliberately cross the compile-time boundary.
    assert.throws(
      () => createAnwaApp(document).bind(handlers as any, options as any),
      error,
    );
  });
});

describe("DISPATCH — validation, Guard, denial hook and handler run in that order", () => {
  const retry: NextInteraction[] = [
    {
      ref: "test.run",
      input: { key: "valid" },
      guidance: { kind: "retry", level: "available" },
      when: { after: "PT30S" },
    },
  ];
  const cases = [
    {
      name: "invalid input runs nothing",
      input: { key: 42 },
      decision: { allowed: true },
      trace: [],
      code: "INVALID_INPUT",
      next: [],
    },
    {
      name: "allowed call runs Guard then handler",
      input: { key: "valid" },
      decision: { allowed: true },
      trace: ["guard", "run"],
      code: null,
      next: [],
    },
    {
      name: "declared refusal runs denial hook but never handler",
      input: { key: "valid" },
      decision: { allowed: false, error: { code: "DENIED", effects: "none" } },
      trace: ["guard", "onDenied"],
      code: "DENIED",
      next: retry,
    },
    {
      name: "undeclared refusal does not run either handler",
      input: { key: "valid" },
      decision: { allowed: false, error: { code: "SECRET" } },
      trace: ["guard"],
      code: "UNEXPECTED_ERROR",
      next: [],
    },
    {
      name: "malformed decision fails closed",
      input: { key: "valid" },
      decision: { allowed: "true" },
      trace: ["guard"],
      code: "UNEXPECTED_ERROR",
      next: [],
    },
  ];
  test.each(cases)("$name", async (row) => {
    const trace: string[] = [];
    const app = createAnwaApp(manifest({ guard: "check" })).bind(
      {
        "test.run": {
          run: () => {
            trace.push("run");
            return reply(ok("ran"));
          },
          onDenied: () => {
            trace.push("onDenied");
            return retry;
          },
        },
      } as any,
      {
        discoverable: () => true,
        guards: {
          check: () => {
            trace.push("guard");
            return row.decision;
          },
        },
      } as any,
    );
    const result = await app.follow({ ref: "test.run", input: row.input });
    if (row.code === null) assert.equal(success(result), "ran");
    else failure(result, row.code);
    assert.deepEqual(trace, row.trace);
    assert.deepEqual(result.context.next, row.next);
  });
});

describe("RESULT — invalid application output is opaque and advertises no continuation", () => {
  const cases: Array<{
    name: string;
    produce: () => unknown;
    kind?: "action" | "query";
  }> = [
    {
      name: "undeclared domain code",
      produce: () => reply(fail("SECRET", "private")),
    },
    { name: "bare Result without envelope", produce: () => ok("ran") },
    { name: "output violates its schema", produce: () => reply(ok(42)) },
    {
      name: "unknown outcome tag",
      produce: () => ({ outcome: { kind: "unknown" }, context: { next: [] } }),
    },
    {
      name: "Query cannot accept deferred execution",
      kind: "query",
      produce: () => ({
        outcome: { kind: "accepted", execution: { id: "job" } },
        context: { next: [] },
      }),
    },
    {
      name: "missing Context",
      produce: () => ({ outcome: { kind: "settled", result: ok("ran") } }),
    },
    {
      name: "synchronous throw",
      produce: () => {
        throw Error("private");
      },
    },
    {
      name: "rejected promise",
      produce: () => Promise.reject(Error("private")),
    },
    ...[
      { name: "unknown next reference", next: { ref: "missing" } },
      {
        name: "invalid timing",
        next: { ref: "test.run", when: { after: "tomorrow" } },
      },
      {
        name: "invalid guidance",
        next: { ref: "test.run", guidance: { level: "critical" } },
      },
      {
        name: "invalid prebound input",
        next: { ref: "test.run", input: { key: 42 } },
      },
    ].map(({ name, next }) => ({
      name,
      produce: () => reply(ok("ran"), [next] as any),
    })),
  ];
  test.each(cases)("$name", async ({ produce, kind }) => {
    const doc = manifest(
      kind === "query"
        ? { kind, hasSideEffects: undefined, idempotent: undefined }
        : {},
    );
    const app = createAnwaApp(doc).bind({ "test.run": produce } as any, {
      public: ["test.run"],
    });
    assert.deepEqual(
      await app.interact("test.run", { key: "valid" }),
      opaqueFailure,
    );
  });
});

describe("FACTORY — binding is immutable and methods are receiver-independent", () => {
  test("rebinding produces isolated runtimes and leaves the unbound factory unchanged", async () => {
    const factory = createAnwaApp(manifest());
    const first = factory.bind(
      { "test.run": () => reply(ok("first")) },
      { public: ["test.run"] },
    );
    const second = first.bind(
      { "test.run": () => reply(ok("second")) },
      { public: ["test.run"] },
    );
    const { interact, catalog } = first;
    assert.deepEqual(factory.catalog().interactions, []);
    assert.notEqual(first, second);
    assert.equal(success(await interact("test.run", { key: "x" })), "first");
    assert.equal(
      success(await second.interact("test.run", { key: "x" })),
      "second",
    );
    assert.deepEqual(catalog().entrypoints, ["test.run"]);
  });
});

describe("REF — raw local definitions validate both inputs and outputs", () => {
  const doc = {
    anwa: "0.2",
    entrypoints: ["echo"],
    $defs: { Text: { type: "string" } },
    interactions: {
      echo: {
        kind: "query",
        description: "Echo",
        input: { $ref: "#/$defs/Text" },
        output: { $ref: "#/$defs/Text" },
      },
    },
  } as const satisfies Manifest;
  test.each([
    {
      name: "invalid input never executes",
      input: 42,
      output: "hello",
      expected: "INVALID_INPUT",
      runs: 0,
    },
    {
      name: "valid input and output succeed",
      input: "hello",
      output: "hello",
      expected: null,
      runs: 1,
    },
    {
      name: "invalid output is opaque",
      input: "hello",
      output: 42,
      expected: "UNEXPECTED_ERROR",
      runs: 1,
    },
  ])("$name", async (row) => {
    let runs = 0;
    const app = createAnwaApp(doc).bind(
      {
        echo: () => {
          runs++;
          return reply(ok(row.output)) as any;
        },
      },
      { public: ["echo"] },
    );
    const response = await app.follow({ ref: "echo", input: row.input });
    if (row.expected === null) assert.equal(success(response), "hello");
    else failure(response, row.expected);
    assert.equal(runs, row.runs);
  });
});
