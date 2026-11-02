# Executable ANWA specifications

The specification is the **case data and mandatory assertions**, not the number of tests.
Run from the repository root:

```sh
bun test
bun check                    # Compile-only request/response and Hono RPC contracts
bun run architecture:check   # Separate AST-based implementation policy
(cd go && go test -race ./...)
```

## Read a specification

TypeScript suites use `describe` for the rule and `test.each` for independent examples.
Go tables use named `t.Run` cases. A row states its **precondition/input**, **operation**,
**expected result**, and where relevant **forbidden effects**. Every row creates its own
runtime/state. Case names in test output identify the violated requirement.

`support/outcome.ts` asserts the expected variant before exposing its value/error. A
failure case must fail when it unexpectedly succeeds, is accepted instead of settled,
or has the wrong error code. Assertions are never gated on the _actual_ outcome.
Branching on a table's declared expected case is permitted: each branch still asserts.

Use an explicit scenario for a meaningful sequence: dependency unblocking, recurring
completion, batch atomicity, accepted-to-settled execution, and concurrent updates. Do
not bury whole unrelated scenarios inside callbacks just to claim table-driven coverage.

## Requirement index

| Rule                                             | Executable specification                                        | Required observations                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Action effect flags and schema restrictions      | `contracts.test.ts` / `SCHEMA`; `go/anwa/anwa_test.go`          | Exact offending field; missing flags reject; explicit false survives                                                   |
| Published schemas and reference expansion        | `contracts.test.ts` / `CODEGEN`, `REF`                          | All demo manifests validate; expansion equals generated contract; input/output enforcement                             |
| Binding is explicit and default-deny             | `contracts.test.ts` / `BIND`                                    | Missing Handler/Guard/denial hook rejects; public cannot bypass a Guard                                                |
| Input → Guard → denial or run ordering           | `contracts.test.ts` / `DISPATCH`                                | Trace, result variant/code and continuation all match; invalid input calls nothing                                     |
| Malformed output never looks successful          | `contracts.test.ts` / `RESULT`; Go opaque-failure table         | Complete opaque failure envelope, no continuation, no private message                                                  |
| Factory and binding isolation                    | `contracts.test.ts` / `FACTORY`; `todo.test.ts` / `TODO ACCESS` | Rebinding does not change existing runtimes; detached methods work; separate app state                                 |
| Discovery does not grant data access             | `auth.test.ts` / `DISCOVERY`, `AUTH`                            | Exact disclosed refs; non-owner cannot read/write; rejected mutation leaves state unchanged                            |
| Trusted caller is not public input               | `auth.test.ts` / `TRUST`; HTTP suites                           | Forged input rejected; invalid trusted context fails; credential details not returned                                  |
| Guarded Event subscription is lazy               | `auth.test.ts` / `OBSERVE`                                      | No callbacks before consumption; refusal/error produces zero subscriptions                                             |
| Domain and HTTP errors are different channels    | `http-binding.test.ts`; `go/httpbinding/http_test.go`           | HTTP status, media type, error code, Allow header and Outcome/Context                                                  |
| Missing input differs from JSON null             | Both HTTP suites                                                | No-input call succeeds only when input is omitted                                                                      |
| Hono RPC actually crosses HTTP                   | `http-binding.test.ts` / `HONO RPC`; `hono-client-types.ts`     | Health/catalog/description/invoke responses; invalid client requests rejected by compiler                              |
| Go mux owns routing semantics                    | `go/httpbinding/http_test.go`                                   | Native 404/405, Allow, real HEAD without a body, parent/custom routes and loopback invocation                          |
| Todo roles, search, versions and transitions     | `todo.test.ts`; `go/examples/todo/server_test.go`               | Role capability table; exact matching tasks; versions; rejected operations leave state/audit unchanged                 |
| Batch updates validate before mutation           | `todo.test.ts` / `TODO BULK`                                    | A bad second item changes neither task nor audit; valid batch updates each once                                        |
| Same-version concurrent updates                  | `go/examples/todo/server_test.go`                               | 24 attempts: exactly one commit, 23 conflicts, final version 2; race detector                                          |
| Go generation is usable, not just plausible text | `go/codegen/generate_test.go`                                   | All generated demo/event-only packages compile; deterministic bytes; incomplete/wrong implementations fail compilation |
| Deferred reports are not prematurely successful  | `anwa.test.ts` / `REPORTS`                                      | Controlled pending state, exact retry candidate, ordered event types and final artifact                                |

## Removed or replaced tests

- Conditional assertions such as “if the result is a failure, check its code” were
  replaced, not retained as success-shaped false positives.
- Broad `works`, `no Things`, fixed Interaction-count and “generated source is nonempty”
  checks were replaced by explicit schema restrictions, behavioral cases and compilation.
- Duplicate Calculator HTTP smoke paths were consolidated into protocol tables and one
  typed Hono network scenario. Go retains its own network integration because it is a
  distinct implementation.
- The source-regex `catch` test was removed. The AST-based architecture command is a
  maintenance policy, separate from the protocol specification.
- Timing-dependent “still pending immediately after start” checks now use an injected
  scheduler. Audit replay checks exact sequences/types, not an arbitrary minimum count.

## Limits

These suites cover the implemented experimental profile, not every possible input or
all production security/concurrency guarantees. They do not certify authentication,
durability, HTTP Event delivery, distributed locking or exactly-once execution. Tests
must not be deleted merely because they expose a regression; either fix the regression
or explicitly revise the documented contract and its examples.
