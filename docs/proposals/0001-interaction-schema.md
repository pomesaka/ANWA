# Proposal 0001: ANWA Interaction Schema v0.1

> **Status:** Discussion draft — not adopted, not an implementation, not a conformance specification.  
> **Updated:** 2026-11-01  
> **Scope:** Semantic contract, not a transport binding or TypeScript SDK.

## 0. Design goal

An agent interacting with an unfamiliar application should receive not only the current outcome, but also enough **typed, discoverable context** to choose what to inspect or invoke next.

**Every delivered application-level Interaction Response carries an Outcome and a Context.** The Context may contain no next interactions. A lost network response cannot satisfy this contract.

This proposal is intentionally **WoT-aligned**. It reuses Thing, Property/Action/Event Interaction Affordance, Link, and Thing Model vocabulary. It proposes **new ANWA concepts** for a common Result envelope, context-specific affordance references, and optional execution/state-machine integration. These additions are *not defined by WoT TD 1.1*.

## 1. Three distinct schema families

| Schema family | Purpose | Standard relationship |
| --- | --- | --- |
| **Thing Model + ANWA state model** | Author-facing state, properties, actions, events, semantics and transition guards | WoT Thing Model base vocabulary; ANWA statechart is an *extension*, not standard WoT |
| **Interaction Response** | Always return an outcome plus navigable context, on both domain success and domain failure | ANWA addition; optional serialization through WoT Action output or other transport |
| **Interaction Event** | Notify execution state changes, progress and artifact deltas | ANWA addition; candidate adapters: WoT Event, A2A-like event split, CloudEvents, SSE, gRPC |

**Authoring-time metadata ≠ public Discovery document.** Do not expose arbitrary guard code, internal state, sensitive relations, or private action definitions to clients. Generate an authorized, minimized view from the underlying model.

## 2. Core logical types (illustrative TypeScript)

The TypeScript below is **a design notation**, not a commitment to TypeScript, JSON, or a wire protocol.

```ts
type ThingRef = {
  id: string;                   // stable identity in an application
  model?: string;               // type/model reference
};

type InteractionRef = {
  thing: ThingRef;
  name: string;                 // e.g. "pay"
  kind: "property" | "action" | "event";
  descriptionRef?: string;      // more details / schema to discover
};

type LinkRef = {
  rel: string;                  // typed semantic relation
  target: ThingRef;
  description?: string;
};

type Applicability =
  | { state: "available" }
  | { state: "blocked"; reason: { code: string; description?: string } }
  | { state: "unknown" };

type AffordanceRef = {
  interaction: InteractionRef;
  applicability: Applicability;
  // Advisory only. NEVER an authorization grant.
};

type InteractionContext = {
  subject: ThingRef;
  revision?: string;            // version of the observed subject snapshot
  links: LinkRef[];             // may be empty
  affordances: AffordanceRef[]; // may be empty
};

type RetryAdvice =
  | { mode: "never" }
  | { mode: "same-request" }     // only if safe duplicate protection is guaranteed
  | { mode: "after"; after: string }  // duration, e.g. ISO-8601 "PT30S"
  | { mode: "after-state-change" }
  | { mode: "inspect-first" };

type InteractionError<D = unknown> = {
  code: string;                // domain-owned, stable machine-readable code
  message?: string;            // display/debug, NOT a programmatic discriminator
  details?: D;
  retry: RetryAdvice;
  effects: "none" | "occurred" | "unknown";
};

type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

type InteractionResponse<T, E> = {
  outcome:
    | { kind: "settled"; result: Result<T, E> }
    | { kind: "accepted"; execution: ThingRef };
  context: InteractionContext;  // required in either case
};
```

### Scope of the response promise

