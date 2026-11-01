# ANWA design decisions — current experimental direction

> Updated 2026-11-01. The active runnable profile is [ANWA v0.2](../spec/anwa-0.2.md), not the superseded Thing-bound v0.1.

## Core principles

| Area | Current decision | Boundary |
| --- | --- | --- |
| Public contract | **Interaction-first**: top-level `interactions` plus declared entrypoints | No required Thing or entity boundary |
| InteractionRef | App-scoped string identifier; e.g. `order.cancel` | Federated/external API references deferred |
| Kind | `query`, `action`, `event` | WoT Property/Action/Event Affordances are Thing-bound; ANWA does not claim WoT conformance |
| Thing | Optional domain metadata in `things`, optional `subjectType` on an Interaction | Not a mandatory parent, input, execution or storage model |
| Binding | Direct `app.bind({ref:handler})`; ordinary application code | No DSL for guard predicates or mandatory state machine |
| Discovery | `catalog()` and `discover(InteractionRef)` | Adapter/authorization still undecided |
| Interaction | Delivered `Outcome + Context` (including domain failure) | No guarantee on network loss |
| Navigation | `context.next` holds offered Interactions; optional bound inputs, guidance, timing, applicability | Server does not instruct agent or choose business workflow |
| Retry | Same Interaction in `context.next` with `guidance.kind:"retry"` | Not automatic and not assured safe |
| Error | Exhaustive expected domain error codes, undeclared → `UNEXPECTED_ERROR` | Error details currently string descriptions |
| Effects | Optional Action `hasSideEffects` and `idempotent`; per-attempt `error.effects` | Unknown when omitted; no transactional guarantee |
| Async | `accepted` with opaque `ExecutionRef={id:string}` | No Execution Thing or workflow engine required |
| Streaming | Optional standalone Event Interaction with application-defined input | No delivery/durability guarantees |

## Decisions intentionally left to implementers

Which Interactions to expose, domain entity/Thing granularity, names and identifiers, state graph, guards, storage, transactions, authorizations, next candidates, client interpretation and policy, external APIs, streaming backend, retries and business side effects.

## Future framework questions

- Stronger JSON Schema validation and static handler type-checking
- Cross-app delegation/federated InteractionRefs
- Protocol adapters including WoT mappings
- Typed domain error detail definitions and contextual recovery guidance consistency
- Authenticated Discovery, policy filtering and reference lifetime
- Verification against unfamiliar agents, not only scripted tests

**Historical v0.1 prose, draft PRs and research notes are non-normative.** If they mention mandatory ThingRef-based InteractionRefs, defer to v0.2.

[Main README](../README.md) · [Scope](scope-and-boundaries.md)
