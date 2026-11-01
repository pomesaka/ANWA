# ANWA v0.2 — TypeScript demos on Bun ^1.4.4

These examples are **in-process**. They are not deployed services, or a production runtime.

```bash
bun install --frozen-lockfile
bun run validate
bun run types:orders
bun fmt --check src demo test tools
bun lint src demo test tools
bun check
bun test
bun run demo
```

| Demo                      | First-class Interactions                                                       | What it demonstrates                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [Calculator](calculator/) | `calculator.add`, `calculator.divide`                                          | Standalone pure operations, empty Context and typed domain errors                                      |
| [Orders](orders/)         | `order.get`, `order.cancel`, `shipment.track`                                  | Optional named Guard evaluated by the cancellation Handler; it returns its own contextual alternatives |
| [Reports](reports/)       | `report.generate`, `execution.status`, `execution.result`, `execution.updates` | Async execution without a Thing, Event observation, a contextual timed retry                           |

Every app has an `anwa.json` schema and an **`index.ts`** implementation. The [TypeScript runtime](../src/anwa.ts) binds operations by InteractionRef. No `things` or `subjectType` declarations are present.

Each Handler returns `reply(result, next)`. A simple operation uses `reply(ok(value))`, which contains `next: []`. A domain failure can provide recommended next Interactions or a timed retry. There is no application-wide Context resolver.

Orders uses in-memory Maps rather than transactions; Reports uses short-lived async work rather than durable jobs. These are examples of expressive power, not ANWA-mandated application architectures.

[v0.2 contract](../spec/anwa-0.2.md) · [README](../README.md)
