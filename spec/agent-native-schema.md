# ANWA — Agent-Native Schema Design Contract

> **Working design intent; 2026-11-01.** The reference implementation currently uses the experimental [ANWA 0.1 profile](anwa-0.1.md). This document identifies what an ANWA schema **should** optimize for and what is already testable. This is not a claim of superior measured LLM performance or WoT conformance.

## Who is the schema for?

Two primary consumers:

1. **Implementing agents**, which produce application code, adapters and tests from a shared, machine-checkable public contract.
2. **Consuming agents**, which discover an unfamiliar application, choose applicable interactions, provide typed inputs, interpret typed outcomes, and follow application-provided links/affordance references.

**Human ease of writing/editing is not a design objective.** An editor, a natural-language instruction, a generated UI, or another agent may produce the manifest. An `inspect` view may help debug it, but no design choice should be justified solely as more readable for people.

The essential properties are **semantic precision, deterministic resolution, verifiability, safe defaults, partial disclosure, minimal context load, and extensibility**. The shape must not prescribe application-specific business workflows.

## The schema is a contract, not a program

| Responsibility | ANWA schema / framework | Application implementation |
| --- | --- | --- |
| Domain concepts | Descriptions and **optional semantic identifiers** for published Things and interactions | Chooses Thing boundaries and actual concepts |
| Interactions | Declared Property / Action / Event, typed input/output | Implements handlers and effects |
| Guard | Optional named hook | Actual predicate and authorization / consistency enforcement |
| Domain errors | Exhaustive application-declared error codes | Chooses which errors exist; implements conditions |
| Effects and repeatability | Optional `hasSideEffects` / `idempotent` booleans on Actions | Actual side effects, retries, enforcement and concurrency |
| Navigation | Typed Links and InteractionRefs, optional applicability hints | Which links/affordances are included for this context |
| References | App-scoped ThingRef + InteractionRef resolution | Instance existence and resource identity policy |
| Protocol | Logical Discovery / Interaction contracts, adapters to be defined | Hosting, storage, permissions and transports |

Neither natural-language descriptions nor semantic identifiers nor effect declarations are proof that an action is safe, authorized, or guaranteed to succeed.

## Candidate v0.1 machine description vocabulary

The existing required fields remain unchanged. Two **optional** semantic annotations are now part of the experimental schema and Discovery representation:

### `semanticTypes` — machine-addressable domain meaning

Allowed on a Thing or interaction. Nonempty, unique absolute HTTP(S) URIs or URNs.

```json
{
  "title": "Purchase order",
  "description": "An order with a fulfillment state and cancellation operation.",
  "semanticTypes": ["urn:example:domain:PurchaseOrder"]
}
```

The vocabulary author is responsible for defining what the identifier means. The field is **not** a JSON-LD `@type` nor proof of W3C WoT conformance. Omitting it is valid: an opaque made-up URI with no shared semantics offers little practical advantage.

### `hasSideEffects` and `idempotent` — independent Action properties

Both fields are **optional booleans** on Actions, and are application-supplied declarations. The values are not inferred from the Handler.

- `hasSideEffects: true`: invoking the Action **may cause business-observable effects**, including domain state mutations or external operations (payments, notifications).
- `hasSideEffects: false`: the application asserts the Action will **not** cause such business-observable effects.
- `idempotent: true`: the application asserts repeating the same Action with the same input has the same intended business-observable effects as invoking it once.
- `idempotent: false`: that repeated-effect guarantee is not asserted.
- **Omitted:** unknown, distinct from `false`. A client MUST NOT treat missing values as a no-effect or repeat-safe guarantee.

Routine internal logs, tracing and metrics are excluded from `hasSideEffects` unless they themselves form part of the application's advertised domain behavior. The flags do not imply authorization, safe retries after network failure, ability to undo operations, or lack of concurrency concerns. A successful idempotency declaration is not a promise that two invocations produce identical response bodies.

```json
{
  "description": "Cancel an order when allowed.",
  "hasSideEffects": true,
  "idempotent": false,
  "input": {
    "type": "object",
    "properties": {
      "reason": {"type": "string", "description": "Reason provided for cancellation."}
    },
    "required": ["reason"]
  },
  "output": {
    "type": "object",
    "properties": {"status": {"type": "string"}},
    "required": ["status"]
  },
  "errors": {
    "ORDER_ALREADY_SHIPPED": "The order was dispatched.",
    "ALREADY_CANCELLED": "The order was already cancelled."
  },
  "guard": "canCancel"
}
```

