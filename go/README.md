# ANWA Go reference adapter (experimental v0.2)

This directory is a standalone, standard-library-only Go module:

```bash
cd go
go test ./...
go vet ./...
go run ./examples/calculator
```

Go 1.23+ is required. The calculator example loads the **same**
[`demo/calculator/anwa.json`](../demo/calculator/anwa.json) as the Bun demo.
The four existing ANWA manifests (including the 27-Interaction Todo with
`$defs.Task`) are checked by Go tests. Go does **not** need the generated
TypeScript `contract.generated.ts` files.

## Author a Go application

The public JSON contract remains the source of truth. Bind one Go handler for
each declared Interaction and mark all unguarded Interactions explicitly public:

```go
manifest, err := anwa.ParseManifest(data) // []byte of anwa.json
if err != nil { return err }
app, err := anwa.New(manifest, anwa.Config{
    Public: []string{"calculator.add"},
    Handlers: map[string]anwa.Handler{
        "calculator.add": {
            Run: func(ctx context.Context, args anwa.Args) (anwa.Response, error) {
                var input struct { A, B float64 }
                if err := args.DecodeInput(&input); err != nil {
                    return anwa.Response{}, err
                }
                return anwa.Reply(anwa.OK(input.A + input.B)), nil
            },
        },
    },
})
```

Use `app.Catalog(request)`, `app.Discover(ref, request)`,
`app.Interact(ctx, ref, input, request)`, `app.Follow(ctx, next, request)`
and `app.Observe(ctx, ref, input, cursor, request)`. See the runnable
[calculator](examples/calculator/main.go).

For a guarded Query or Action, declare its guard name and possible error
codes in `anwa.json`, bind a `Config.Guards[name]` function and supply
both `Handler.Run` and `Handler.OnDenied`. The Guard runs before business
logic and denial never invokes `Run`. Event bindings instead use
`Handler.Observe`, which returns `<-chan any`; the caller should cancel its
`context.Context` to stop a long-lived stream. Guarded discoveries remain
hidden unless `Config.Discoverable` allows disclosure. There is no
application-global context resolver.

The Go runtime validates the documented payload subset, expected error codes
and context candidates. Local, acyclic `$defs` / `$ref` resolve directly
from the authoring manifest. Go `Args.DecodeInput` is an **ergonomic decode
helper**, not a generated compile-time Handler type; unlike the TypeScript
implementation, Go bindings are not statically inferred from the JSON schema.

## Security and scope

- `RequestContext.Caller` must come from a **trusted authenticating adapter**
  and must never be taken from agent-supplied `input`. Go does **not**
  verify credentials, establish a network transport or provide auth itself.
- Guard preflight does **not** replace application-side transactional and
  per-resource authorization checks. Next candidates are suggestions, not
  authorization tokens; `Follow` always checks again.
- Accepted Action results return an opaque execution ID; the application
  must implement persistence, status and retries. Event observation is a
  Go channel rather than a built-in wire protocol or durable job service.
- This is not a published package version, stable API, full JSON Schema
  engine, interoperability certification, or a complete Go translation of
  the advanced Todo business logic.

[Main specification](../spec/anwa-0.2.md) ·
[Authentication boundary](../docs/authentication-authorization.md) ·
[Repository README](../README.md)
