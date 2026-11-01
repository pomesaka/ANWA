# Proposal 0002 — ANWA Minimal Core

> **Status: Discussion draft, not adopted** · 2026-11-01  
> **Audience:** ANWA framework/spec authors. This proposal does **not** prescribe how an application author should design their business model.  
> **Purpose:** Identify the smallest interoperable concepts ANWA might need to let authors create agent-navigable applications.

## 1. Design question

> What must ANWA provide so that developers can express and expose application semantics, interactions, and contextual next-step references — without ANWA choosing domain objects, policies, workflows, or the next action for the agent?

A use case is a **test of expressiveness**, not a requirement to bake its domain model into ANWA.

For each requested capability, separate:
1. **Representable?** Can an application author express it using ANWA?
2. **Framework-owned?** Does the framework need a reusable mechanism for it?
3. **Automatic?** Is it feasible and worthwhile for ANWA to derive anything, or should the developer provide it?

Also distinguish **expressible**, **framework-supported**, **automatically generated**, and **guaranteed** — these are different levels of support.

## 2. Candidate minimal core

ANWA could have **four conceptual primitives**:

| Primitive | Framework/spec concern | What stays with the application developer |
| --- | --- | --- |
| **Description** | Machine-readable contract for *declared* Things, Property/Action/Event interactions, semantic descriptions, schemas, and Links, using WoT terminology where possible | Which Things, data, actions, relationships and meanings to expose; whether an app has a state machine |
| **Binding** | A way to associate a declared interaction with an implementation handler/resolver and validate what can be checked | Business rules, guard algorithms, storage, side effects, transactions, permission decisions |
| **Discovery** | A way for a client to obtain **authorized, applicable descriptions** and resolve references to declared interactions | Which descriptions to publish, how to organize them, filtering/ranking/recommendations; infrastructure and directory choice |
| **Interaction** | A common logical invocation/response contract: **Outcome + Context** with referenceable Links and Affordance hints | Which links/choices to provide in a given result; the actual value/error/effects; user's business workflow |

**These are not necessarily four protocols, network calls, file formats, or runtime modules.** They are separable responsibilities.

Discovery and Interaction may occur repeatedly in any order. Merely describing a capability does not grant permission or guarantee success.

## 3. Candidate semantic contract (illustrative, non-normative)

The [companion minimum-field proposal](0002-contracts.md) refines which elements would be required versus optional, and deliberately leaves instance-level Thing granularity to the application.

We are **not selecting TypeScript as the schema IDL**. The following notation only tests conceptual sufficiency.

```ts
// Definition-time: public descriptions are supplied by authors
type InteractionDescription = {
  name: string;
  kind: "property" | "action" | "event"; // WoT vocabulary
  description: string;
  inputSchema?: SchemaRef;
  outputSchema?: SchemaRef;
};

type ThingDescription = {
  description?: string;
  interactions: InteractionDescription[];
  links?: LinkDescription[];
};

// Runtime: authors provide implementations for declared interactions
type ImplementationBinding = {
  interaction: InteractionRef;
  handler: ApplicationHandler;
};

// Interaction-time: common semantic response
type InteractionResponse<T, E> = {
  outcome:
    { kind: "settled"; result: { ok: true; value: T } | { ok: false; error: E } }; // base contract
  // Async extension may add: { kind: "accepted"; execution: Ref }
  context: {
    links: LinkRef[];                // can be empty
    affordances: AffordanceRef[];   // can be empty
  };
};
```

In this sketch, `Ref`, `SchemaRef`, `LinkRef`, `AffordanceRef`, and `ApplicationHandler` are **intentional placeholders**, not finalized structures. A reference should be usable for subsequent discovery/invocation when exposed; **how** it resolves is a later compatibility question.

We should not require a `subject: ThingRef` just because one illustrative app returns data about an Order. Apps may choose service-level or entity-level Things, may affect multiple objects, or may return calculations. Whether subject metadata is useful is a separate extension question.

### What is common versus optional?

- **Common envelope:** For any delivered application-level Interaction Result, represent **Outcome + Context**. Context exists even with empty or redacted arrays. This is the current working direction.
- **Description vocabulary:** Prefer existing WoT Thing / Property / Action / Event / Link concepts rather than inventing another ontology. WoT conformance is **not yet claimed**.
- **Domain errors:** A structured, machine-readable error is a useful candidate common form. Specific codes, recovery explanations, retry advice and certainty about side effects remain application-supplied; exact standard fields are undecided.
- **Async:** An optional extension may add an `accepted` execution-ref outcome for apps with asynchronous execution. The baseline does not require a durable workflow engine, or even async handlers.
- **Contextual applicability:** An optional hint about what appears available to the caller at the current moment; **not** the definition of WoT Interaction Affordance and **not** an authorization grant.

