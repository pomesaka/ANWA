# ANWA 0.1 — Executable Contract Profile

> **Experimental specification candidate, not adopted.** This small testable profile is for the reference adapter and demos. It does **not** claim W3C WoT conformance, network interoperability, security, or production readiness.

## 1. Purpose and responsibility

ANWA supplies four common mechanisms: **Description, Binding, Discovery, Interaction**. Developers decide their domain model, Thing granularity, business rules, handlers, resource relations, and next-interaction hints. Agents choose what to do based on a user's delegated goals. ANWA does **not** infer the correct business workflow.

The reference profile chooses **JSON description manifests and a Node.js in-process adapter** to make examples executable. These are prototype choices rather than permanent transport or SDK commitments.

Terms remain WoT-aligned: Thing, Property/Action/Event Affordance, Link, DataSchema. ANWA's Outcome + Context and reference structures are **additional conventions, not W3C WoT TD 1.1 fields**.

## 2. Public Description

The `anwa.json` manifest contains:

| Field | Profile status | Meaning |
| --- | --- | --- |
| `anwa` | Required; literal `"0.1"` | This experimental profile |
| `entrypoints` | Required; nonempty `ThingRef[]` | Application-chosen starting points for a connected client |
| `things` | Required; map keyed by model name | Published Thing-type descriptions |
| `things[type].title` / `description` | Required strings | Discoverable name and semantic purpose |
| `properties` / `actions` / `events` | Optional maps | Interaction name → description |
| `links` | Optional map | Declared relation description and target Thing type |
| `semanticTypes` | Optional on Thing/interaction | Nonempty array of unique absolute HTTP(S) URI or URN identifiers of application-chosen meaning; no JSON-LD conformance implied |
| `hasSideEffects` | Optional boolean on Action only | `true`: may cause business-observable side effects; `false`: declares none; omission: unknown |
| `idempotent` | Optional boolean on Action only | Repeated same-input invocation has the same intended business-observable effects as one invocation; omission: unknown |

A declared interaction requires a `description`. Optional `input` and `output` are **JSON Schema 2020-12** documents describing typed payloads. Absent `input` means no input. Absent `output` means no declared successful output shape. A named `guard` reference and `errors` may be declared, **but are not core requirements**. When an interaction can return expected domain failures, its `errors` map **must exhaustively enumerate their codes**. Missing `errors` means the interaction has no declared domain failures; it does not allow arbitrary error codes. Runtime-provided `INVALID_INPUT` and `UNEXPECTED_ERROR` are reserved, not listed in application schemas.

See [JSON Schema for the ANWA manifest and reusable response types](anwa-0.1.schema.json) and the [agent-native schema design contract](agent-native-schema.md). The reference tooling validates ANWA-specific manifest structure, references, documented interactions, error codes, and a **constrained JSON Schema subset** (`type`, `enum`, `description`, `required`, `properties`, `items` and `additionalProperties:false`). Unsupported input/output keywords are rejected by the manifest validator rather than silently accepted. **Full JSON Schema 2020-12 validation is not implemented.** See [Schema authoring and generated interfaces](../docs/schema-authoring.md).

ANWA's `hasSideEffects` is not an alias for WoT TD 1.1 `safe` (which concerns internal resource state); an adapter must map their semantics deliberately. Unlike WoT TD field defaults, **ANWA omitting either flag means unknown**. See [Agent-native schema design](agent-native-schema.md).

## 3. Reference semantics

### ThingRef

```json
{ "type": "Order", "id": "123" }
```

- `type` is a declared Thing model key.
- `id` is a **nonempty opaque string chosen by the application**.
- The tuple is scoped to **one connected ANWA application instance**, not to the entire internet.
- Same model for service-style `{"type":"Calculator","id":"main"}` or entity-style `{"type":"Order","id":"123"}` Things.
- The framework does not require a particular database key, URL, routing pattern, registry or persistence policy.
- Application bindings decide whether a given instance `id` currently exists.

### InteractionRef

