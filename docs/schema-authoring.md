# ANWA v0.2 — TypeScript schema tooling

> Experimental, Interaction-first. The public manifest is the source of truth for agent-generated implementations and agent consumers.

## Tools (Bun ^1.4.4)

```bash
bun install --frozen-lockfile
bun run validate
bun run codegen
bun run types:orders
bun run inspect:orders
bun fmt --check src demo test tools
bunx oxlint src demo test tools
bun check
bun test
bun run demo
```

The repository uses the **Bun 1.4.4 built-in formatter** and **Oxlint 1.90.0 invoked through Bun**. The pinned Bun 1.4.4 executable does not expose `bun lint` as a functioning built-in CLI; using the external linter avoids misleading pass results.

- **Validation:** top-level Interaction names/entrypoints, allowed kinds, machine-readable errors, payload type subset, shared-schema references and referenced Context candidates.
- **Type generation:** `bun run codegen` generates checked `contract.generated.ts` modules from JSON. Their literal schema types are inferred by `new AnwaApp(schema).bind(...)`, constraining each Handler's input, successful output, declared error codes and Guard parameters. The existing `types:orders` command also emits standalone declaration aliases.
- **Runtime checking:** incoming inputs, handler success output, domain error codes and `context.next` references/optional inputs.
- **Type checking:** `bun check` with strict TypeScript configuration, plus Bun tests.

Every ordinary Handler constructs **its own Outcome and Context** with `reply(result, next)`. A guarded Action uses `{run, onDenied}`: the Runtime evaluates its declared named Guard first, skips `run` on denial and calls `onDenied` to obtain that Interaction's next candidates. There is no global Context callback. This is not an atomic permission or database transaction guarantee.

No Thing, ThingRef, `things`, or `subjectType` is part of the current manifest.

### Reuse payload shapes without Thing declarations

A manifest can define reusable data schemas once under the optional root `$defs` key. For example, the [Todo manifest](../demo/todo/anwa.json) defines `Task`, `Project`, and `SavedQuery` payload shapes; multiple standalone Interactions reference these with `{"$ref":"#/$defs/Task"}`. A definition describes **data only**: it is neither a Thing nor a resource/Interaction registration.

Only local root definitions matching `#/$defs/Name` are supported. A `$ref` must be the only field in its schema object; missing definitions, reference cycles, other JSON Pointers, and remote URLs fail manifest validation. `bun run codegen` resolves shared definitions into self-contained literal types in `contract.generated.ts` so existing Handler inference remains unchanged. The runtime also resolves references when a raw JSON manifest is bound directly, and rejects inputs or outputs violating their expanded schema.

The reference supports a limited JSON Schema dialect and is not a production network service. CI regenerates the checked manifest modules and rejects drift; types do not prove business logic or authorization is correct.

[v0.2 specification](../spec/anwa-0.2.md) · [Reference runtime](../src/anwa.ts) · [Demos](../demo/README.md)
