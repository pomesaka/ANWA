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

The experimental manifest contains exactly three top-level fields:

| Field | Status | Meaning |
| --- | --- | --- |
| `anwa: "0.2"` | Required | Experimental contract profile |
| `interactions` | Required nonempty map | App-scoped `InteractionRef → InteractionDefinition` |
| `entrypoints` | Required nonempty list | References to declared Interactions offered to a connecting agent |

The supported Interaction kinds are:

- **`query`** — read or retrieve typed information. This is an ANWA term, not WoT's Thing-bound PropertyAffordance.
- **`action`** — invoke an operation, with optional side-effect and idempotency declarations.
- **`event`** — observe an app-defined stream of events, with optional input.

Every Interaction has a `kind` and a meaningful `description`. It may also declare an `input`, `output`, exhaustive expected `errors`, and optional `semanticTypes`. Actions alone may additionally declare named `guard`, `hasSideEffects`, and `idempotent`. Omitted side-effect and idempotency values are **unknown**, not `false`.

The reference validator implements a **constrained subset** of JSON Schema Draft 2020-12 for data types, not full specification conformance.

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

```js
const app = new AnwaApp(manifest).bind({
  "calculator.add": async ({ input }) => ok(input.a + input.b)
});

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

## Tooling, demos and limitations

- [TypeScript reference runtime](../src/anwa.ts)
- [TypeScript schema validator / generated types](../src/schema-tools.ts)
- [Machine-readable ANWA 0.2 schema](anwa-0.2.schema.json)
- [Calculator, Orders and Reports demos](../demo/README.md)

Using **Bun ^1.4.4**, run `bun install --frozen-lockfile`, `bun run validate`, `bun run types:orders`, `bun fmt --check src demo test tools`, `bunx oxlint src demo test tools`, `bun check`, `bun test`, and `bun run demo`. The demos use only top-level Interactions. Orders and Reports pass dynamic identifiers through typed input.

The reference adapter does **not** provide network bindings, authentication, persistence, production error mapping, full JSON Schema validation, or evidence that an unfamiliar AI agent performs better. Optional named Guards must be explicitly assessed by their own Handler; ANWA does not automatically enforce application authorization. Federation/external API delegation and protocol adapters remain future topics.

**W3C WoT Thing Descriptions are Thing-centered. ANWA's core intentionally is not.** A future WoT adapter may represent an ANWA application through whatever compatible mapping it can support, but must not impose WoT's Thing concept on ANWA's schema or claim unsupported conformance.

## Primary references

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

[README](../README.md) · [Architecture](../docs/architecture.md) · [Earlier v0.1 profile](anwa-0.1.md)
