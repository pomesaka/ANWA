# ANWA v0.2 — TypeScript schema tooling

> Experimental, Interaction-first. The public manifest is the source of truth for agent-generated implementations and agent consumers.

## Tools (Bun ^1.4.4)

```bash
bun install --frozen-lockfile
bun run validate
bun run types:orders
bun run inspect:orders
bun fmt --check src demo test tools
bunx oxlint src demo test tools
bun check
bun test
bun run demo
```

The repository uses the **Bun 1.4.4 built-in formatter** and **Oxlint 1.90.0 invoked through Bun**. The pinned Bun 1.4.4 executable does not expose `bun lint` as a functioning built-in CLI; using the external linter avoids misleading pass results.

- **Validation:** top-level Interaction names/entrypoints, allowed kinds, machine-readable errors, payload type subset, and referenced Context candidates.
- **Type generation:** `OrderCancelInput`, `OrderCancelOutput`, `OrderCancelErrorCode` and `OrderCancelHandler` from standalone InteractionRefs.
- **Runtime checking:** incoming inputs, handler success output, domain error codes and `context.next` references/optional inputs.
- **Type checking:** `bun check` with strict TypeScript configuration, plus Bun tests.

Every Handler constructs **its own Outcome and Context** with `reply(result, next)`. There is no global Context callback. An optional named Guard is evaluated explicitly by the owning Handler using `app.assess(ref, input)`; the framework does not automatically enforce business authorization.

No Thing, ThingRef, `things`, or `subjectType` is part of the current manifest.

The reference supports a limited JSON Schema dialect and is not a production network service. Generated types do not prove the business behavior is correct.

[v0.2 specification](../spec/anwa-0.2.md) · [Reference runtime](../src/anwa.ts) · [Demos](../demo/README.md)
