# ANWA 0.2 — Interaction-first experimental contract

> **Status:** Experimental, not an adopted standard or compatibility guarantee. This is the active ANWA profile. The earlier [v0.1 Thing-bound profile](anwa-0.1.md) is retained for historical reference only.

## Core model

**Interaction is ANWA's sole first-class public capability.** No Thing, ThingRef, `things` map, `subjectType`, mandatory service object, or entity-instance hierarchy is part of this core.

Application authors may have rich domain models internally. ANWA represents them through the input/output types, semantic descriptions, declared errors and runtime results of the Interactions they publish. ANWA does not choose how business objects are modeled, identified, stored or related.

The four logical framework responsibilities remain:

1. **Description:** declare Interactions and their meaning, type signatures, errors and optional metadata.
2. **Binding:** connect declared InteractionRefs to implementation handlers and optional named guards.
3. **Discovery:** list and describe Interactions without requiring an owning resource.
4. **Interaction:** invoke or observe Interactions and return `Outcome + Context`.

These responsibilities are not four mandatory network protocols. The current reference runtime is an in-process adapter.

## Public manifest

The experimental manifest has three required top-level fields and an optional reusable data-schema definition map:

| Field | Status | Meaning |
| --- | --- | --- |
| `anwa: "0.2"` | Required | Experimental contract profile |
| `interactions` | Required nonempty map | App-scoped `InteractionRef → InteractionDefinition` |
| `$defs` | Optional map | Named payload schemas referenced as `#/$defs/Name`; **not** Thing declarations |
| `entrypoints` | Required nonempty list | References to declared Interactions offered to a connecting agent |

The supported Interaction kinds are:

- **`query`** — read or retrieve typed information. This is an ANWA term, not WoT's Thing-bound PropertyAffordance.
- **`action`** — invoke an operation, with **required** side-effect and idempotency declarations.
- **`event`** — observe an app-defined stream of events, with optional input.

Every Interaction has a `kind` and a meaningful `description`. It may also declare an `input`, `output`, exhaustive expected `errors`, and optional `semanticTypes`. Any Interaction may declare a named `guard`. Every Action **must** declare both `hasSideEffects` and `idempotent` as explicit booleans; Query and Event must not declare them. An Action missing either field is invalid, not implicitly `false`. The booleans describe intended operation semantics and are not verified by the runtime.

The reference validator implements a **constrained subset** of JSON Schema Draft 2020-12 for data types, not full specification conformance. It additionally supports authoring-time reuse with a root `$defs` map and local `$ref` objects (`{"$ref":"#/$defs/Task"}`). References must target declared definitions, appear without sibling keywords, and be acyclic; remote references and arbitrary JSON Pointers are unsupported. Code generation expands these references into standalone literal schemas for TypeScript inference, so reusable **data shapes** do not introduce Thing identity or change Interaction execution semantics.

### Example — no domain object required

```json
{
  "anwa": "0.2",
  "entrypoints": ["calculator.add"],
  "interactions": {
    "calculator.add": {
      "kind": "action",
      "description": "Add two numbers.",
      "input": {
        "type": "object",
        "properties": {
          "a": { "type": "number" },
          "b": { "type": "number" }
        },
        "required": ["a", "b"],
        "additionalProperties": false
      },
      "output": { "type": "number" },
      "hasSideEffects": false,
      "idempotent": true
    }
  }
}
```

## InteractionRef, Discovery and Binding

An `InteractionRef` is an **application-scoped string**, e.g. `order.cancel` or `execution.result`. It resolves directly to a top-level definition and bound handler in the connected app; it is not a globally discoverable URL or a resource-instance identifier.

```ts
import { schema } from "../demo/calculator/contract.generated.ts";
const app = new AnwaApp(schema).bind({
  "calculator.add": async ({ input }) => reply(ok(input.a + input.b)),
  "calculator.divide": async ({ input }) => input.b === 0
    ? reply(fail("DIVIDE_BY_ZERO")) : reply(ok(input.a / input.b))
}, { public: ["calculator.add", "calculator.divide"] });

app.catalog();
await app.discover("calculator.add");
await app.interact("calculator.add", { a: 2, b: 3 });
```

- `catalog()` returns version, entrypoint InteractionRefs and a summary of published Interactions.
- `discover(ref)` resolves a published Interaction description and returns an empty navigation Context in this in-process profile.
- `interact(ref,input?)` validates the supported input schema and runs a Query or Action.
- `observe(ref,input?,options?)` subscribes to an Event's application-provided `AsyncIterable`.

An order ID, a report ID, a payment ID or an execution ID is just app-declared typed **input or output data**. The core does not prescribe domain identity, a special resource reference type or a mapping from IDs to API routes.

## Outcome and contextual next Interactions

