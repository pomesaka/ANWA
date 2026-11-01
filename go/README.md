# ANWA Go — schema-first, interface-first reference adapter

This Go 1.23+ module uses **one public `anwa.json`** for Go and TypeScript.
The standard-library-only generator produces Go request/output types and a
`ServerInterface` that application authors must implement. This is modeled
on `oapi-codegen`'s strict-server pattern, **not** an HTTP server generator.

## Generate and implement

From the `go/` directory:

```bash
go run ./cmd/anwa-codegen \
  -in ../demo/calculator/anwa.json \
  -out examples/calculator/contract.gen.go \
  -package main
go run ./examples/calculator
go run ./cmd/anwa-codegen -in examples/todo/anwa.json -out examples/todo/contract.gen.go -package main -check
go run ./examples/todo
go test ./...
go vet ./...
```

The checked-in [calculator implementation](examples/calculator/main.go)
satisfies the generated `ServerInterface` at **compile time**:

```go
type CalculatorServer struct{}
var _ ServerInterface = (*CalculatorServer)(nil)

func (*CalculatorServer) CalculatorAdd(
    ctx context.Context,
    request CalculatorAddRequest,
) (CalculatorAddResponse, error) {
    return CalculatorAddOK{
        Value: CalculatorAddOutput(request.Input.A + request.Input.B),
    }, nil
}
```

A generated `Handlers(server ServerInterface)` adapter connects that
implementation to ANWA's runtime. The application never writes the
`map[string]anwa.Handler` registry by hand:

```go
app, err := anwa.New(manifest, anwa.Config{
    Public: []string{"calculator.add", "calculator.divide"},
    Handlers: Handlers(&CalculatorServer{}),
})
```

If the author omits a declared Interaction method, changes a method's
signature, or returns the wrong generated response family, Go compilation
fails. The generated operation-specific `OK`, `Failure`, and `Accepted`
response types encode the expected ANWA `Outcome + Context` envelope.

## Generated contract and runtime responsibilities

| Generated from the manifest | Still enforced at runtime |
| --- | --- |
| Input and output Go types | Input/output JSON-schema subset validation |
| `ServerInterface` for all Interactions | Default-deny binding and named Guards |
| Declared error-code constants | Error code and effects checks |
| Success / declared failure / accepted response variants | `context.next` validation and discoverability filtering |
| Handler adapter and guarded `OnDenied` methods | Verified caller boundary and denial-before-run |

Guard functions and Discovery policies are deliberately separate, app-owned
dependencies supplied through `anwa.Config`. A generated guarded method
also requires a corresponding `<Interaction>OnDenied` method; Event methods
return `<-chan any` and are protected before observation starts.

The Go generator supports the v0.2 payload subset with local, noncyclic
`$defs` and `$ref`. It validates and generates Go syntax for all four
existing ANWA manifests, including the 27-Interaction Todo. Both [Calculator](examples/calculator/main.go) and the [six-Interaction Todo](examples/todo/README.md) are runnable Go implementations. The Todo exercises guarded discovery, caller isolation, versioned updates, domain errors and `context.next` navigation.

Generated files should be committed. CI checks the committed Calculator and Todo
contracts against re-generation with:

```bash
go run ./cmd/anwa-codegen \
  -in ../demo/calculator/anwa.json \
  -out examples/calculator/contract.gen.go \
  -package main -check

go run ./cmd/anwa-codegen \
  -in examples/todo/anwa.json \
  -out examples/todo/contract.gen.go \
  -package main -check
```

## Explicit boundaries

- This is a transport-independent, experimental **Go reference runtime**.
  It does not authenticate callers, host HTTP routes, provide durable jobs,
  or replace atomic application authorization.
- Go enforces typed method signatures, required model fields, and the declared
  success type. JSON Schema enum constraints, semantic rules, untrusted data,
  guard decisions, and allowed next references **still require runtime checks**.
- This does not port the **advanced 27-Interaction Todo** business logic to Go or certify interoperability
  with every JSON Schema or ANWA implementation. Event payloads remain
  application-defined `any` values.
- Code generation only covers the explicitly supported v0.2 schema subset;
  it is not a general-purpose OpenAPI code generator or an adopted standard.

[ANWA v0.2](../spec/anwa-0.2.md) · [Go Calculator](examples/calculator/main.go) · [Go Todo](examples/todo/README.md) ·
[Authentication boundary](../docs/authentication-authorization.md)
