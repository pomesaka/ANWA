# Working direction and decision status

> **As of 2026-11-01.** This file records the current **conversation consensus**, not accepted normative requirements or an implemented spec. Change decisions through discussion and evidence.

## Current direction (design intent)

| Topic | Current direction | Limits |
| --- | --- | --- |
| Product position | **Schema-first agent-native web application framework** | No SDK or wire protocol exists yet |
| Authoring | Developer writes an OpenAPI-like public application schema, then implements it in ordinary code | Schema syntax/format not chosen |
| Protocols | **Protocol-agnostic semantic model**, adapters as needed | No binding or compatibility guarantee chosen |
| Vocabulary | **WoT-aligned** Thing, Property/Action/Event Affordance, Link, Form, DataSchema | Not automatically conforming to WoT TD 1.1 |
| State | States and possible transitions belong in the public/application contract where useful | State-machine engine and persistence not chosen |
| Guard | Schema **references** a named guard and declares its contract/errors; code executes guard logic | Do not invent a declarative guard language or duplicate complex conditions |
| Action | Handler executes business logic and side effects | Actual authorization, transactions and races require runtime/storage enforcement |
| Discovery | Exposes meanings, relationships, interaction descriptions and state-specific applicability hints | Discovery and Interaction need not be separate transports |
| Interaction Response | **Outcome + Context** for application-level success, domain failure and accepted async work | No response can be guaranteed on transport loss; context may be empty |
| Next interactions | Follow-up links and affordance references describe **choices**, not mandatory instructions | AI chooses based on delegated user intent |
| Error semantics | Typed domain errors, retry guidance and effect uncertainty over relying on status codes alone | Transport status codes remain useful for protocol interoperability |
| Async | Separate **domain state** and **execution state**; accepted work returns a reference | Durable engine, lifecycle, cancellation semantics TBD |
| Streaming | Observation/partial output, distinct from business state; snapshots and terminal outcomes remain central | Replay, ordering and cursor rules TBD |
| UI | Not required for the core interface; human views may be supplied/generated | Presentation policies TBD |

## Unresolved (do not accidentally state as decided)

- YAML vs JSON vs TypeScript vs other schema expression
- Exact Thing-to-business-entity mapping
- Exact `InteractionResponse`, `GuardDecision` and event fields
- WoT-native binding vs WoT-inspired vocabulary with adapters
- How framework verification relates declared transitions to atomic business updates
- Context completeness, authorization filtering, revision/freshness semantics
- Execution persistence, stream replay, cancellation and idempotency contracts
- Formal spec/compliance/versioning, packaging and licensing

## Why we changed direction

Earlier discussions made **State Machine** look like the framework's authoring entrypoint. We now prefer **public schema first, implementation second**. State and transition declarations are *part of* that schema where helpful, not a requirement to write the entire application as a statechart or to encode Guard predicates in YAML.

Likewise, earlier ANWA notes used **Affordance** to mean "currently executable action." We now use **WoT Interaction Affordance** for an offered interaction and **contextual applicability** for dynamic, caller-specific hints. Actual permission is enforced at invocation.

Finally, the response is about what to explore/do **after any interaction**, not just recovery after errors.

## Where to read next

- [Vision](vision.md) — why this exists
- [Architecture](architecture.md) — schema → implementation → runtime
- [Order cancellation example](examples/order-cancellation.md) — public schema and one named guard implementation
- [Interaction model](interaction-model.md) — Result + Context, async and streaming
- [Glossary](glossary.md) — WoT terminology
- [Open questions](open-questions.md) — remaining research

[README](../README.md)
