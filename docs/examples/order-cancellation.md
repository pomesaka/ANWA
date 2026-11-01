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
          PERMISSION_DENIED:
            description: The caller is not allowed to cancel this order
          ORDER_ALREADY_SHIPPED:
            description: The shipment was already dispatched
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
    return deny({
      code: "ORDER_ALREADY_SHIPPED",
      links: [{ rel: "shipment", target: shipment.ref }],
      affordances: [{ target: shipment.ref, name: "track", kind: "action" }]
    });
  }

  return allow();
});
```

This guard is used to compute an **advisory applicability hint** during Discovery. It is invoked again, or its results are enforced by equivalent atomic policy/DB checks, during an actual cancellation. The guard's extra links/affordances are **suggestions**, subject to authorization filtering.

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

The example highlights a **deliberate contract question**: `ORDER_STATE_CHANGED` may be a generic framework conflict error or an explicit action-level error category; the spec has not decided which. Schema declarations must be reconciled with actual runtime errors before any conformance guarantee.

## 4. Runtime assembles the Result + Context

Example domain failure (not transport failure):

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": {
        "code": "ORDER_ALREADY_SHIPPED",
        "retry": { "mode": "never" },
        "effects": "none"
      }
    }
  },
  "context": {
    "subject": { "id": "order:123" },
    "links": [
      { "rel": "shipment", "target": { "id": "shipment:456" } }
    ],
    "affordances": [
      {
        "interaction": {
          "thing": { "id": "shipment:456" },
          "kind": "action",
          "name": "track"
        },
        "applicability": { "state": "available" }
      }
    ]
  }
}
```

If cancellation succeeds, the same outer shape could return `ok: true` and links/affordances **selected or supplied by the application** for the new context (or empty arrays). Neither the application nor ANWA instructs the agent which next operation it must choose.

## Design tradeoffs exposed by this example

- **Avoid duplicating guard conditions.** Schema holds a named contract; code owns logic. Declared states/transitions remain useful but not fully enforced without transactional checks.
- **Guards may be slow or expensive.** The runtime must define when to evaluate applicability and when to return `unknown`.
- **Discovery can leak information.** Guard decisions and blocked-reason descriptions need policy-aware filtering.
- **Link and affordance data are application choices.** ANWA may offer resolvers and common result fields but cannot infer current linked IDs, relevance, or the best next action from arbitrary code.
- **Structured failures are important.** A named, machine-readable reason helps clients understand an error, but does not guarantee safe recovery.
- **WoT compatibility is still open.** This illustrative YAML is a proposed ANWA authoring notation; it is not WoT TD/TM syntax.

[Scope](../scope-and-boundaries.md) · [Architecture](../architecture.md) · [Interaction model](../interaction-model.md) · [Glossary](../glossary.md)
