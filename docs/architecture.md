# ANWA v0.2 — Interaction-first architecture

> Active experimental runtime: [TypeScript source](../src/anwa.ts). [Public schema](../spec/anwa-0.2.md).

## Responsibilities

The first-class public object is a **standalone Interaction**. ANWA Core has no Thing, ThingRef, `things` collection, `subjectType`, domain entity registry, or required state machine.

1. **Description:** an `InteractionRef → InteractionDefinition` map defining input, output, errors, purpose and optional action properties.
2. **Binding:** bind each declared Interaction to a TypeScript Handler and optional named guard.
3. **Discovery:** provide a catalog and a typed description for an InteractionRef, without a Thing parent.
4. **Invocation:** call an Interaction Handler, validate its response, and forward its **Outcome + Context**.

## Handler-owned Context

Each Handler builds its own response. There is **no application-wide Context callback**.

```ts
import { AnwaApp, fail, ok, reply } from "../src/anwa.ts";

const app = new AnwaApp(manifest);
app.bind({
  "order.get": async ({ input }) => reply(ok(await loadOrder(input.orderId))),
  "order.cancel": async ({ input }) => {
    const decision = await app.assess("order.cancel", input);
    if (!decision.allowed) {
      return reply({ ok: false, error: decision.error }, [
        { ref: "shipment.track", input: { shipmentId: await shipmentIdFor(input.orderId) },
          guidance: { level: "recommended" } },
      ]);
    }
    const updated = await cancelOrder(input.orderId, input.reason);
    return reply(ok(updated), [
      { ref: "order.get", input: { orderId: input.orderId },
        guidance: { level: "recommended" } },
    ]);
  },
}, { guards: { canCancel: async ({ input }) => checkCancellation(input.orderId) } });
```

The functions above are illustrative application code. A named Guard is **bound and validated by the framework, but must be explicitly evaluated by the owning Handler**. The framework does not automatically check policy. Authorization and atomic data updates remain implementation responsibilities.

`reply(ok(value))` produces an empty `context.next` when there is no useful next step. `reply(fail(code), next)` does the same for domain failures. `reply(accepted(executionId), next)` supports asynchronous acceptance. A Handler returning a bare `ok(...)` rather than a complete response is a contract error.

## Next Interactions

`context.next` is a single list of references to published Interactions, optionally with bound `input`, advisory `guidance`, `when.after` timing and `applicability`. A retry is the same InteractionRef with `guidance.kind: "retry"`. The framework validates refs and supported input schemas but **does not select the next business step**.

## Implementation

The reference is written in **TypeScript** and runs under **Bun ^1.4.4**. CI checks `bun fmt --check`, `bun lint`, `bun check`, manifest validation, `bun test`, and all demos. It is not a production network framework; no transport, authentication, durable job engine, distributed transaction or full JSON Schema validation is provided.

[README](../README.md) · [Demos](../demo/README.md) · [Error/next semantics](error-recovery-navigation.md)
