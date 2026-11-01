# Executable ANWA v0.1 demos

**Small in-process applications, not deployed services or a production framework.** Run with Node.js 20+; no dependencies or API keys:

```bash
npm test
npm run demo
```

| Application | Thing granularity chosen by author | What is demonstrated |
| --- | --- | --- |
| [Calculator](calculator/) | One service-level Thing, Calculator/main | Stateless handlers, typed Result/error and empty Context |
| [Orders](orders/) | One Thing per order and shipment | Application-coded guard, domain state, `context.next` tracking recommendation |
| [Reports](reports/) | Service Thing plus per-run Execution Things | Accepted execution, `context.next` observation choices, timed retry for `NOT_READY`, final settled Result |

Each app has its own `anwa.json` and ordinary JavaScript handlers in `index.mjs`. All use the [small reference adapter](../src/anwa.mjs).

Runtime context examples now use `next: []` rather than separate Links/Affordances. A retry is a `next` candidate with `guidance.kind: "retry"` and optionally `when.after`; the error itself only describes the failed attempt.

These examples are **different on purpose**. ANWA does not mandate their Thing granularity, workflow, database, or next-step guidance. Orders uses an in-memory Map (no transactional durability). Reports runs an ephemeral local asynchronous task and exposes an AsyncIterable (not SSE or a production queue).

[0.1 contract](../spec/anwa-0.1.md) · [Project README](../README.md)
