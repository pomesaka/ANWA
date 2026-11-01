# ANWA v0.2 architecture — Interaction-first

> Experimental reference architecture, not a released specification. [Authoritative v0.2 contract](../spec/anwa-0.2.md).

ANWA enables **AI-consumable, schema-first applications without requiring a user interface or a Thing model**. The first-class public unit is an Interaction.

## Four responsibilities

1. **Description:** a public schema with top-level `interactions`, their types, declared domain errors and optional semantic metadata.
2. **Binding:** associate declared InteractionRefs directly with application-provided handlers, guards and a Context resolver.
3. **Discovery:** enumerate and describe available InteractionRefs without forcing the agent to choose a Thing first.
4. **Interaction:** call/observe an Interaction and return `Outcome + Context`. Context advertises application-selected next Interactions, not mandatory commands.

### Current experimental API

```js
const app = new AnwaApp(manifest).bind({
  "order.get": async ({input}) => getOrder(input.orderId),
  "order.cancel": async ({input}) => cancelOrder(input.orderId,input.reason)
}, {
  guards: { canCancel: async ({input}) => inspectOrder(input.orderId) },
  context: ({ref,input,outcome}) => ({next: []})
});

app.catalog();
await app.discover("order.cancel");
await app.interact("order.cancel", {orderId:"123", reason:"Changed my mind"});
```

### What is optional

`things` is optional metadata about domain concepts. An Interaction can optionally declare `subjectType` for semantic context, but **no ThingRef is required for invocation**. The application chooses how dynamic IDs are represented in input. Even async executions can be identified using a string execution ID and queried through `execution.status`.

Guards, state machines, streaming, persistence, approvals, relation modeling, authorization, retry strategy and side-effect implementations remain application-defined. ANWA provides common representations and integration surfaces, not an application designer.

### Navigation semantics

`Outcome` conveys success, domain failure (declared code) or async acceptance. `context.next` contains references to subsequent operations and optional prebound input, applicability, importance and timing. Retry is a candidate with the same InteractionRef, optionally marked `guidance.kind: "retry"`. The app may provide none.

A WoT Thing Description binds Interaction Affordances to Things. This v0.2 ANWA model is **not WoT TD-compatible by construction**; a future adapter might synthesize a service Thing when appropriate, but the core does not need one.

## Limitations

The reference runtime is in-process and has no network adapters, authentication, persistence, distributed transaction guarantees or complete JSON Schema 2020-12 support. Runtime validation cannot prove that business-rule decisions or effect declarations are true.

[Main README](../README.md) · [v0.2 schema](../spec/anwa-0.2.schema.json) · [Executable examples](../demo/README.md)
