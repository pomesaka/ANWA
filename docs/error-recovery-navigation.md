# Error outcomes, retry and next Interaction choices

> Active ANWA v0.2 design. These are application-supplied **candidates**, not instructions to the agent. [Executable spec](../spec/anwa-0.2.md).

## Outcome is what happened; Context is what can come next

Error code and optional `effects` describe **why an invocation failed** and whether this attempt made business-observable changes. `context.next` is the single list of application-offered next Interactions, whether the previous result was success, failure or async acceptance.

```json
{
  "outcome": {
    "kind":"settled",
    "result":{"ok":false,"error":{"code":"NOT_READY","effects":"none"}}
  },
  "context":{
    "next":[
      {
        "ref":"execution.result",
        "input":{"executionId":"42"},
        "guidance":{"kind":"retry","level":"recommended"},
        "when":{"after":"PT30S"}
      },
      {
        "ref":"execution.status",
        "input":{"executionId":"42"},
        "guidance":{"level":"available"}
      }
    ]
  }
}
```

No `error.retry`, `context.retry`, `context.links`, or `context.affordances` exists in the active profile. Retry is the **same InteractionRef** in `next`; the runtime validates that relationship. A different next candidate may be another Query, Action or Event, with optional input values filled by the application.

## Metadata semantics

- `guidance.kind:"retry"`: a proposed repeat of the same Interaction; **not** an automatic retry, same-input mandate or safety guarantee.
- `guidance.level`: `required` (conditional to a particular continuation), `recommended`, or `available`. None overrides the user's goal.
- `when.after`: an advisory ISO 8601 wait duration; runtime does not schedule actions.
- `applicability`: application-supplied `available` / `blocked` / `unknown`; it can become stale and is not authorization.
- `input`: optional bound input values. If an Interaction requires input and none is supplied, the client must provide valid input before invocation.

`error.effects` concerns this particular attempt:
`none`, `occurred`, `unknown`. It is distinct from the static Action property `hasSideEffects`.

Expected domain error codes must be exhaustively declared in the Interaction definition. Undeclared domain error codes become opaque `UNEXPECTED_ERROR`. The current schema uses `errors: Record<Code, string>`; typed details for each error category are future work.

**Context never chooses the best business workflow for the agent.** It conveys the choices selected by application code, and may be empty. A client must still decide based on its user's delegated objective.

[Interaction contract](interaction-model.md) · [v0.2 spec](../spec/anwa-0.2.md)
