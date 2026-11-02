# Functional core and explicit runtime boundaries

## Authoring API migration

The TypeScript implementation has no authored class declarations or receiver-dependent methods.
This changes the in-process authoring API; it does not change `anwa.json`, HTTP envelopes,
Go's `http.Handler` binding, generated schema literals, or InteractionRefs.

```ts
import { createAnwaApp } from "../src/anwa.ts";

const definition = createAnwaApp(schema);
const app = definition.bind(handlers, options);
const { interact } = app; // Ordinary closure; no receiver binding is required.
```

`bind` **returns a new runtime**. Ignoring its return value no longer configures the
original value. Two runtimes built from the same definition have independent binding
maps and policies. Runtime API objects and copied Guard registries are frozen; application
business data is not globally frozen or claimed to be immutable.

`ObservationDenied` is a structural Error type, not a subclass. Use
`isObservationDenied(error)` and inspect `error.code`; construct it with
`observationDenied(code)`. The public event rejection codes remain unchanged.

The Todo demo uses `createTodoState()` and `createTodoLogic()` factories. Each factory
owns its maps through a closure. This is still an in-memory mutable demo, not a persistent
transaction store. Named snapshot/search/validation functions do not depend on a receiver.

## Validate, decide, then perform effects

- `src/runtime/validation.ts` holds pure payload, Guard decision, Outcome and Context
  validation. Invalid application contracts return tagged `ContractViolation` Results
  instead of throwing for ordinary validation branches.
- `src/anwa.ts` owns binding and dispatch. Guard evaluation is one step, allowed/refused
  dispatch is an exhaustive decision, and response validation is a separate step.
  Application callbacks are the exception/rejection boundary. Malformed output cannot
  escape as a success or leak a private continuation.
- Startup schema/binding errors and misuse of the trusted in-process API still fail fast.
  Neither `neverthrow` nor pattern matching can make arbitrary application callbacks pure.
- Schema validation uses separate object/required/definition/error-map checks rather
  than nested `if/else` trees. The Todo sort policy is a named exhaustive decision;
  its urgency thresholds are data rather than a nested ternary expression.
- Reports accept an optional scheduler (`wait`) so tests can hold an execution pending,
  then release it explicitly instead of racing real timers.

Small guard clauses remain preferable to a large abstraction for simple conditions.
No effect library, custom dependency container or new server/router abstraction was added.

## Maintainability policy versus behavioral specifications

`bun run architecture:check` parses authored TypeScript with the TypeScript compiler API.
It rejects class declarations, `this`, and `catch` clauses, and limits production
conditional nesting to two levels within each function. It ignores words in comments
and string literals; cleanup-only `try/finally` is allowed. Standard-library and external
constructors such as `Map`, `Error` and Hono remain valid.

This structural policy is a **CI maintenance check**, not a claim that source spelling
proves ANWA behavior. The behavioral specifications live in [the test index](../test/README.md).
