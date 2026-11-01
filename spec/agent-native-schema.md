# ANWA Agent-native public contract — v0.2 principles

> Working design intent, 2026-11-01. The active executable [specification](anwa-0.2.md) is experimental. Agent task success has not been independently measured.

## Primary schema consumers

- **Implementing agents** generate/maintain application code and verify it against a public Interaction schema.
- **Consuming agents** discover available Interactions and typed inputs, invoke them, interpret outcomes, and select appropriate follow-ups.

Human editability and concise JSON are not goals by themselves. The schema should optimize **semantic precision, verifiable contracts, incremental discovery, safe defaults and bounded context**.

## Current public shape

A v0.2 manifest contains `anwa`, `entrypoints` and a top-level `interactions` map. Each Interaction is a standalone `query`, `action` or `event`. There is **no Thing abstraction in ANWA Core**, no `things` map, no `subjectType`, and no mandatory resource parent.

Operations can declare typed `input` and `output`, exhaustive expected `errors`, optional semantic URI identifiers and optional Action-only `hasSideEffects` / `idempotent` booleans. Omitted Action flags mean **unknown**, not `false`; they do not certify permission or retry safety.

## Handler owns both result and continuation

```ts
app.bind({
  "execution.result": async ({ input }) => {
    const run = await findExecution(input.executionId);
    if (!run) return reply(fail("NOT_FOUND"));
    if (!run.done) return reply(fail("NOT_READY", "Still running"), [{
      ref: "execution.result",
      input: { executionId: input.executionId },
      guidance: { kind: "retry", level: "recommended" },
      when: { after: "PT30S" }
    }]);
    return reply(ok(run.result));
  }
});
```

This is illustrative application code. The framework checks the returned `Outcome + Context` structure; it does **not** select next actions or interpret server text as instructions superior to the user's goal.

`context.next` may be empty. It is the single representation of runtime continuation candidates, including retries and recommendations. An `error.effects` field concerns what occurred **during this attempt**, unlike static `hasSideEffects`.

## Contract validation and boundaries

TypeScript Handlers, generated interfaces, runtime payload validation, error-code checks and reference validation are available in the prototype. Missing or undeclared domain codes become opaque `UNEXPECTED_ERROR`. Named Guards are optional code-backed helpers **evaluated by the Runtime before the associated Action**; a guarded Interaction provides its own `onDenied` callback for Context, and `run` is not invoked on denial. Schema-derived TypeScript input/output/error types are enforced at Handler binding.

Full JSON Schema 2020-12, network authentication, federation/external API delegation, replay and durable execution are not yet provided.

W3C WoT Things and Thing Descriptions remain **prior art** and possible adapter targets, **not ANWA Core concepts**. No WoT conformance is claimed.

## Evidence still needed

Evaluate unfamiliar AI clients using only public catalog/Discovery/Interaction responses and compare against OpenAPI/MCP/WoT alternatives for task success, invalid calls, unsafe actions, tokens and latency.

[ANWA v0.2](anwa-0.2.md) · [Machine-readable schema](anwa-0.2.schema.json) · [Tooling](../docs/schema-authoring.md)
