# ANWA v0.2 — Interaction-first architecture

> Experimental in-process reference runtimes: [TypeScript](../src/anwa.ts) and [Go](../go/README.md). [Public schema](../spec/anwa-0.2.md).

ANWA Core publishes standalone Interactions. No Thing, ThingRef, domain-instance registry, global Context resolver or mandatory state machine is required.

## Four responsibilities

1. **Description:** public JSON schema declares Interactions and their input/output/error contracts.
2. **Binding:** each declared Interaction is connected to a Handler; Actions can also reference a named Guard.
3. **Discovery:** the public catalog and per-Interaction descriptions let an agent discover the contract.
4. **Interaction:** the Runtime validates the input, runs a Guard if declared, dispatches the Handler and validates **Outcome + Context**.

## Handler-owned Context, Runtime-enforced Guard

The application implementation supplies Context on the same Interaction that produces the result:

```ts
const app = new AnwaApp(schema).bind({
  "order.get": async ({input}) => reply(ok(await readOrder(input.orderId))),
  "order.cancel": {
    run: async ({input}) => {
      const result = await cancelConditionally(input.orderId, input.reason);
      return reply(ok(result), [
        {ref:"order.get", input:{orderId:input.orderId}, guidance:{level:"recommended"}}
      ]);
    },
    onDenied: async ({input, error}) => {
      // This Interaction owns the next candidates even when its Guard rejects it.
      return error.code === "ORDER_ALREADY_SHIPPED"
        ? [{ref:"shipment.track", input:{shipmentId:await shipmentIdFor(input.orderId)},
            guidance:{level:"recommended"}}]
        : [];
    }
  }
}, {
  guards: {canCancel: async ({input}) => checkCancellation(input.orderId)}
});
```

This snippet is illustrative; the runnable example is [demo/orders/index.ts](../demo/orders/index.ts).

**Runtime guarantees for declared Guards:**
- Input is checked **before** the Guard.
- The named Guard runs **before** the business `run` Handler.
- If the Guard denies, `run` is never invoked; the Runtime keeps the declared Guard error as the Outcome.
- The Interaction-specific `onDenied` callback supplies only `context.next`, and malformed output becomes an opaque `UNEXPECTED_ERROR`.
- A missing Guard or `onDenied` is rejected at binding time.

This preflight **does not** replace application authorization, atomic state transitions or transactional storage: a Guard can become stale before the actual mutation. Guards and Handlers remain ordinary application code.

An unguarded Interaction simply returns `reply(ok(value), next)` or `reply(fail(code), next)`. There is **no app-level Context callback**. The Runtime does not choose the next business step.

## Authentication and authorization

A trusted transport Adapter authenticates the caller and passes `{caller:{subject,claims?}}` as a **separate RequestContext**, never as public Interaction input. The reference does not authenticate or cryptographically verify this object; network adapters must guarantee its provenance.

Named Guards now protect **Queries, Actions and Events**. Binding is default-deny: unguarded Interactions require an explicit `public` allowlist. Queries/Actions use `{run,onDenied}` and Event subscriptions use guarded `{run}`. `catalog(request)` and `discover(ref,request)` filter descriptions using a coarse `discoverable` policy; actual per-resource decisions remain in the Guard at invocation.

[Authentication and authorization details](authentication-authorization.md).

## Language adapters

ANWA's public JSON manifest is language-neutral. The Go adapter reads the same manifest, resolves local reusable definitions, and generates a strict `ServerInterface` with typed request/output structures and response variants. An application-defined Go struct must implement every generated Interaction method at compile time; the generated adapter bridges this interface to the Guard-enforced in-process runtime. Auth and discovery policies remain explicit application inputs, and the runtime still validates untrusted JSON, declared errors, and `context.next`. Go types are not a substitute for runtime schema enforcement. See the [Go guide](../go/README.md).

## Optional HTTP Binding

The in-process ANWA runtime is not tied to a wire protocol. The experimental
[HTTP Binding 0.1](http-binding.md) attaches a thin host-specific adapter:
Go exposes `http.Handler` to `net/http`-compatible routers; TypeScript
exposes Fetch-standard `Request → Response`, usable directly in Hono and
Fetch-native runtimes. Both expose catalog, individual Discovery and Invoke
without adding HTTP fields to the ANWA manifest or changing Handler ownership
of `Outcome + Context`. Event streaming is a separate protocol decision.

## Schema-derived TypeScript types

The author-maintained `anwa.json` is the source of truth. Shared payload shapes may live in `$defs` and be referenced with local `$ref` (without introducing Thing semantics). `bun run codegen` expands those references and produces a checked `contract.generated.ts` with literal schema types. `new AnwaApp(schema).bind(...)` infers the Handler's `input`, success output shape, declared error codes, allowed InteractionRefs and named Guard parameters.

CI regenerates the contract and fails on drift; it also runs strict `bun check`, Formatter, Oxlint, Bun tests and demos. Runtime validation remains essential for untrusted agent inputs.

[ANWA spec](../spec/anwa-0.2.md) · [Schema authoring](schema-authoring.md)