## 4. Explicitly *not* in the mandatory core

These are **useful authoring/runtime extension candidates**, not conditions for ANWA compliance:

- State machines, state-transition metadata, statechart engines or a mandatory state vocabulary
- Guards; where used, a named reference to ordinary code is preferable to reimplementing business predicates as a schema DSL
- Automatic discovery-time guard evaluation or automatic selection/ranking of relevant next actions
- Durable execution engine, queues, storage engines, exactly-once processing or distributed transactions
- Stream transport (SSE, WebSocket, gRPC), replay window, persistence and backpressure strategy
- A particular Thing granularity, entity identifier structure, domain workflow or UI
- A specific HTTP, GraphQL, MCP, A2A, JSON-LD or RPC binding
- Any blanket promise that a failed network request can return an application Result

These should be **possible to integrate where appropriate**, not universally required.

## 5. Separate optional extension points

| Extension candidate | Minimal question for the core |
| --- | --- |
| **Guard binding / applicability** | Can an author register an evaluator, and optionally contribute a structured hint to Context, without making the framework implement the business rule? |
| **State / transitions** | Can an author supply state metadata or a transition model, without demanding all apps use one? |
| **Async Execution** | Can a response reference an execution for later inspection without requiring every app to run a workflow engine? |
| **Observation / streaming** | Can a separately negotiated stream/event interface deliver updates without changing the meaning of the final Outcome? |
| **Protocol adapters** | Can the semantic contract be projected to a concrete protocol without silently claiming unsupported guarantees? |
| **Discovery enhancements** | Can implementers add search, relevance ranking, and access policies without forcing one algorithm on the core? |

## 6. What to validate first

A minimal framework proof-of-concept (not an application architecture prescription) should demonstrate:

1. **Description:** An author can publish a typed description of a simple interaction.
2. **Binding:** A handler written in ordinary code can be registered for that interaction.
3. **Discovery:** A permitted client can discover the description and follow a returned interaction reference.
4. **Interaction:** Handler success **and** domain error each produce `Outcome + Context`.
5. **Navigation:** Context can return a link/affordance reference chosen by the application, and an empty Context is valid.
6. **No hidden mandates:** Neither a state machine, guard, persistent entity per Thing, nor stream is required for the minimal example.

This proof should use more than one app layout (e.g. per-object Thing **and** service-oriented Thing) **only to test representability**, not to choose the better business model.

## 7. Open spec decisions *actually owned by ANWA*

- **Canonical representation:** Is the WoT Thing Model sufficient as the public Description, or does ANWA need a separate intermediate form?
- **Required vs optional metadata:** Which descriptions and reference fields are essential for a generic client to navigate?
- **Reference semantics:** What does it mean for a reference in Context to be resolvable? How are scope and authorization reflected?
- **Result semantics:** Exact generic success/error/accepted model, and relationship to transport errors.
- **Binding contract:** How handlers/resolvers attach to descriptions and what consistency tooling can verify.
- **Extension and conformance system:** How apps opt into guards, state metadata, async and streaming without compromising the minimal core.
- **Adapter fidelity:** Which semantic fields survive transport into WoT/MCP/OpenAPI/GraphQL and which need explicit extensions?

**Not unresolved ANWA questions:** the number of Things in an app, an Order's state graph, how a shipping guard works, which payment retry policy is best, and the database/queue/SSE choice for a particular deployment.

## 8. Relationship to prior art

- [WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) — Thing/Interaction Affordance/Link/DataSchema vocabulary, plus Thing Models as reusable descriptions.
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.2.1.html) — schema-first machine-readable HTTP interface description, not ANWA's transport-independent Result model.
- [Hydra Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/) — existing hypermedia and supported-operation concepts.
- [RFC 8288](https://www.rfc-editor.org/info/rfc8288) — Web link relation semantics.

ANWA must not claim that descriptive APIs or hypermedia navigation are novel. The differentiator to **test** is a reusable authoring/runtime experience around a **common outcome-plus-context contract for agents**.

## Related project documents

- [Proposal 0002A — minimum fields for Description and Interaction](0002-contracts.md)

- [Responsibility boundaries](../scope-and-boundaries.md)
- [Current working decisions](../decisions.md)
- [Open framework-level questions](../open-questions.md)
- [Interaction model](../interaction-model.md)
- [Proposal 0001 — richer Interaction schema (Draft PR)](https://github.com/pomesaka/ANWA/pull/1)

This document is an invitation to narrow the core, not an assertion that the shape above is finalized.
