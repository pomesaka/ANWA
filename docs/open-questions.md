# Open questions — framework-level only

> **As of 2026-11-01.** See [scope and responsibility boundaries](scope-and-boundaries.md). We evaluate **what ANWA needs to let implementers build**, not how an example app ought to be modeled.

## How to evaluate any proposed concern

For a use case, ask:

1. **Representability:** Can the implementer express it through existing core primitives, extensions or adapters?
2. **Ownership:** Is any missing behavior a concern of ANWA, application code, infrastructure or the agent?
3. **Minimal mechanism:** If ANWA must cover the gap, what is the smallest reusable contract / extension point?
4. **Verification:** How can we test the capability without prescribing the domain solution?

See the [evaluation template and examples](scope-and-boundaries.md).

## P0 — Core expressive model

| Question ANWA owns | Why it matters |
| --- | --- |
| What is the minimal **public schema contract**? | Discoverable types, interaction definitions, descriptions, schemas, references; avoid baking in app policy |
| What is the minimal **Interaction Response**? | Stable Outcome + Context semantics on success/domain failure/accepted execution, with flexible/empty navigation hints |
| How can authors expose **Links / Affordance references** and optional applicability information? | Follow-up navigation without framework choosing the next business step |
| How should schema entries bind to **application-provided handlers, guards and resolvers**? | Authoring ergonomics and reliable declarations without duplicating business logic |
| How much does ANWA actually validate, expose or guarantee? | Distinguish representable, runtime-supported, automatically-derived and conformant behavior |
| How does **extensibility** work without turning every domain concern into a new core field? | Avoid prematurely standardizing use-case-specific policy |

## Newly bounded decisions

- **Domain error completeness:** expected domain codes must be declared; undeclared codes become `UNEXPECTED_ERROR`. Actual auditing and source error mapping still need design.
- **Schema-first tooling:** generate types/interfaces and validate schema + bound implementations; business logic remains authored code.
- **External API delegation:** desirable future capability, not part of the current app-scoped Ref profile.
- **AI readability:** the existing format is machine-readable but agent performance is not yet empirically measured; investigate compact Discovery and semantic field descriptions.

[Schema authoring notes](schema-authoring.md) document current validation coverage.

## P1 — Cross-cutting framework capabilities

| Question ANWA owns | What not to prescribe |
| --- | --- |
| How to express optional **states/transitions** and their public meanings? | Which states/transition graph the implementer chooses, or that all apps must use one |
| How to describe typed **domain errors**, retry hints and side-effect uncertainty? | Which failures an app produces or whether clients actually retry |
| What common representation is useful for **async accepted/execution/final outcomes**? | Durable engine, queue, data persistence or business execution semantics |
| How to expose optional **observation / streaming** semantics? | SSE vs WebSocket vs polling, unless implementing a particular adapter |
| How to support **safe exposure** of descriptions and contextual hints? | Application-specific authorization rules, permissions or business policies |
| How to **adapt protocols** (WoT, MCP, GraphQL, RPC) without semantic loss? | Forcing all implementations into one backend architecture |

## Not ANWA design questions

- Should every Order be a Thing? What is the best business entity granularity?
- What are the actual payment/order states or cancellation preconditions?
- Does the app use a state machine, events, queues, a database or a particular cloud?
- Which return-link is best for a specific end user's goal?
- Should an app use SSE, gRPC or a webhook for its own deployment?
- How is a specific `canCancelOrder` check implemented?

These may be **test scenarios**, but their answers belong to the app developer or its runtime/platform.

## Use cases are test vectors, not requirements

| Example test | What ANWA's expressiveness should be evaluated for | What remains app-defined |
| --- | --- | --- |
| Order Thing vs OrderService Thing | Can both declare interactions and relevant result context? | Which grain to use |
| Shipping blocks cancellation | Can a guard/result convey structured reason and follow-up link? | How shipping state is checked; actual policy |
| Async payment | Can an app return execution reference and later outcome? | Durability, payment execution, lifecycle details |
| Report streaming | Can an app expose incremental output and a final result? | Content generator, storage and delivery backend |
| No useful follow-up actions | Can a response represent an empty/redacted Context? | Whether anything is relevant or disclosed |

A failure in a test case should trigger a **scope review**, not automatic addition of a domain-specific primitive.

## Comparative validation

Compare the same domain functionality through traditional OpenAPI/RPC, WoT TD, MCP tools, and ANWA-style optional extensions/Result + Context. Hold business logic, model, descriptions, permissions and test budgets comparable.

Evaluate expressive coverage, schema/implementation duplication, correctness, task completion, wrong calls, token/call cost and interoperability. A valid outcome is to discover that existing standards are sufficient and ANWA can stay a thin authoring/runtime layer.

## Still undecided

Canonical schema/IDL, binding mechanism, required/optional Result fields, conformance and extension system, WoT interoperability strategy, adapters, runtime validation guarantees, async and observation abstractions, versioning and licensing.

[README](../README.md) · [Scope](scope-and-boundaries.md) · [Decisions](decisions.md) · [Architecture](architecture.md)
