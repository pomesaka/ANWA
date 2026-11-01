# Order cancellation — automatically enforced Guard, per-Interaction Context

> Experimental ANWA v0.2 example. See [the executable implementation](../../demo/orders/index.ts) for exact behavior. ANWA does not model Things or decide the order lifecycle.

## Declared contract

The public JSON [Orders schema](../../demo/orders/anwa.json) declares a standalone `order.cancel` Action with input `{orderId, reason}`, output `{status}`, exhaustive expected error codes (`NOT_FOUND`, `ORDER_ALREADY_SHIPPED`, `ALREADY_CANCELLED`, `ORDER_STATE_CHANGED`), and the named Guard `canCancel`.

The author-maintained JSON is used to generate [a typed contract](../../demo/orders/contract.generated.ts) with `bun run codegen`. This literal contract constrains the types of the Handler's input, successful output, error codes, and Guard arguments.

## Handler, Guard and Context

```ts
const app = new AnwaApp(schema).bind({
  "order.cancel": {
    // Runtime calls this only after the declared Guard allows invocation.
    run: async ({input}) => {
      const cancelled = await cancelConditionally(input.orderId, input.reason);
      return reply(ok({status:cancelled.status}), [
        {ref:"order.get", input:{orderId:input.orderId},
          guidance:{level:"recommended"}}
      ]);
    },
    // Called only on denial. It cannot replace the Guard error outcome.
    onDenied: async ({input, error}) => {
      if (error.code !== "ORDER_ALREADY_SHIPPED") return [];
      return [{
        ref:"shipment.track",
        input:{shipmentId:await shipmentIdFor(input.orderId)},
        guidance:{level:"recommended"}
      }];
    }
  }
}, {
  guards:{canCancel: async ({input}) => checkCancellation(input.orderId)}
});
```

These functions are examples of application code, not ANWA-provided business functions.

The Runtime performs input validation, then checks `canCancel` **before** calling `run`. If denied, the Runtime returns the declared error as Outcome and gets the next candidates from `onDenied`. This prevents accidental omission of the declared Guard in the Handler.

A blocked cancellation can return:

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

The recommendation is an available alternative, **not** a retry or a command. The agent chooses whether to follow it. ANWA does not infer a business workflow, ensure authorization, or make the Guard and data mutation atomic: the Handler must still use appropriate persistence checks.

[Architecture](../architecture.md) · [Contract](../../spec/anwa-0.2.md)
