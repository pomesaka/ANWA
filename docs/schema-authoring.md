# Interaction-first schema tooling

> Active v0.2 toolchain. The machine schema is the single public contract; implementation remains ordinary code.

## The two agent roles

**Implementing agents** create a manifest, bind its declared Interactions to handlers, and run validation/type generation. **Consuming agents** discover individual Interaction definitions, use the declared input/output/error types, invoke a ref, and inspect `Outcome + Context.next`.

There is no requirement that a human write the schema or that Interactions belong to Things.

## Commands

```bash
npm run validate
npm run types:orders
npm run inspect:orders
npm test
npm run demo
```

The validator checks top-level Interaction names, entrypoints, allowed kinds, supported payload-schema keywords, error code declarations and optional Thing metadata references. It does not yet implement full JSON Schema 2020-12.

`generate` creates TypeScript aliases such as `OrderCancelInput`, `OrderCancelOutput`, `OrderCancelErrorCode` and `OrderCancelHandler`, keyed by the InteractionRef, **not by a Thing**.

`inspect` emits a diagnostic list of the declared Interactions and their input/output fields. The human-facing presentation is incidental, not a schema design objective.

## Runtime enforcement

- Bind every declared Interaction to a handler (or Event source); optional Action guards are resolved by name.
- Validate request shape and declared success output against the supported subset.
- Reject undeclared expected domain errors as opaque `UNEXPECTED_ERROR`.
- Check `context.next` candidates reference a declared/bound Interaction, and validate bound input when provided.
- A `guidance.kind:"retry"` candidate must reference the source Interaction.
- Dynamic business state, authorization and actual side effects remain application/infrastructure concerns.

These checks do not prove that agents understand the schema or that an operation is safe. There is no production network adapter, durable task engine or cross-app reference resolution.

[Main schema](../spec/anwa-0.2.schema.json) · [Contract](../spec/anwa-0.2.md) · [Demos](../demo/README.md)