- **Settled** means this particular invocation is complete. `ok:true` means the operation produced its declared successful outcome; it does **not** necessarily imply the user's larger business goal is complete.
- **Accepted** means a server-managed execution has been created; it does not assert the business operation has succeeded.
- The execution itself is a discoverable Thing-like object with its own state and possible get/observe/cancel/provide-input interactions.
- The server MUST enforce authorization and preconditions again on actual invocation. `applicability:available` is *not* permission.
- `context` is guaranteed **as a field**, but arrays may be empty. Access-control policies may suppress sensitive context.
- Ordinary network/transport failures may occur without an `InteractionResponse`.
- `effects:unknown` is important when an error is reported after some side effect may have happened; retrying blindly may duplicate work.
- `retry.mode` is an advisory *semantic* statement. Transport adapters may still use HTTP status codes / Retry-After headers for compatibility.

## 3. Example: successful synchronous interaction

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": true,
      "value": { "id": "order:123", "status": "paymentPending" }
    }
  },
  "context": {
    "subject": { "id": "order:123", "model": "model:Order" },
    "revision": "7",
    "links": [
      { "rel": "payment", "target": { "id": "payment:456" } }
    ],
    "affordances": [
      {
        "interaction": {
          "thing": { "id": "order:123" },
          "name": "pay",
          "kind": "action",
          "descriptionRef": "model:Order#actions/pay"
        },
        "applicability": { "state": "available" }
      },
      {
        "interaction": {
          "thing": { "id": "order:123" },
          "name": "cancel",
          "kind": "action"
        },
        "applicability": { "state": "available" }
      }
    ]
  }
}
```

The response gives an **option set**, not a privileged command to follow `pay`. The user's delegated intent determines the next step.

## 4. Example: failed domain action with next choices

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": {
        "code": "ORDER_ALREADY_SHIPPED",
        "message": "This order can no longer be cancelled.",
        "retry": { "mode": "never" },
        "effects": "none"
      }
    }
  },
  "context": {
    "subject": { "id": "order:123" },
    "revision": "9",
    "links": [
      { "rel": "shipment", "target": { "id": "shipment:456" } }
    ],
    "affordances": [
      {
        "interaction": {
          "thing": { "id": "shipment:456" },
          "name": "status",
          "kind": "property"
        },
        "applicability": { "state": "available" }
      },
      {
        "interaction": {
          "thing": { "id": "order:123" },
          "name": "requestReturn",
          "kind": "action"
        },
        "applicability": {
          "state": "blocked",
          "reason": {
            "code": "AWAIT_DELIVERY",
            "description": "Returns can be requested after delivery."
          }
        }
      }
    ]
  }
}
```

The `requestReturn` affordance is a **blocked option**, not a current permission. Its definition is discoverable, but invocation must be independently rejected unless conditions hold.

## 5. Example: async acceptance and execution

An asynchronous `pay` may return:

```json
{
  "outcome": {
    "kind": "accepted",
    "execution": { "id": "execution:pay:xyz", "model": "model:Execution" }
  },
  "context": {
    "subject": { "id": "execution:pay:xyz" },
    "revision": "1",
    "links": [
      { "rel": "target", "target": { "id": "order:123" } }
    ],
    "affordances": [
      {
        "interaction": {
          "thing": { "id": "execution:pay:xyz" },
          "name": "status",
          "kind": "property"
        },
        "applicability": { "state": "available" }
      },
      {
        "interaction": {
          "thing": { "id": "execution:pay:xyz" },
          "name": "updates",
          "kind": "event"
        },
        "applicability": { "state": "available" }
      }
    ]
  }
}
```

An Execution can have its own lifecycle (`accepted`, `running`, `awaitingInput`, `completed`, `failed`, ...), **separate** from the Order's state lifecycle (`paymentPending`, `paid`, ...).

The final execution result is a `settled` `InteractionResponse<T,E>` with the appropriate context. This does not guarantee that the order has reached the user's intended terminal state.

## 6. Stream/event envelope (preliminary)

Stream updates are **observations**, not repeated complete results. This reconciles a common Result envelope with efficient incremental streaming. A client can re-fetch a current snapshot when a delta is missed.

