# Interaction Result, async execution and streaming

> **Status:** Conceptual model, **not an adopted wire format** · 2026-11-01. For detailed alternative shapes see [Draft Proposal 0001](https://github.com/pomesaka/ANWA/pull/1).

## Principle

> **Every delivered application-level Interaction Response contains an outcome and the context for what can come next.**

This applies to **successful** and **failed domain actions**. It does not guarantee that at least one next step exists or that an application response arrives when the network fails.

The server exposes **options, descriptions and conditions**. The agent chooses what to do based on the user's delegated intent. Server-supplied text is data, not a higher-priority instruction.

## Logical response (pseudotype)

```ts
type InteractionResponse<T, E> = {
  outcome:
    | { kind: "settled"; result: { ok: true; value: T } | { ok: false; error: E } }
    | { kind: "accepted"; execution: ExecutionRef };
  context: {
    next: Array<
      | {
          ref: InteractionRef;
          guidance?: { kind?: "retry"; level?: "required" | "recommended" | "available" };
          when?: { after: string }; // ISO 8601 duration after response receipt
          applicability?: { state: "available" | "blocked" | "unknown"; reason?: string };
        }
      | {
          kind: "discover";
          ref: ThingRef;
          guidance?: { level?: "required" | "recommended" | "available" };
          when?: { after: string };
          applicability?: { state: "available" | "blocked" | "unknown"; reason?: string };
        }
    >;
  };
};
```

These are **conceptual types**. The concrete experimental wire schema is in [ANWA 0.1](../spec/anwa-0.1.md). `next` may be empty after success or failure. The app chooses options, including retries; it does not issue instructions with higher authority than the user's goal.

### Affordance versus applicability

A WoT Interaction Affordance describes an offered Property, Action or Event. `context.next` supplies **context-specific references** to such interactions, optionally with applicability hints. `applicability: blocked` may inform a client of a blocked candidate; it **does not authorize** invocation.

A description-level **Link** represents a relationship between modeled resources; it is not a separate `context.links` list. A runtime navigation option to explore a Thing is expressed as `kind: "discover"` with a ThingRef.

### Errors, effect certainty and retry are separate

The domain error contains **what happened and why**, e.g. `{ "code": "NOT_READY", "effects": "none" }`. An error may report the attempted operation's effect certainty as `none`, `occurred` or `unknown`. A lost response may leave it unknown.

**Retry is not a separate `error.retry` or `context.retry`.** A candidate with the same InteractionRef and `guidance.kind: "retry"` is a retry affordance; `when.after` may advise a wait duration. Static `hasSideEffects` and `idempotent` declarations do not guarantee a retry is safe. Likewise, `guidance.level: "required"` indicates an app-authored prerequisite for some continuation, not an unconditional command.

See [Error outcomes and navigation](error-recovery-navigation.md) for examples. Transport errors (HTTP/gRPC etc.) remain the adapter's concern, not domain errors.

## Two state machines

| Domain state | Execution state |
| --- | --- |
| Order: `pending → paid/cancelled` | Payment attempt: `accepted → running → completed/failed` |
| Describes the business entity | Describes a particular invocation/job |
| May change after a request finishes | May settle before the broader business goal finishes |

ANWA *may* expose an Execution as a Thing-like object with Property/Action/Event affordances to inspect, observe, cancel, or supply input. These operations and semantics remain design candidates.

## Observation is not execution

A streaming channel is a method for observing work; it is not in itself a durable workflow engine. Distinguish:

- **State changes**: authoritative/reconstructible changes in domain or execution state.
- **Progress reports**: estimates or transient informational messages.
- **Artifact deltas**: partial outputs; may be revised, followed by a final artifact, or never complete.

Possible adapters include SSE, WebSocket, gRPC streaming and webhooks. A2A similarly separates task status from artifact updates. Stream events could carry a cursor/sequence, type, referenced Thing/Execution, and minimal delta. Full Interaction Context may be returned in snapshots and settled outcomes rather than every chunk.

### Questions a concrete transport must answer

1. Can consumers retrieve an authoritative snapshot and settle-state after disconnect?
2. Are events replayable? For how long? With what ordering guarantees and deduplication keys?
3. Can a client subscribe from the snapshot's revision without missing events between read and subscribe?
4. Is cancellation an *attempt to stop* or a guaranteed reversal? (Usually the former.)
5. What if a timed-out invocation may have committed external effects?

No exactly-once delivery, full replay, or safe cancellation is currently promised.

## Nearby standards

- [W3C WoT TD 1.1](https://www.w3.org/TR/wot-thing-description11/) — Action/Property/Event Affordances and additional responses
- [WoT Profiles — Working Draft](https://www.w3.org/TR/wot-profile/) — HTTP ActionStatus, error treatment and event profiles
- [A2A Specification](https://a2a-protocol.org/latest/specification/) — Task, status updates, artifact updates
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) — Tools, resources, interaction transport
- [CloudEvents](https://github.com/cloudevents/spec) — event envelope
- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) — HTTP Problem Details

[Architecture](architecture.md) · [Example](examples/order-cancellation.md) · [Research](research/async-state-streaming.md)