These ANWA fields are **not the same as WoT TD 1.1 `safe`**, whose specification concerns the Thing's internal resource state. WoT also defines an `idempotent` flag, but its default/semantics are governed by that specification. **ANWA omission = unknown**, even though WoT TD processors assign defaults to their own fields. Mapping to a conforming WoT TD is a separate adapter concern.

An Action without either flag remains valid. Guards, state transition graphs, and recovery flows are not mandatory.

## Consumption contract

The most useful unit for a consuming agent is **a discoverable interaction description**, not an entire raw manifest. The runtime currently supports:

1. `catalog()`: published Thing summaries and entrypoints.
2. `discover(ThingRef)`: descriptions of offered interactions with their typed inputs/outputs, declared domain errors, optional semantics/effects and a navigation Context.
3. `interact(InteractionRef, input?)`: domain `Outcome + Context`, including **both success and expected domain failure**.
4. Optional `observe(EventInteractionRef)`: observations for apps that provide them, including asynchronous execution.

A `Context` can have zero Links and zero AffordanceRefs. It conveys choices the *application* exposes, not an instruction to the agent to execute them.

```json
{
  "outcome": {"kind":"settled","result":{"ok":false,"error":{"code":"ORDER_ALREADY_SHIPPED"}}},
  "context": {
    "links": [{"rel":"shipment","target":{"type":"Shipment","id":"ship-1"}}],
    "affordances": [
      {"ref":{"thing":{"type":"Shipment","id":"ship-1"},"kind":"property","name":"tracking"}}
    ]
  }
}
```

**Static declarations and dynamic outcomes are different.** `hasSideEffects` is a declaration about whether effects are possible; `result.error.effects` (if provided by an application) concerns effects after an actual attempt. `context.applicability` is an advisory hint, not authorization.

## Contracts an implementing agent should be able to enforce

The current reference toolchain supports a **subset**, not all envisioned checks:

1. **Manifest structure:** declared Thing names, descriptions, interaction categories, input/output shapes, known Link target types, optional semantics and effects.
2. **Bindings:** each published interaction has a user-implemented handler; named Guards resolve.
3. **Inputs/outputs:** runtime validates the supported JSON Schema subset.
4. **Domain errors:** expected error codes are exhaustively declared; undeclared implementation errors are mapped to `UNEXPECTED_ERROR`.
5. **Discovery fidelity:** public metadata, including semantic identifiers and the optional Action flags, is exposed without inventing new actions or domain state.

Important limits: **No full JSON Schema 2020-12 runtime validation, static TypeScript conformance of handlers, cross-service refs, security/authorization implementation, or automated proof that declared side-effect/idempotency flags match actual behavior.** The current JSON Schema file is a meta-schema plus reusable response definitions; it is not itself a complete running network protocol.

## What not to optimize for

- Shortest possible JSON or visual aesthetics.
- Hand-editability or human-centric DSL syntax.
- Exhaustively enumerating application-specific business states or Guard conditions.
- Automatically selecting or ranking user business actions in the framework.
- Assuming one transport, one API architecture or global resource registry.
- Mistaking “model parsed JSON” for “model completed an unfamiliar app task correctly”.

## Next objective evidence

The proposed contract remains **a hypothesis** until an unfamiliar agent uses it without implementation access. Compare progressive Discovery against full manifests and external baselines (WoT TD, OpenAPI, MCP) with equivalent semantics. Measure successful goal completion, unsafe attempts, invalid tool calls, cost/tokens, and recovery.

## Primary specifications

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/): Thing, Property/Action/Event Interaction Affordances, Links, semantic annotations. ANWA alignment ≠ TD conformance.
- [W3C WoT Discovery](https://www.w3.org/TR/wot-discovery/): description discovery and access constraints.
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12): an established vocabulary for data types and validation; the prototype supports a constrained subset.

[0.1 contract](anwa-0.1.md) · [0.1 manifest schema](anwa-0.1.schema.json) · [Decision status](../docs/decisions.md)