Every **delivered application-level** result contains an `outcome` and a `context`. The **owning Interaction Handler constructs both** via `reply(result, next)`; no application-wide `context` resolver exists. A result can be settled success, settled domain failure, or accepted async execution. A bare `ok(...)` without `reply(...)` is a contract violation.

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": { "code": "NOT_READY", "effects": "none" }
    }
  },
  "context": {
    "next": [{
      "ref": "execution.result",
      "input": { "executionId": "42" },
      "guidance": { "kind": "retry", "level": "recommended" },
      "when": { "after": "PT30S" }
    }]
  }
}
```

`context.next` is **one list** of follow-up Interaction candidates; it can be empty. A candidate contains:

| Field | Meaning |
| --- | --- |
| `ref` | Reference to a published Interaction |
| `input` | Optional bound inputs selected by the app; type-checked when supplied |
| `guidance.kind: "retry"` | Candidate repeats the **same InteractionRef** that produced the result |
| `guidance.level` | Optional `required`, `recommended`, or `available` |
| `when.after` | Optional ISO 8601 delay relative to response receipt; advisory only |
| `applicability` | Optional `available`, `blocked`, or `unknown`; not authorization |

`required` is app-authored prerequisite information for a **chosen continuation**, never a command to override the user. ANWA does not select a business workflow or blindly retry an action. There is **no separate** `error.retry`, `context.retry`, `context.links`, or `context.affordances` list.

Domain errors are defined per Interaction with exhaustive codes. Undeclared application errors become `UNEXPECTED_ERROR`. `error.effects`, when known, describes what happened during **this attempt** (`none`, `occurred`, `unknown`), separate from the Action's static `hasSideEffects`.

### Required Action effect declarations

- `hasSideEffects: true` means the operation **can** modify state or produce externally observable effects. `false` is appropriate for a pure calculation; **it is not a guarantee** that an implementation is side-effect-free.
- `idempotent: true` means repeating the **same invocation** has the same intended application-side effects as executing it once; the responses may differ (for example, a repeated version-checked update can return `VERSION_CONFLICT`). `false` means no idempotency guarantee is declared.
- Neither declaration grants permission, implements duplicate-request detection, certifies exactly-once delivery, or makes automatic retries safe after an uncertain network failure. Callers must also consider `error.effects`, authorization, concurrency, and application-level retry policy.

**Compatibility:** requiring these flags strengthens the experimental v0.2 manifest validator and is a breaking schema-authoring change for manifests that omitted them. Existing v0.2 demos already declare both flags; the Go Todo demo now does too.

## Asynchronous work — no special resource model

An Action may return an accepted execution reference:

```json
{
  "outcome": { "kind": "accepted", "execution": { "id": "42" } },
  "context": {
    "next": [{
      "ref": "execution.status",
      "input": { "executionId": "42" },
      "guidance": { "level": "recommended" }
    }]
  }
}
```

The execution identifier is an opaque handle. `execution.status`, `execution.result` and `execution.updates` are **ordinary standalone Interactions**, not members of an Execution resource. The application implements their lifecycle and any storage or concurrency guarantees. Observation is independent of durable execution.

## Authentication and access controls (experimental runtime)

Authentication is **not** an ANWA Guard. A trusted transport Adapter authenticates the caller, then supplies `RequestContext.caller` to the in-process runtime. `input` remains untrusted application data. The reference does not validate credentials or prevent someone calling the in-process API directly with a fabricated caller; do not expose this entrypoint over a network without an authenticating adapter.

Named Guards may protect **query**, **action**, and **event** Interactions. Runtime evaluates a Guard before dispatch. Queries/Actions use a `{run,onDenied}` binding; the latter supplies only `Context.next` after a denial. An Event is guarded before its async iterator starts, and failures surface as `ObservationDenied` rather than an Interaction Result.

**Default-deny:** an Interaction without a Guard must be explicitly listed in the bind options `public`, otherwise binding rejects it. Guarded Interaction descriptions are hidden from Discovery unless an application-defined `discoverable({ref,caller})` policy permits disclosure. `catalog` and `discover` take the trusted request context; filtered `Context.next` respects coarse discoverability as well. Discovery has no resource-level input and is **not** proof of authorization.

[Detailed authentication and authorization semantics](../docs/authentication-authorization.md).

## Tooling, demos and limitations

- [TypeScript reference runtime](../src/anwa.ts)
- [TypeScript schema validator / generated types](../src/schema-tools.ts)
- [Machine-readable ANWA 0.2 schema](anwa-0.2.schema.json)
- [Calculator, Orders, Reports and Advanced Todo demos](../demo/README.md)

Using **Bun ^1.4.4**, run `bun install --frozen-lockfile`, `bun run validate`, `bun run codegen`, `bun run types:orders`, `bun fmt --check src demo test tools`, `bunx oxlint src demo test tools`, `bun check`, `bun test`, `bun run demo` and `bun run demo:todo`. The demos use only top-level Interactions. Orders and Reports pass dynamic identifiers through typed input.

The reference adapter does **not** provide network bindings, authentication, persistence, production error mapping, full JSON Schema validation, or evidence that an unfamiliar AI agent performs better. **Named Guards declared on Actions run automatically before their business handler**. A guarded binding supplies `{ run, onDenied }`: denial blocks `run`, and `onDenied` provides only the Context next candidates while the Runtime preserves the Guard error outcome. This is a preflight check, not an authorization or atomicity guarantee. Federation/external API delegation and protocol adapters remain future topics.

**W3C WoT Thing Descriptions are Thing-centered. ANWA's core intentionally is not.** A future WoT adapter may represent an ANWA application through whatever compatible mapping it can support, but must not impose WoT's Thing concept on ANWA's schema or claim unsupported conformance.

## Primary references

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

[README](../README.md) · [Architecture](../docs/architecture.md) · [Earlier v0.1 profile](anwa-0.1.md)
