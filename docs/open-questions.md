# Open questions and evaluation plan

> **Current as of 2026-11-01** · Non-normative. Start with [decision status](decisions.md) to distinguish current direction from pending choices.

## Agreed direction, not questions we need to re-litigate now

- **Schema-first:** author an OpenAPI-like *public contract*, then implement guards, handlers and resolvers in ordinary code.
- **Guards are code:** the schema refers to a guard name/contract; it does **not** reimplement arbitrary business conditions as a declarative predicate DSL.
- **WoT vocabulary baseline:** Thing, Property/Action/Event Interaction Affordance, Link, DataSchema, Form; **contextual applicability** is separate from the WoT meaning of Affordance.
- **Common interaction concept:** a delivered application response provides an **Outcome + Context**, for both business success and failure.
- **Protocols are bindings:** do not select GraphQL, RPC, HTTP or MCP as the essence of the model.
- **Async ≠ streaming:** domain state, execution state and observation/delivery are distinct.

These are *design intent*, not a ratified technical standard.

## P0 — Make the schema-first contract precise

1. **Schema expression:** YAML/JSON/IDL/TypeScript? Is there a canonical intermediate representation independent of user authoring style?
2. **Thing granularity:** one business entity per Thing, or a service with actions over many entities? How should related resource instances be identified?
3. **Transition contract:** which states/transitions should be publicly declared? How are multiple outcomes, internal events, and side effects represented without duplicating logic?
4. **Guard contract:** input type, structured `allow/deny` result, explanation, error codes, Links and Affordance references. When is evaluation optional/expensive? How do we filter sensitive reasons?
5. **Schema/implementation drift:** build-time binding validation vs runtime state validation vs storage transactions. How can we report violations and version changes?

## P1 — Make Interaction Response usable

6. Exact logical type: `Outcome` settled Result or accepted Execution; always a `Context` object, with potentially empty/restricted hints.
7. How much Context is returned: full list, refs only, pagination, relevance filtering by intent, consistency/freshness/revision?
8. Should an unavailable Action appear as a **blocked** contextual hint, be omitted, or both according to policy?
9. What does `retry` mean in presence of side effects, timeouts, deduplication keys and unknown outcomes?
10. What ensures every **application-level** response includes Context without promising anything on network failure?
11. How to map typed domain errors and Result to protocol errors such as HTTP/gRPC while preserving transport semantics?

## P2 — Async execution, observation and state machines

12. Is an Execution a WoT Thing or a transport-neutral resource adapted to Things?
13. Distinguish accepted / running / awaiting input / completed / failed / cancelled. When is `Result` final and when can a domain state change afterward?
14. Which data should be persisted: domain transitions, execution state, progress, artifact chunks? Which are ephemeral?
15. Snapshot/stream race, cursor/sequence numbers, replay windows, ordering scope, duplicates and backpressure?
16. What is the contract for cancel and human approval? Neither guarantees undoing external effects.

## P3 — Interoperability, safety and evaluation

17. Is WoT Thing Model/TD sufficient with extensions, or is a separate internal ANWA model preferable?
18. How are WoT/MCP/A2A/GraphQL/OpenAPI adapters generated without claiming capabilities unsupported by their protocols?
19. Untrusted descriptions/guard reasons should not become executable instructions for an AI. How should policy enforcement and provenance work?
20. Would an agent really navigate unfamiliar apps more accurately, with less latency/tokens and less developer annotation than existing tools?

## Experiment proposal

Use one order-management domain (Order, Payment, Shipment, cancellation). Hold business behavior, permissions, explanation quality, model, task prompts and test budget constant.

Compare:
- conventional OpenAPI / RPC descriptions;
- GraphQL schema/introspection;
- MCP Tools/Resources;
- WoT TD/Thing Model or node-wot;
- ANWA-style *Outcome + Context* and code-backed applicability.

Measures: task completion, invalid/risky action attempts, successful recovery after blocked operations, unnecessary calls, input tokens, latency, guard/handler duplication, and drift between declared transition and observed state.

**Confound to avoid:** making ANWA's descriptive text more complete than every baseline and attributing the win to the response model.

## Explicitly not decided

Exact schema syntax, execution runtime, durable workflow engine, full WoT conformance, auth scheme, retry guarantee, stream protocol, adapter set, versioning, licensing and packaging.

[README](../README.md) · [Architecture](architecture.md) · [Decision status](decisions.md) · [Draft Proposal 0001](https://github.com/pomesaka/ANWA/pull/1)
