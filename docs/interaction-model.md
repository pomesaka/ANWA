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
    subject: ThingRef;
    links: LinkRef[];
    affordances: AffordanceRef[];
    revision?: string;
  };
};
```

The shape is intentionally transport-neutral. `accepted` means the invocation produced an execution handle—not that the business task succeeded. `settled` refers to the invocation, not necessarily the user's entire business goal.

### Affordance versus applicability

Use **WoT Interaction Affordance** for the static interaction description (Property, Action, Event). ANWA may attach a *contextual applicability hint* (available / blocked / unknown, with reason). Hints can become stale and **do not authorize** anything.

See [Errors, retry guidance and next-interaction navigation](error-recovery-navigation.md) for the three distinct responsibilities, a candidate structured Error Definition, per-attempt retry/effect data and the current implementation gap. **Context is available after both successful and failed interactions; it is not limited to error recovery.**

### Semantic errors

The envisioned domain error is structured, e.g. a stable code, optional details, retry advice and side-effect certainty:

```json
{
  "code": "ORDER_ALREADY_SHIPPED",
  "retry": { "mode": "never" },
  "effects": "none"
}
```

A lost response may leave effects unknown. For retries, distinguish *time-based advice*, *changed-state requirements* and *actual duplicate-suppression guarantees*. Do not infer idempotence from `retryable: true` alone.

HTTP status codes, Problem Details, gRPC status and similar transport mechanisms remain meaningful for their adapters. ANWA's domain semantics should not be dependent on any one code system.

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
