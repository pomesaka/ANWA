# Vision and scope

> Working direction · 2026-11-01 · Non-normative

## Motivation

Human-facing web applications communicate domain meaning and next actions through pages, forms and navigation. AI-agent consumers need a directly discoverable application contract and interaction outputs that help them decide what to inspect or do next.

ANWA is a **schema-first application framework concept**, not a replacement for GraphQL, MCP, REST or a UI toolkit. The goal is an authoring experience in which developers describe **what an application exposes**, implement **how it behaves**, and let tooling consistently expose those semantics.

## Product thesis

> Build a web application by describing its public domain contract and writing its behavior. ANWA makes the application discoverable, interactive and navigable for AI agents.

### Workflow

1. **Schema first** — public descriptions of Things, Links, Property/Action/Event Affordances, input/output and errors, named Guard contracts and possible states/transitions.
2. **Implementation second** — ordinary handlers/resolvers and guard code, with authorization, side effects and atomic transitions enforced on the server.
3. **Runtime exposure** — logical Discovery and Interaction interfaces. The latter produces **Outcome + Context**, including links and relevant follow-up affordance references.

State machines are a useful **part of the declared contract**, **not** an alternative authoring language that must encode every business rule. A Guard is a reference to code that can use data and external services; a schema can describe its intended outputs but not infer its complete logic.

## Design principles being explored

- **WoT-aligned vocabulary**, without claiming WoT conformance or inventing duplicate standards.
- **Transport independence** for the application model.
- **Progressive discovery** of relevant descriptions rather than forcing a full schema into context.
- **Outcome + Context** for delivered application-level interactions, including domain failure.
- **Dynamic applicability separate from affordance** and separate from actual authorization.
- **Structured error semantics** with retry and side-effect uncertainty, beyond HTTP codes alone.
- **Domain state separate from execution state**; streaming is a way of observing changes and partial outputs.
- **Optional human UI** rather than screen-first architecture.

## What ANWA is not claiming

- That Hydra, HATEOAS, WoT or RPC error details are novel.
- That a statechart or a single Guard function removes race conditions or transactional requirements.
- That descriptions guarantee safe AI behavior.
- That all results arrive (network failures may prevent that).
- That an ANWA schema, protocol, runtime or package exists today.

## Evaluation direction

Compare the same small domain application exposed via ordinary typed APIs/tool definitions and an ANWA-style navigable contract. Keep the business logic, permissions and explanation quantity comparable. Measure task success, wrong actions, number of calls, tokens, latency, authoring effort and correctness of state transitions.

Novelty, developer ergonomics and performance remain **hypotheses to test**, not demonstrated properties.

[README](../README.md) · [Decision status](decisions.md) · [Architecture](architecture.md) · [Open questions](open-questions.md)
