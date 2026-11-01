# Worked example — schema-first order cancellation

> **Illustrative test case only; not a recommended way to model all applications.** The YAML/TypeScript below is **not** valid WoT Thing Model or an implemented ANWA API. It tests whether ANWA *allows* an application author to expose an Action, a named code-backed Guard, related resource links and Outcome + Context. **ANWA does not choose Order as a Thing, require a statechart or automatically infer which links to return.**

## 1. Author the public contract

```yaml
# anwa.yaml (illustrative)
anwa: "0.1"
things:
  Order:
    description: A customer's purchase order
    properties:
      status:
        description: The order's fulfillment status
        type: string
        enum: [pending, preparing, shipped, cancelled]
    links:
      shipment:
        target: Shipment
        description: Shipping information for this order
    actions:
      cancel:
        description: Cancel this order if permitted
        input:
          type: object
          properties:
            reason: { type: string }
        output:
          type: object
          properties:
            orderId: { type: string }
        guard: canCancelOrder
        transitions:
          - from: [pending, preparing]
            to: cancelled
        errors:
          PERMISSION_DENIED: The caller is not allowed to cancel this order
          ORDER_ALREADY_SHIPPED: The shipment was already dispatched
          ORDER_STATE_CHANGED: The order state changed during invocation
```

What the schema says: which Thing and Action exist, what inputs/outputs mean, which transitions and error categories are **declared**, and which named Guard is used.

What it **does not** say: the complete algorithm for the Guard, how to call the shipping provider, SQL transactions, retries, or what permissions a real caller has.

## 2. Implement the named guard once

```ts
// Illustrative application code, not a real ANWA API.
app.guard("canCancelOrder", async (ctx) => {
  const order = await ctx.db.orders.get(ctx.orderId);

  if (!ctx.auth.can("order:cancel", order)) {
    // Details may be withheld from unauthorized callers.
    return deny({ code: "PERMISSION_DENIED" });
  }

  const shipment = await ctx.shipping.get(order.shipmentId);
  if (shipment.dispatched) {
    return deny({ code: "ORDER_ALREADY_SHIPPED", effects: "none" });
  }

  return allow();
});
```

This guard is used to compute an **advisory applicability hint** during Discovery. It is invoked again, or its results are enforced by equivalent atomic policy/DB checks, during an actual cancellation. The application's **separate Context resolver** chooses the next-interaction candidates to offer, subject to authorization filtering. The Guard does not need to encode next steps.

## 3. Implement the actual action separately

```ts
app.action("Order.cancel", async (ctx, input) => {
  // Server-side recheck of state + permission is required here.
  // Check-and-update must be atomic where consistency matters.
  const order = await ctx.db.orders.cancelConditionally(
    ctx.orderId,
    ["pending", "preparing"],
    input.reason
  );
  if (!order) return err("ORDER_STATE_CHANGED");
  return ok({ orderId: order.id });
});
```

The expected domain error `ORDER_STATE_CHANGED` is declared in the example's Action schema. ANWA's executable v0.1 adapter rejects undeclared expected domain errors as `UNEXPECTED_ERROR`.

## 4. Runtime assembles the Result + Context

Example domain failure (not transport failure):

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": { "code": "ORDER_ALREADY_SHIPPED", "effects": "none" }
    }
  },
  "context": {
    "next": [
      {
        "ref": {
          "thing": { "type": "Shipment", "id": "456" },
          "kind": "property",
          "name": "tracking"
        },
        "guidance": { "level": "recommended" }
      }
    ]
  }
}
```

If cancellation succeeds, the same outer shape can return `ok: true` with **application-selected `context.next` candidates**, or `next: []`. A retry, if offered by the application for a recoverable failure, is represented as the same InteractionRef with `guidance.kind: "retry"` and an optional `when.after` duration. Neither ANWA nor the application can override the agent's delegated user intent.

## Design tradeoffs exposed by this example

- **Avoid duplicating guard conditions.** Schema holds a named contract; code owns logic. Declared states/transitions remain useful but not fully enforced without transactional checks.
- **Guards may be slow or expensive.** The runtime must define when to evaluate applicability and when to return `unknown`.
- **Discovery can leak information.** Guard decisions and blocked-reason descriptions need policy-aware filtering.
- **Next-interaction choices are application-defined.** ANWA may offer resolvers and a common `context.next` representation but cannot infer the best next action from arbitrary business logic.
- **Structured failures are important.** A named, machine-readable reason helps clients understand an error, but does not guarantee safe recovery.
- **WoT compatibility is still open.** This illustrative YAML is a proposed ANWA authoring notation; it is not WoT TD/TM syntax.

[Scope](../scope-and-boundaries.md) · [Architecture](../architecture.md) · [Interaction model](../interaction-model.md) · [Glossary](../glossary.md)
