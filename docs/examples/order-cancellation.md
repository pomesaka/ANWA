# Order cancellation — Interaction-first example

> **Experimental ANWA v0.2**. The application uses *optional* Order/Shipment Thing metadata, but every operation is a standalone Interaction. This is an expressiveness example, not a required business architecture.

## Public schema excerpt

```json
{
  "anwa": "0.2",
  "entrypoints": ["order.get", "order.cancel", "shipment.track"],
  "things": {
    "Order": {"title":"Purchase order","description":"Order metadata"},
    "Shipment": {"title":"Shipment","description":"Shipment metadata"}
  },
  "interactions": {
    "order.cancel": {
      "kind": "action",
      "description": "Request cancellation of an order.",
      "subjectType": "Order",
      "input": {
        "type": "object",
        "properties": {
          "orderId": {"type":"string"},
          "reason": {"type":"string"}
        },
        "required": ["orderId", "reason"],
        "additionalProperties": false
      },
      "output": {"type":"object","properties":{"status":{"type":"string"}},"required":["status"]},
      "errors": {
        "NOT_FOUND":"Order not found",
        "ORDER_ALREADY_SHIPPED":"Cancellation blocked by shipping",
        "ALREADY_CANCELLED":"Order already cancelled",
        "ORDER_STATE_CHANGED":"State changed while cancellation was attempted"
      },
      "guard": "canCancel",
      "hasSideEffects": true,
      "idempotent": false
    }
  }
}
```

The actual manifest is [demo/orders/anwa.json](../../demo/orders/anwa.json); it additionally declares `order.get` and `shipment.track`. The excerpt above uses the same structure but is **not** a full standalone app because its entrypoints reference undeclared Interactions.

## Implementation and binding

```js
const app = new AnwaApp(manifest).bind({
  "order.cancel": async ({input}) => cancelOrder(input.orderId, input.reason),
  "order.get": async ({input}) => readOrder(input.orderId),
  "shipment.track": async ({input}) => trackShipment(input.shipmentId)
},{
  guards:{canCancel: async ({input}) => checkCancellation(input.orderId)},
  context:({ref,input,outcome}) => {
    if(ref==="order.cancel" && outcome?.result?.error?.code==="ORDER_ALREADY_SHIPPED")
      return {next:[{
        ref:"shipment.track",
        input:{shipmentId:findShipmentId(input.orderId)},
        guidance:{level:"recommended"}
      }]};
    return {next:[]};
  }
});
```

These functions are illustrative application code, not ANWA SDK functions. The real, runnable example is [demo/orders/index.mjs](../../demo/orders/index.mjs).

## Why this matters

The result of a failed `order.cancel` carries an Error code explaining *why*, then `context.next` offers a different standalone Interaction to investigate the shipment. The agent chooses whether that is relevant to the user. **No per-order Thing or ThingRef is necessary**; the IDs are normal typed inputs.

ANWA validates declared errors and references, but the application enforces authorization, transactions, side effects, state transitions and contextual next-action choices.

[Architecture](../architecture.md) · [v0.2 specification](../../spec/anwa-0.2.md)
