# Scope and responsibility boundaries

> **Working direction — 2026-11-01.** Design principles, not a ratified conformance specification.

## The core distinction

**ANWA defines tools for application authors; it does not design their applications for them.**

A use case can reveal a gap in a framework. It does **not** automatically become a mandatory ANWA feature, API field, persistence policy or domain modelling rule.

For any question, ask three different things, in this order:

1. **Can an application author express or implement this use case with ANWA?** (expressiveness / extensibility)
2. **If not, is the missing capability part of ANWA's core responsibility?** (scope)
3. **If yes, what minimal framework contract or primitive enables it?** (design)

A framework can *allow* an app to do something without *performing it automatically*, and without *requiring every app to do it*.

## Responsibility model

| Layer | Owns | Does not own |
| --- | --- | --- |
| **ANWA specification** | Optional/composable primitives and contracts to describe an agent-facing application: discoverable descriptions, references, invocation contracts, semantic outcomes, related links / affordance hints, optional observation | Business entity boundaries, state-machine topology, which actions exist, which hints to publish, product workflows, business policy |
| **ANWA framework/runtime** | Schema parsing/validation, binding declarations to implementations, exposing declared contracts, carrying/serializing supplied outcomes and context, enabling adapters and extension points (specific guarantees TBD) | Inventing a business workflow, discovering the true intent behind arbitrary code, enforcing domain invariants it has not been configured to enforce, promising durable jobs or safe retries by default |
| **Application developer** | Thing/resource granularity, schema contents, action/guard/resolver logic, state model if needed, data ownership and persistence, selected links and next-action hints, auth policy, concurrency rules, runtime deployment | Redefining ANWA's common interoperability semantics when choosing to use them |
| **Underlying platforms/protocols** | Database transactions, queueing, network delivery, transport-level status, storage and durability according to chosen implementation | Domain-level guidance; uniform ANWA response semantics unless mapped by an adapter |
| **Agent/client** | User's delegated goal, which candidate to inspect/invoke next, presentation to humans where appropriate | Treating untrusted service text as privileged instructions or bypassing the service's authorization |

The framework's exact validation/enforcement features are not yet specified. **Do not present every potential runtime capability as guaranteed or mandatory.**

## Examples: expressibility versus policy

| Example use case | Should ANWA provide a way? | Who decides what actually happens? |
| --- | --- | --- |
| Order is a Thing, versus OrderService is a Thing | Both styles should be representable where practical; **ANWA does not prescribe Thing granularity** | Application developer |
| A cancellation has a guard involving a shipping provider | A named guard and a structured result should be expressible; implementation may be ordinary code | Application developer |
| An interaction yields relevant shipment links and next actions | Result Context should be able to carry such references and explanations | Application developer supplies/selects them; framework transports/exposes them |
| A domain defines `draft → pending → paid` | State/transition metadata may be expressible if useful, but **not mandatory for every app** | Application developer |
| A payment runs asynchronously | ANWA may expose a common way to describe an execution reference or observation; **does not mandate a workflow engine** | Application developer / chosen infrastructure |
| Progress is delivered by SSE vs WebSocket vs polling | Observation semantics may be reusable independent of transport | Implementation/adapter and deployment |
| Retry after a transient domain error | Typed retry guidance and effect uncertainty may be expressible | Application code gives warranted facts; client decides whether to retry within user constraints |
| Which option is best after a failed cancellation | ANWA can convey available alternatives but does **not decide the next business action** | Application supplies hints; agent chooses based on delegated goal |

**A framework contract need not guarantee all possible use cases.** Evaluate expressive power, interoperability, safety and complexity to decide if a primitive belongs in core, extension or out-of-scope.

## Levels of support (avoid conflating them)

- **Representable:** an app can describe a concept using fields, references, or extension points.
- **Supported by framework:** reusable runtime/tooling validates and exposes that concept.
- **Automatically derived:** runtime can compute a value from declared metadata and supplied implementations.
- **Guaranteed:** the spec requires a behavior and conformance tests can verify it.

Example: ANWA may allow a developer to provide next-step affordances in a Result (**representable**). It need not automatically choose those affordances (**not necessarily automatically derived**) or guarantee that a particular follow-up action will be available/succeed (**not guaranteed**).

## Red lines for this project

1. Do not make app-specific domain models or workflows into universal ANWA requirements.
2. Do not confuse use-case coverage with framework responsibility.
3. Do not build a separate business-rule language solely to avoid ordinary implementation code.
4. Do not treat WoT vocabulary alignment as automatic WoT conformance.
5. Do not promise that network loss, external side effects, authorization or durable workflow execution is solved merely by returning structured metadata.
6. Do not claim that every Interaction must have a nonempty list of next steps or that the framework dictates a next step.

## Evaluating new proposals

For each proposed feature, write down:

| Question | What to capture |
| --- | --- |
| Use case | One concrete scenario; **not itself a design requirement** |
| Needed expressive power | The abstract thing an application author must be able to represent or do |
| Existing path | Can current ANWA concepts, WoT or a generic extension already express it? |
| Ownership | ANWA specification, framework runtime, application code, infrastructure, or agent? |
| Decision | **Core primitive**, optional extension, adapter concern, or out of scope |
| Verification | A small conformance test or proof-of-concept demonstrating the primitive works |

## Current ANWA thesis

ANWA is a **schema-first, protocol-agnostic framework concept** for making user-authored application semantics, interactions and their outcomes legible and navigable to AI agents. Application developers describe what their app exposes and implement its behavior; ANWA supplies common mechanisms to publish and interact with that model, including Result + contextual links/affordance hints.

This statement does **not** decide how a particular application is structured or require state machines, named guards, links or streaming for every use case.

[README](../README.md) · [Decision status](decisions.md) · [Architecture](architecture.md) · [Open questions](open-questions.md)
