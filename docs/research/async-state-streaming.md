# Async execution, state machines, and streaming — prior-art study

> **Research note · 2026-11-01. Non-normative.** ANWA API, wire format, and runtime are not designed or chosen.

## Executive takeaway

**Three orthogonal concerns:**

1. **Domain state machine:** business state and transitions (e.g. `paymentPending → paid`).
2. **Execution lifecycle:** an invocation's state (e.g. `accepted → running → completed/failed`).
3. **Observation / delivery:** how current snapshots, state changes, progress, and output chunks are delivered (query, polling, SSE, websocket, broker, webhook, gRPC).

A streaming connection is not a durable job. An accepted invocation is not a completed business operation. Output chunks are not a guarantee of overall success.

## Comparison of primary standards and implementations

| Standard / project | Durable / async model | Streaming / event model | ANWA research implication |
| --- | --- | --- | --- |
| [W3C WoT TD 1.1](https://www.w3.org/TR/wot-thing-description11/) + [WoT Profiles WD](https://www.w3.org/TR/wot-profile/) | `ActionAffordance.synchronous`, draft `ActionStatus` with `pending/running/completed/failed`, `queryaction`, `cancelaction` | `EventAffordance`, property observation, draft SSE/Webhook profiles | Model operation instances, but do not assume WoT guarantees a common next-action envelope |
| [A2A specification](https://a2a-protocol.org/latest/specification/) | Task lifecycle incl. `submitted`, `working`, `input-required`, `auth-required`, terminal states | `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent` with chunk append/final flags; stream, subscription, push | Separate execution status from output artifacts and human input |
| [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) + [Tasks extension](https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks) | Server may return a durable Task handle from a tool call; `tasks/get`, `tasks/update`, `tasks/cancel` | Request-scoped SSE notifications; extension `subscriptions/listen` for opted-in updates | Keep task handle separate from a live connection; optional extensions/adapters rather than core dependency |
| [SCXML](https://www.w3.org/TR/scxml/) / [XState](https://stately.ai/docs/invoke) | Statechart transitions, guards, invoked actors and done/error transitions | Observable snapshots / actor emissions | State model can drive runtime and introspection, but does not automatically provide durability |
| [Temporal](https://docs.temporal.io/encyclopedia/workflow-message-passing) | Workflows plus Queries (read), Signals (async write), Updates (tracked write) | Queries and message handling; streaming transport not intrinsic | Durable workflow and interaction contract are separate layers |
| [AsyncAPI 3.x](https://www.asyncapi.com/docs/reference/specification/v3.0.0) | Describes messages, operations, channels and reply patterns | Message-driven, protocol independent bindings | Possible generated event-interface documentation, not an application state-machine runtime |
| [CloudEvents 1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) | No built-in workflow state machine | Portable event envelopes, `id`/`source`/`type`, optional `time` | Candidate event serialization; delivery, ordering, replay and availability require separate contracts |
| [gRPC](https://grpc.io/docs/what-is-grpc/core-concepts/) | RPC call lifecycle | Unary, server streaming, client streaming, bidirectional streaming | Transport adapter, not a domain progression model |

### Normative-status caution

- WoT **Thing Description 1.1** is a W3C Recommendation; **WoT Profiles** is a *2025-11-04 Working Draft*, not a Recommendation.
- **SCXML 1.0** is a W3C Recommendation (2015).
- The July **2026-07-28** MCP Tasks extension replaces a prior experimental core model; do not accidentally rely on pre-2026 Task APIs. Its specification site has both release and draft navigation; verify the exact version on implementation.
- The A2A protocol evolves; identify a concrete published version before binding an adapter.

## 1. Separate two state machines

Example:

- **Order state:** `draft → paymentPending → paid → fulfilled`; other branches `cancelled`, `paymentFailed`.
- **Payment invocation state:** `accepted → running → completed|failed` plus `inputRequired`.

The invocation may complete successfully **without** the order reaching its eventual business-terminal state (e.g., a request to schedule payment is accepted; settlement later fails). Never conflate “RPC succeeded” with “business goal achieved.”

An execution handle (Run/Task/ActionStatus) can be treated as a navigable resource, with its own `getStatus`, `subscribe`, `cancel`, `provideInput` affordances. This is an ANWA hypothesis, not a WoT standard name.

## 2. Separate three kinds of streamed information

- **State transition event**: a durable or reconstructible fact, e.g., `payment.authorized`.
- **Progress update**: a possibly transient estimate, e.g., `step 3 of 5`, not necessarily an authoritative business fact.
- **Artifact/data chunk**: partial output, e.g., a generated report paragraph. Can later be superseded or invalidated.

A2A explicitly distinguishes task-status events from artifact updates. CloudEvents defines event metadata but not application ordering or guaranteed replay. gRPC provides ordering within a single RPC stream but not general durable replay.

## 3. Interaction Result as a semantic layer (hypothesis)

A candidate *logical* model, not a wire-format commitment:

```ts
type InteractionResponse<T, E> = {
  outcome:
    | { kind: "settled"; result: { ok: true; value: T } | { ok: false; error: E } }
    | { kind: "in_progress"; execution: ExecutionRef };
  context: {
    resources: ResourceRef[];
    affordances: AffordanceRef[];
    revision?: string;
  };
};
```

- An `in_progress` response means **accepted for execution**, not business success.
- Once the operation settles, a final `Result<T, E>` is available.
- Context and next-step hints should be accessible on both final success and final business failure, subject to authorization. The actual stream may contain compact event deltas rather than repeatedly including the entire context in every chunk.
- Transport/network failure may prevent any application response.

## 4. Transport-independent observation (hypothesis)

The *semantics* should be stable whether the client polls, subscribes, reconnects, or receives callbacks:

- `getSnapshot(execution)` — authoritative current state and version.
- `watch(execution, cursor?)` — non-authoritative delivery mechanism for relevant updates, with defined restart behavior.
- `getResult(execution)` — settled output or business error, plus related resources and affordances.
- `cancel(execution)` — cancellation request, not guaranteed rollback.

These names are illustrative, not an ANWA API.

Potential delivery adapters: SSE, WebSocket, gRPC server streams, Webhook, broker. Do not claim all adapters inherently support replay, exactly-once processing, or reliable cancellation.

## 5. Engineering hazards to resolve

- **Snapshot / subscription race:** clients may miss events between reading state and subscribing unless a cursor or atomic subscription boundary is defined.
- **Reconnect / duplicates:** need IDs or sequence numbers, replay policy, retention limits, deduplication; CloudEvents `id` is not itself a durable log.
- **Ordering:** define ordering scope (per execution/resource), not an undocumented global order.
- **Backpressure:** slow clients, large output chunks, token budgets, partial result semantics.
- **Idempotency and unknown effects:** a timeout may leave business side effects unknown; a retry needs explicit safeguards.
- **Cancellation:** cooperative request; no guarantee a payment already dispatched can be undone.
- **Approval / input-required:** a paused operation may need human authorization, with server-side policy enforcement.
- **Context size and security:** affordance catalogs can be large and may reveal restricted actions; use references and scoped discovery.
- **Durability:** XState-style statecharts do not by themselves ensure persistence or crash recovery; use a durable workflow/runtime where needed.

## Open research questions

1. Is an *execution instance* a WoT Thing, an associated resource, or an ANWA-native conceptual type?
2. Can the same interaction be synchronously settled, asynchronously run, or streamed without changing its semantic signature?
3. Is streaming a *view of state transitions* (recommended), or a first-class action whose delivery influences business state?
4. Which updates must be persisted, and which may be ephemeral?
5. Should the *final* Interaction Result always include navigable next steps, while intermediary progress events carry only incremental updates?
6. How does `input-required` affect execution and authorization semantics?
7. Can an ANWA author declare a business statechart and have framework-provided Discovery, Interaction Result, and event bindings generated automatically?

## Official sources

- [WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [WoT Profiles (Working Draft)](https://www.w3.org/TR/wot-profile/)
- [A2A specification](https://a2a-protocol.org/latest/specification/)
- [MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP Tasks extension](https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks)
- [W3C SCXML](https://www.w3.org/TR/scxml/)
- [XState actor invocation](https://stately.ai/docs/invoke)
- [Temporal workflow message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing)
- [AsyncAPI spec](https://www.asyncapi.com/docs/reference/specification/v3.0.0)
- [CloudEvents spec](https://github.com/cloudevents/spec)
- [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)

[ANWA README](../../README.md) · [WoT error handling](wot-errors.md) · [WoT prior art](wot.md)
