# Order cancellation — Handler-owned Context (ANWA v0.2)

> Experimental example based on [the executable Orders demo](../../demo/orders/index.ts). The domain contains orders and shipments, but **ANWA Core does not define Things**.

## Schema

An `anwa.json` Interaction declaration describes `order.cancel` independently of any domain entity parent:

```json
{
  "kind": "action",
  "description": "Cancel an order when permitted.",
  "input": {
    "type": "object",
    "properties": {
      "orderId": { "type": "string" },
      "reason": { "type": "string" }
    },
    "required": ["orderId", "reason"],
    "additionalProperties": false
  },
  "output": {
    "type": "object",
    "properties": { "status": { "type": "string" } },
    "required": ["status"]
  },
  "errors": {
    "NOT_FOUND": "The order was not found.",
    "ORDER_ALREADY_SHIPPED": "Cancellation is unavailable after shipping.",
    "ALREADY_CANCELLED": "The order has already been cancelled.",
    "ORDER_STATE_CHANGED": "The order changed while cancellation was being attempted."
  },
  "guard": "canCancel",
  "hasSideEffects": true,
  "idempotent": false
}
```

This is an excerpt of one definition, not a complete manifest. See [demo/orders/anwa.json](../../demo/orders/anwa.json) for the actual schema and other Interactions.

## Handler and Context

The **same Interaction Handler owns both its execution result and its follow-up candidates**. There is no global Context callback.

```ts
const app = new AnwaApp(schema);
app.bind({
  "order.cancel": async ({ input }) => {
    const decision = await app.assess("order.cancel", input);
    if (!decision.allowed) {
      const next = decision.error.code === "ORDER_ALREADY_SHIPPED"
        ? [{
            ref: "shipment.track",
            input: { shipmentId: await getShipmentId(input.orderId) },
            guidance: { level: "recommended" }
          }]
        : [];
      return reply({ ok: false, error: decision.error }, next);
    }
    const order = await cancelConditionally(input.orderId, input.reason);
    return reply(ok({ status: order.status }), [
      { ref: "order.get", input: { orderId: input.orderId },
        guidance: { level: "recommended" } }
    ]);
  }
}, {
  guards: { canCancel: async ({ input }) => canCancelOrder(input.orderId) }
});
```

The code is illustrative; the real, runnable Handler is in [demo/orders/index.ts](../../demo/orders/index.ts). The named Guard is **bound by ANWA but explicitly called by the Handler**. The application still enforces authorization and atomic updates. A delayed or stale Guard check is not a transaction.

A shipping-related domain failure might return:

```json
{
  "outcome": {
    "kind": "settled",
    "result": { "ok": false, "error": { "code": "ORDER_ALREADY_SHIPPED", "effects": "none" } }
  },
  "context": {
    "next": [{
      "ref": "shipment.track",
      "input": { "shipmentId": "shipped-ship" },
      "guidance": { "level": "recommended" }
    }]
  }
}
```

This is **another Interaction**, not a retry. A retry (when warranted) would reference the **same** Interaction with `guidance.kind: "retry"`. The consuming agent chooses whether to follow a candidate based on the user's delegated goal.

[TypeScript architecture](../architecture.md) · [ANWA v0.2 spec](../../spec/anwa-0.2.md)
