# Typed failures and exhaustive matching

> Experimental TypeScript implementation detail for ANWA v0.2. The public
> JSON manifest and wire response format are unchanged.

## Two different Result types

ANWA has an established **public** result that belongs to an Interaction:

```ts
type InteractionResult<T, C> =
  | { ok: true; value: T }
  | { ok: false; error: { code: C; effects?: "none" | "occurred" | "unknown" } };
```

It is always inside the public `Outcome + Context` envelope. The application
returns a declared failure (for example `ORDER_ALREADY_SHIPPED`) with
`context.next`, not an unhandled exception.

The **internal** `neverthrow.Result<T, E>` is an effect boundary for
JavaScript exceptions, rejected promises and transport parsing. It is not
serialized in ANWA responses. These two types have different purposes; imports
in `src/anwa.ts` use the name `NeverthrowResult` to keep them distinct.

## Error algebra boundaries

- **Expected application failures:** an Interaction Handler returns ANWA
  `reply(fail(code), next)`. Handler-generated `context.next` is retained.
- **Untrusted agent input:** runtime checks input schemas and returns the
  public `INVALID_INPUT` result before invoking a Guard.
- **Handler / Guard failures:** `ResultAsync.fromThrowable` handles both a
  synchronous throw and an asynchronous rejection at one boundary. A malformed
  handler response, invalid output, or undeclared domain error becomes the
  opaque public `UNEXPECTED_ERROR` as before.
- **Discovery policy exceptions:** `Result.fromThrowable` fails closed and
  suppresses access to protected Interaction descriptions.
- **Event Guard exceptions:** `ResultAsync.fromThrowable` maps failures to
  `ObservationDenied("UNEXPECTED_ERROR")`; an intentional declared Guard
  denial uses its own code.
- **HTTP protocol failures:** `HttpFailure` is a tagged union, separate from
  ANWA's domain errors. A single exhaustive `ts-pattern` match maps it to
  problem+json and HTTP statuses. Request body and JSON decoding are bounded
  and wrapped in explicit Result boundaries. Transport errors are never
  converted into application `context.next`.
- **CLI:** the command union is matched exhaustively; filesystem, parsing and
  formatter errors are handled through a single `Result.fromThrowable`
  boundary.

New variants of `HttpFailure`, `Outcome`, or the CLI command union require
an exhaustive match update at compile time. Tests assert that no authored
TypeScript code under `src`, `demo`, `test` or `tools` contains
`try/catch` statements.

## What this intentionally does **not** change

It would be incorrect to treat all failures as ordinary domain errors.
A violated startup contract (invalid `anwa.json`, invalid bindings), unknown
in-process ref, malformed trusted RequestContext or a broken Event iterator
is still a programmer/integration error and may throw. The runtime *boundary*
is what isolates unsafe Handler/Guard evaluation before returning a public
Interaction Result. The underlying `neverthrow` package internally catches
exceptions; code in this repository no longer hand-writes those catch blocks.

There is no claim that `neverthrow` prevents arbitrary application code from
throwing, makes a network Action idempotent, or implements retries. Application
transactional authorization, duplicate-request handling and event-stream
delivery guarantees remain outside these changes.

[Core runtime](../src/anwa.ts) · [HTTP failure algebra](../src/http/protocol.ts) ·
[HTTP Binding](http-binding.md)
