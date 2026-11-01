# Agent-first schema contracts: generation, validation, and Discovery

> **Experimental ANWA 0.1 tooling.** These are prototype guarantees, not a released standard or a claim of measured AI usability. **Human ease of authoring is not a design objective**: the primary consumers are agents that implement applications and agents that operate them.

## Three separate concerns

| Concern | Purpose | Prototype support |
| --- | --- | --- |
| **Machine-readable contract** | Authoring agents declare the public meaning and I/O contract | JSON manifests under `demo/*/anwa.json`; syntax is an exchange contract, not a human-first DSL |
| **Interface generation** | Derive types/handler signatures from the manifest, *not* business logic | `generate` produces TypeScript `.d.ts` aliases for inputs, outputs, error-code unions and Handler signatures |
| **Contract validation** | Detect bad/missing declarations and implementation inconsistencies | Manifest validation on load, schema validator CLI, binding checks, runtime input/output checks and strict domain error-code enforcement |

The single public manifest is intended to prevent writing the same *contract* in YAML, TypeScript interfaces, and hand-maintained API docs. The developer still writes actual handlers, permissions, transactions and side effects.

## Commands

Using Node.js 20+:

```bash
npm run validate
npm run types:orders
npm run inspect:orders
npm test

# or directly for any new ANWA manifest:
node tools/anwa.mjs validate path/to/anwa.json
node tools/anwa.mjs generate path/to/anwa.json path/to/generated.d.ts
node tools/anwa.mjs inspect path/to/anwa.json
```

- `validate` reports paths to invalid properties, missing required descriptions, unresolved *declared Link target types*, unknown schema keywords and reserved/invalid error codes.
- `generate` emits **interfaces and type aliases only**, with names such as `OrderCancelActionInput`, `OrderCancelActionOutput`, `OrderCancelActionErrorCode` and `OrderCancelActionHandler`.
- `inspect` produces a diagnostic Markdown summary of Thing descriptions, operations, fields, Guards and declared domain errors. It is **optional diagnostic tooling**, not a reason to change or simplify the core schema.

**The generated declarations are currently illustrative and do not yet type-check the JavaScript demos at build time**. A TypeScript example compiling against them and TypeScript compiler integration are future acceptance tests.

## Errors: exhaustive contract

```json
{
  "cancel": {
    "description": "Cancel this order if permitted.",
    "errors": {
      "ORDER_ALREADY_SHIPPED": "Already dispatched.",
      "ALREADY_CANCELLED": "Order already cancelled."
    }
  }
}
```

For that interaction, **only these declared domain codes** can be surfaced as domain failures. A handler/guard returning a different domain code results in `UNEXPECTED_ERROR`, as do unexpected implementation exceptions and invalid output contracts.

The framework reserves `INVALID_INPUT` (request shape failure) and `UNEXPECTED_ERROR` (unexpected application/contract failure). The reserved codes **must not be listed under application errors**. In `UNEXPECTED_ERROR`, effect certainty is `unknown`, and internal exception text is not sent to the caller.

**Important limitation:** the reference adapter raises on unresolved invocations before entering its application-level Result envelope; it does not yet implement protocol-level error mapping, audit hooks or external-service safety.

## Which validation is implemented?

| Layer | What is checked | What remains open |
| --- | --- | --- |
| Description manifest | Required top-level fields, Thing/Interaction names, descriptions, entrypoint types, declared link target types, error maps | JSON Schema validator compliance / cross-service references |
| Embedded payload schema | Supported subset: `type`, `description`, `enum`, `required`, `properties`, `items`, `additionalProperties:false` | Full JSON Schema 2020-12 (e.g. `oneOf`, `$ref`, `format`, dependent constraints) |
| Implementation binding | Every declared interaction has a corresponding handler, named Action guard exists | Static TypeScript compilation against generated signatures |
| Interaction runtime | Input subset validation, declared domain error codes from actions/guards/properties, output subset validation | Formal effect/transaction correctness and cross-service policy |
| Context links and affordances | Referenced Thing type and interaction definition exist within this adapter | Whether instance ID exists, permissions, stale references, external API delegation |

**Never claim full JSON Schema conformance.** Unsupported payload-schema keywords are rejected for the reference subset, rather than silently ignored.

## Agent implementation vs agent consumption

The current `anwa.json` format is a **machine-readable contract**. How humans edit it or whether it looks elegant is not a primary concern; another agent or code generator may author it. The generated types and schema validator serve implementing agents, while the Discovery interface serves consuming agents. Neither needs to receive the entire raw manifest in a task context.

**Machine-readable ≠ empirically AI-friendly.** AI usability must be demonstrated using unfamiliar applications and tasks. Important dimensions include:

1. Purpose and semantics of each operation, with optional machine identifiers (`semanticTypes`) where a meaningful shared vocabulary exists, and field-level descriptions where useful.
2. Clear typed input and output, including complete expected domain error categories.
3. Minimal Discovery payload and navigable references, instead of always sending the full application manifest.
4. Explicit context for related resources and follow-up interactions when supplied by the application, and optional author-declared Action `effectKinds` (which are not safety guarantees).
5. Consistent evaluation of task success, wrong calls, token consumption and latency versus ordinary OpenAPI/MCP/WoT descriptions.

An `inspect` command and parseable JSON are **not evidence** that an unfamiliar AI performs better. See the [agent-native schema design contract](../spec/agent-native-schema.md).

## Future delegation

Cross-application/external API references and delegated operations are a worthwhile research direction. They are **not in the current reference scope**: a `ThingRef` is resolved within one connected ANWA app. A future adapter must define external authority, transport, authorization, provenance and error mapping without forcing application authors into one API topology.

[Experimental spec](../spec/anwa-0.1.md) · [Project README](../README.md) · [Scope](scope-and-boundaries.md)
