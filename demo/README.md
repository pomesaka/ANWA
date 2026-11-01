# ANWA v0.2 — Executable Interaction-first demos

These are dependency-free Node.js **in-process** applications, not network services or a released framework.

```bash
npm run validate
npm run types:orders
npm test
npm run demo
```

| Demo | Declared Interactions | Things |
| --- | --- | --- |
| [Calculator](calculator/) | `calculator.add`, `calculator.divide` | **None**: pure service operations with typed results |
| [Orders](orders/) | `order.get`, `order.cancel`, `shipment.track` | **Optional metadata** for Order/Shipment; handlers receive orderId/shipmentId as normal input |
| [Reports](reports/) | `report.generate`, `execution.status`, `execution.result`, `execution.updates` | **None**: accepted execution ID is data, not an Execution Thing |

Each example has an `anwa.json` manifest and an `index.mjs` implementation, bound directly by InteractionRef using [the runtime](../src/anwa.mjs).

### What this demonstrates

- `app.bind({"report.generate": handler, ...})` — no Thing parent is necessary.
- `catalog()` and `discover("execution.status")` describe individual Interactions.
- `interact("execution.result", {executionId})` reads a result; `observe("execution.updates", {executionId})` observes events.
- Both success and failure have `Outcome + Context`.
- A `context.next` candidate can include an InteractionRef plus the input needed to target an instance. A retry is the **same ref** with `guidance.kind: "retry"` and optional `when.after`.

The Orders demo uses an in-memory Map rather than transactional storage. Reports uses ephemeral asynchronous work with no restart safety or guaranteed delivery. Guards and Context are implemented in ordinary code; ANWA does not infer the workflow.

[v0.2 contract](../spec/anwa-0.2.md) · [Machine-readable schema](../spec/anwa-0.2.schema.json) · [README](../README.md)
