# Vision and scope

> Working document · 2026-11-01 · Non-normative

## Motivation

Human-facing web apps rely on pages, links, and forms to help people infer what exists and what they can do. When an AI agent becomes the primary consumer, the same domain knowledge could be offered through a discoverable, machine-readable application interface rather than a predetermined UI.

ANWA explores whether application authors can describe **domain meaning, connected objects, general capabilities, and state-dependent affordances** once, independently of the protocol used to expose them.

This is a design hypothesis, not a claim that current web standards are unsuitable.

## What we are exploring

A self-describing application model, interpreted through two logical concerns:

- **Discovery:** Find relevant concepts, resources, relations, capabilities, input/output shapes, preconditions, and contextual hints.
- **Interaction:** Read data, invoke operations, inspect failures, and observe asynchronous outcomes.

An agent may alternate between them; the distinction does not imply separate endpoints or services.

### Why the distinction matters

Static descriptions answer *what is possible in general*. Dynamic context answers *what appears applicable here and now*. Execution ultimately decides *whether the requested operation is actually permitted and possible*. Conflating these creates security and correctness problems.

For example, a `cancelOrder` capability may exist in the application's schema while a specific order has already shipped or the caller lacks the right permission.

## Design principles to test

1. Protocol independence: the domain model should not require GraphQL, REST, RPC, or MCP.
2. Progressive exploration: clients should not need the full application description upfront.
3. Explicit meanings: explanations, typed inputs/outputs, relationships, and constraints should be available.
4. Contextual affordances: guide next steps without claiming a perfect guarantee of availability.
5. Clear enforcement boundary: authorization, approval, and invariants remain server-side.
6. Optional UI: dynamic or static presentations are possible but not required.
7. Honest interoperability: prefer existing specifications when they already solve a problem.

## Out of scope for now

- Defining a transport protocol or wire format
- Choosing a runtime, database, SDK, or schema DSL
- Replacing an agent runtime or planning model
- Providing automatic trustworthiness from natural-language descriptions
- Solving universal identity, delegation, payments, and policy enforcement
- Claiming a new standard or production readiness

## Success criteria (research hypotheses)

Compared with conventional API/tool exposure, an agent using the proposed model should be more capable of handling unfamiliar applications. Measure task completion, invalid or risky calls, total calls and tokens, latency, and developer annotation burden under comparable conditions.

The idea may ultimately be best implemented as a thin authoring framework over existing standards; that remains a valid outcome.

[Back to README](../README.md) · [Glossary](glossary.md) · [Open questions](open-questions.md)