```json
{
  "thing": { "type": "Order", "id": "123" },
  "kind": "action",
  "name": "cancel"
}
```

- `kind` is `property`, `action` or `event`.
- `name` must appear under the matching Thing type and interaction category.
- Resolution is deterministic: `thing.type` → model description; `kind + name` → interaction description and application-provided binding; `thing.id` is forwarded unchanged to the handler.
- An interaction's presence **does not imply current applicability, authorization or successful execution**.
- Unknown types, names or missing bindings are distinct from an application handler's expected domain error. A network adapter must later specify how such failures map to its transport.

**The specification does not fix how many Things an application needs.** It defines how references are understood if the developer publishes them.

## 4. Discovery

The in-process adapter exposes the following *logical* calls (not a new wire protocol):

| Call | What a client gets |
| --- | --- |
| `catalog()` | Available Thing-type summaries and author-chosen `entrypoints` |
| `discover(ThingRef)` | Bound Thing description, typed interaction references / schemas, declared errors and optional semantic/effect metadata, declared link types, plus context supplied by the app |

`discover` returns `{description, context}`. Clients can follow `description.interactions[].ref` or `context.affordances[].ref` to invoke a matching handler or subscribe to an Event. Follow-up references are meaningful only within the connected application's scope.

The app should publish only what the caller may see. **The reference implementation has no authorization/filtering mechanism**; deployment without one is unsafe for sensitive services.

## 5. Interaction Result

The base `interact(InteractionRef, input?)` returns a **settled domain result** and Context:

```json
{
  "outcome": {
    "kind": "settled",
    "result": { "ok": true, "value": 5 }
  },
  "context": { "links": [], "affordances": [] }
}
```

