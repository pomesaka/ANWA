# Interaction outcomes, Context and optional observation

> Active experimental v0.2 interpretation. See [ANWA v0.2](../spec/anwa-0.2.md).

## One response shape

For any delivered application-level result, ANWA returns both an `outcome` and a `context`:

```ts
type InteractionRef = string;
type ExecutionRef = { id: string };

type InteractionResponse<T,E> = {
  outcome:
    | { kind:"settled"; result:{ok:true;value:T}|{ok:false;error:E} }
    | { kind:"accepted"; execution:ExecutionRef };
  context:{
    next:Array<{
      ref:InteractionRef;
      input?:unknown;
      guidance?:{kind?:"retry";level?:"required"|"recommended"|"available"};
      when?:{after:string};
      applicability?:{state:"available"|"blocked"|"unknown";reason?:string};
    }>;
  };
};
```

A `ref` names a top-level Interaction. It is **not a ThingRef**. Every client can discover that Interaction by its declared reference, subject to authorization in a future network adapter.

An app may return zero next candidates. An agent should select options only when they advance the user's delegated goal. Server-provided instructions and recommendation levels do not outrank the client or user.

## Error vs retry

`outcome.result.error` contains the reason for a failed invocation and optionally `effects` certainty (`none` / `occurred` / `unknown`), which refers to **this attempt**. An Action's optional `hasSideEffects` declaration concerns *possible effects* before invocation.

The same Interaction can be offered in `context.next` after failure with `guidance.kind: "retry"` and optional `when.after` delay. This is advisory and neither duplicates the operation nor establishes retry safety.

## Asynchronous processing

`accepted` means an invocation was accepted for later processing, not that the business goal succeeded. `ExecutionRef = {id}` is an opaque run ID, **not a Thing**. The app can expose `execution.status`, `execution.result` and `execution.updates` as standalone Interactions whose input contains `executionId`.

Observation streams are independent from durable executions. An Event may emit progress, artifact deltas, and a final settled Result; no cross-restart replay, delivery guarantees or exactly-once semantics are provided in this prototype.

## Relation to prior art

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) — Thing-bound Interaction Affordances.
- [A2A protocol](https://a2a-protocol.org/latest/specification/) — task state / progress / artifact concepts.
- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) — protocol-level problem details.

[Retry/navigation](error-recovery-navigation.md) · [Architecture](architecture.md)