```ts
type InteractionEvent<T, E> =
  | {
      type: "snapshot";
      sequence: number;
      response: InteractionResponse<T, E>;
    }
  | {
      type: "state.changed";
      sequence: number;
      thing: ThingRef;
      revision: string;
      state: string;
    }
  | {
      type: "progress";
      sequence: number;
      execution: ThingRef;
      message?: string;
      fraction?: number;
    }
  | {
      type: "artifact.delta";
      sequence: number;
      execution: ThingRef;
      artifactId: string;
      data: unknown;
      append: boolean;
    }
  | {
      type: "context.changed";
      sequence: number;
      subject: ThingRef;
      revision: string;
    }
  | {
      type: "settled";
      sequence: number;
      response: InteractionResponse<T, E>;
    };
```

The stream transport must document ordering scope, event retention and replay semantics, cursor use, event duplication, and backpressure. No exactly-once delivery guarantee is implied. If the stream breaks, polling a snapshot/Execution status must remain possible if the service offers durability.

## 7. Thing Model / state model integration (authoring sketch only)

Prefer established WoT TD/TM terms for `properties`, `actions`, `events`, `links`, `description`, `input`, `output`. **Statecharts and guard expressions are not a standardized part of WoT Thing Model 1.1**; any ANWA extension must have its own namespace/contract and must not break WoT interoperability.

```yaml
# Illustrative authoring notation, NOT a standard WoT Thing Model:
thingModel: Order
description: A customer purchase order
properties:
  status: { type: string, description: Current order state }
actions:
  pay:
    description: Initiate payment
    input: { type: object }
    execution: asynchronous
  cancel:
    description: Cancel the order
stateMachine:
  initial: draft
  states: [draft, paymentPending, processing, paid, cancelled, failed]
  transitions:
    - from: draft
      on: submit
      to: paymentPending
    - from: paymentPending
      on: pay
      guard: hasPaymentMethod
      to: processing
    - from: processing
      on: paymentSucceeded
      to: paid
    - from: processing
      on: paymentFailed
      to: failed
```

The DSL must ultimately resolve the guard and its *explainable* requirements through developer-provided metadata. Arbitrary code predicates cannot automatically provide reliable natural-language failure reasons. The published graph can hide internal transitions and guard implementations.

## 8. Non-goals and unresolved choices

1. **Full WoT reuse vs. extension:** Can the Result envelope be an ordinary WoT Action output, or does it warrant a reusable ANWA convention layered over WoT?
2. **Affordance freshness:** Is `revision` sufficient for hints computed over multiple linked resources? What about expiry and per-user policy changes?
3. **Retry semantics:** What precisely certifies `same-request` as safe, particularly for partial effects and idempotency keys?
4. **Subtypes:** Should the same envelope apply to Property reads, Action invocations, and Event subscription establishment?
5. **Execution references:** Are Exections first-class Things, or a general resource abstraction mapped to WoT Things by an adapter?
6. **Context compaction:** Full context vs. references vs. intent-ranked selection; protect both token budgets and confidential metadata.
7. **Statechart extension:** Does ANWA need to standardize a machine format, or can multiple authoring engines emit the same Discovery + Interaction contracts?
8. **Client trust:** A description and guidance hint must remain untrusted application data, not a higher-priority instruction to the AI.
9. **Wire identity:** Stable URI/URN identifiers, schema versions, protocol binding metadata, pagination and internationalization remain unspecified.
10. **Streaming guarantees:** Define observation consistency, replay windows and the semantics of the terminal event before standardizing any event envelope.

## 9. Reference specifications

- [W3C WoT Thing Description 1.1 / Thing Model](https://www.w3.org/TR/wot-thing-description11/)
- [W3C SCXML](https://www.w3.org/TR/scxml/)
- [W3C WoT Profiles — Working Draft (ActionStatus)](https://www.w3.org/TR/wot-profile/)
- [A2A v1.0.1 — Task and streaming events](https://a2a-protocol.org/v1.0.1/specification/)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)

[ANWA README](../../README.md) · [Working glossary](../glossary.md) · [Async / streaming research](../research/async-state-streaming.md)