A domain failure uses exactly the same outer shape:

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": { "code": "INVALID_OPERAND", "message": "Not allowed" }
    }
  },
  "context": { "links": [], "affordances": [] }
}
```

### Required semantics

- `outcome` must exist. For base profile, `outcome.kind` = `settled`.
- `result.ok` discriminates success/failure. Successful results have a `value` (can be `null`); failures have an `error.code` (nonempty machine-readable string).
- `context` must exist, containing **`links` and `affordances` arrays**, both allowed to be empty.
- A Link is `{rel:string,target:ThingRef}`. The relation's meaning is application-defined; global registration is not assumed.
- An affordance reference is `{ref:InteractionRef}`. It may optionally include an application-supplied `applicability` hint (`available` / `blocked` / `unknown`), separate from WoT's Interaction Affordance definition and from authorization.
- **The application selects** contextual links/affordances; ANWA conveys and validates them, but does not decide which next action best satisfies a user's goal.
- Action-level `hasSideEffects` and `idempotent` are **untrusted application declarations**, not runtime-enforced guarantees. Omitted values are unknown, not `false`. An outcome's `error.effects` instead relates to effects after a particular attempt.
- Expected domain error `code`s **must appear in that interaction's declared `errors` map**. Undeclared domain errors, handler exceptions and contract violations become opaque `UNEXPECTED_ERROR` results (`effects: unknown`), with no internal detail disclosed. `INVALID_INPUT` is a separate framework validation failure. Error `message`, `details`, `retry` and effect information are optional, application-supplied fields; retry advice is not a guarantee of safe duplication.
- `settled/ok` means this particular interaction completed, not necessarily that the user's broader task has completed.
- This contract applies only to **delivered application-level outcomes**. A dropped connection may yield no ANWA Result.

## 6. Binding

Application code binds every declared Property/Action to a handler. For Event interactions it supplies an optional observation source. The framework checks declared bindings, routes requests to the implementation, validates a limited payload schema subset in the demo, and wraps returned `ok(value)` / `fail(code,...)` in `Outcome + Context`.

An application may implement a `context` resolver to provide links or affordance references on Discovery and following each interaction. A named Guard is an **optional implementation hook**: one guard can be reused by Discovery's advisory applicability and Interaction's actual check. Reuse **does not** prevent races; applications remain responsible for atomic transitions and permission enforcement.

An implementation's exceptions are not the same as typed domain failures. The demo maps unexpected exceptions **and undeclared error codes** to a generic `UNEXPECTED_ERROR`, suppressing internal details. Errors from context assembly likewise produce an opaque `UNEXPECTED_ERROR` with empty Context; potential side effects are marked unknown. Unknown/unbound interaction refs in the in-process adapter throw *outside* the domain Result boundary; a future network binding needs its own transport-level mapping.

## 7. Optional asynchronous execution and observation

An extension can return an accepted execution reference:

```json
{
  "outcome": {
    "kind": "accepted",
    "execution": { "type": "Execution", "id": "job-1" }
  },
  "context": { "links": [], "affordances": [] }
}
```

`accepted` is **not** successful completion. An application may represent an Execution as a Thing with status, result and event interactions. This is a valid design option, not a requirement for every ANWA application.

The experimental adapter exposes `observe(EventInteractionRef, options?) → AsyncIterable` for author-supplied observations. An event stream can contain status updates, progress and artifact chunks, ending with a settled Interaction Result, as shown in `demo/reports`.

**No production durability, replay guarantee, network streaming, exactly-once processing, safe cancellation, backpressure, or generalized ordering is provided.** SSE, gRPC and WebSocket are possible future bindings, not the ANWA core.

## 8. Coverage by three applications

| Demo | What it proves expressible | What it doesn't imply ANWA must manage |
| --- | --- | --- |
| [Calculator](../demo/calculator/) | Stateless service Thing, typed inputs, success/error, empty Context | State machines, guards, persistent records |
| [Orders](../demo/orders/) | Entity-level Things, code-based Guard, Links and next actions | Choosing order lifecycle or enforcing database transactions |
| [Reports](../demo/reports/) | Async acceptance and execution reference, in-memory event updates, final Result | A built-in workflow engine or a particular streaming protocol |

**These are coverage tests, not canonical application architectures.**

## 9. Developer tooling (experimental)

Schema-first authoring includes **interface generation and validation**, not generation of application business logic:

```bash
npm run validate       # validate the three demo manifests against the supported subset
npm run types:orders   # generate demo/orders/types.generated.d.ts
npm run inspect:orders # human-readable summary of Thing actions, fields and errors
npm test               # also checks declared error behavior at runtime
```

The generated TypeScript types are based on the manifest's declared input/output schemas and domain error codes. They can guide typed Handler implementations, but cannot prove the real code satisfies business constraints or side-effect invariants. The current demos are JavaScript and do not yet compile against the generated declarations.

AI-friendliness is **not established merely by structured JSON**: machine-addressable semantic identifiers, field descriptions, action effect hints, error coverage and progressive Discovery provide candidate signals, but comparative agent evaluations have not been performed. The raw machine-readable manifest is not necessarily the best **agent consumption interface**. Human ease of authoring is **not** an ANWA design objective.

External API delegation/federated references are a future research direction; the current prototype only resolves refs within one connected application.

## 10. Framework decisions still open

1. Full JSON Schema 2020-12 validation versus a constrained dialect.
2. Error details, retry/effect semantics and their extension boundaries.
3. Authorized catalogs/descriptions/context filtering and privacy guarantees.
4. Scope, lifetime and cross-connection addressing of refs.
5. Negotiation of async and observation extensions; compatibility with base clients.
6. WoT TD 1.1 mapping (Forms, security and other mandatory fields) versus WoT-inspired vocabulary only.
7. Runtime conformance tests, versioning, transport adapter guarantees.
8. Evidence that optional `semanticTypes`, `hasSideEffects` and `idempotent` improve unfamiliar agents' task accuracy without creating false safety confidence.

## Primary specifications

- [WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [WoT Discovery](https://www.w3.org/TR/wot-discovery/)
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)
- [OpenAPI](https://spec.openapis.org/oas/latest.html)
- [Hydra Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/)
- [A2A specification](https://a2a-protocol.org/latest/specification/)

[Demo guide](../demo/README.md) · [ANWA boundaries](../docs/scope-and-boundaries.md)
