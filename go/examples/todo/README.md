# Small Todo in Go — six real Interactions

This demo validates the **Go-generated ServerInterface** with a stateful
application instead of a stateless calculator. It intentionally stays much
smaller than the 27-Interaction Bun Todo example.

## Try it

From the repository's `go/` directory:

```bash
go run ./cmd/anwa-codegen -in examples/todo/anwa.json -out examples/todo/contract.gen.go -package main -check
go run ./examples/todo
go test -race ./examples/todo
```

`anwa.json` is author-maintained; `contract.gen.go` is generated and
checked into Git. `server.go` implements every generated method. The
`Handlers(server)` adapter connects these methods to the common ANWA Go
runtime, with no hand-maintained string-to-handler map.

## What it tests

| Interaction | Behavior |
| --- | --- |
| `task.create` | Validate title, allocate an owner-scoped in-memory task |
| `task.list` | Return only the caller's tasks in creation order |
| `task.get` | Retrieve one owned task and offer relevant next Interactions |
| `task.rename` | Update title with `expectedVersion` concurrency control |
| `task.complete` | Complete once; detect stale versions and repeat completion |
| `task.delete` | Delete only the caller's task with version precondition |

All four Actions explicitly declare `hasSideEffects: true` and conservatively declare `idempotent: false`. A version precondition prevents a stale write from being committed twice in this process, but that alone does not establish end-to-end retry safety after network timeouts. The two Queries do not carry Action-only effect fields.

A single shared `$defs.Task` schema describes response data for create,
list, get, rename, and complete. Task is **data**, not a Thing or an
independently invocable resource.

**Authentication and authorization:** all six Interactions declare the
`requireCaller` Guard. The demo passes *simulated* verified callers into
the runtime; it does not implement login or token verification. Private
Discovery is hidden from anonymous callers. Business handlers also check
task ownership while holding the same mutex as the state update. They return
`TASK_NOT_FOUND` for both absent and other users' task IDs.

**Concurrency:** task versions start at 1, and rename/complete/delete use
optimistic `expectedVersion` checks. Under simultaneous updates only one
write with a given version succeeds. Tests execute concurrent requests
under Go's race detector.

**Navigation:** successful create returns a `task.get` candidate. A stale
update returns `VERSION_CONFLICT` and recommends `task.get` for recovery.
Following a candidate is a fresh invocation, not an authorization bypass.

## Deliberate limitations

Everything is **in-memory and single-process**; no database, persistence,
transport, distributed locking or credential verification is provided.
Mutexes protect this demonstration process only. Business title restrictions
(1–120 Unicode code points after trimming) are checked by application logic
because the current ANWA v0.2 JSON Schema subset does not support
`minLength`/`maxLength`. Go's generated contract checks method coverage
and types, but the runtime still validates untrusted input and output.

The example does not implement sharing, recurring tasks, events or async
executions: the existing advanced Bun Todo and Reports demos cover those
separately.

[Go reference guide](../../README.md) · [ANWA v0.2](../../../spec/anwa-0.2.md)
