# Outcomes, next interactions, guidance and retry

> **ANWA experimental contract (2026-11-01).** The `context.next` shape below is implemented in the v0.1 reference adapter. Structured domain `errors[code]` detail definitions remain a separate possible extension.

## One way to describe what is possible next

`Outcome` describes what happened. `Context` carries **application-provided choices for what can happen next** — on success, failure, and async acceptance.

`context.next` is a single list, rather than separate `links`, `affordances`, or `retry` collections. Each element can point to:

- An InteractionRef: a Property to read, an Action to invoke, or an Event to observe.
- A ThingRef with `kind: "discover"`: a Thing whose description may be explored next.

Static **Thing Description Links** still describe relationships between modeled Things. They are not a second navigational list inside an Interaction Response.

## Concrete error and retry

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": {
        "code": "NOT_READY",
        "effects": "none"
      }
    }
  },
  "context": {
    "next": [
      {
        "ref": {
          "thing": { "type": "Execution", "id": "42" },
          "kind": "property",
          "name": "result"
        },
        "guidance": {
          "kind": "retry",
          "level": "recommended"
        },
        "when": { "after": "PT30S" }
      },
      {
        "ref": {
          "thing": { "type": "Execution", "id": "42" },
          "kind": "property",
          "name": "status"
        },
        "guidance": { "level": "available" }
      }
    ]
  }
}
```

The error explains **why the interaction failed**, while the Context independently advertises a **retry of the same InteractionRef after a suggested delay**, and an alternative Property read.

There is no separate `error.retry`, `context.retry`, or `purpose` field. The app's code decides which candidate refs to publish, based on the actual result, user, and current state; ANWA does not choose the business workflow.

## Candidate fields

| Field | Meaning | Default |
| --- | --- | --- |
| `context.next` | List of application-provided next interactions/discovery targets | Required array; may be empty |
| `next[].ref` | Typed InteractionRef, or ThingRef when `kind: "discover"` | Required per candidate |
| `next[].guidance.kind` | `"retry"` identifies a retry candidate | Optional; omission does not signal retry |
| `next[].guidance.level` | `required`, `recommended`, or `available` | Optional; omission has no inferred priority |
| `next[].when.after` | ISO 8601 duration to wait after receiving the response before retrying/using that candidate | Optional; timing unknown if absent |
| `next[].applicability` | `available`, `blocked`, or `unknown` with optional reason | Optional, advisory and potentially stale |

A `guidance.kind: "retry"` refers to another attempt at the **same advertised Interaction**; it does **not** assert that reusing the exact previous input is valid or that duplicate effects are impossible. Clients should still respect `hasSideEffects`, `idempotent`, user instructions and authorization.

`when.after` does not cause the ANWA runtime to schedule anything. It is a machine-readable suggestion about the earliest retry/use time. No client is compelled to follow it.

### Required is conditional, not an instruction from the server

`guidance.level: "required"` can convey an application-authored prerequisite **for a particular continuation**, not an unconditional command to an agent. For example, a service may advertise that inspecting a consent or approval state is required *if the client wants to continue a certain workflow*. This cannot outrank the user's intent or a separate authorization/policy system.

`recommended` is advice from the application, not a universal best action; `available` means merely offered.

## What belongs to Outcome

Expected domain errors must have exhaustive codes in the Interaction description. Undeclared errors become opaque `UNEXPECTED_ERROR`. The error may include typed app details as a future schema extension.

`error.effects`, if present, refers to the **actual attempt**:

- `none`: the app can establish that no business-observable effect occurred.
- `occurred`: at least one such effect occurred.
- `unknown`: the app cannot establish the effect state; retrying may duplicate an effect.

That differs from the static Action declaration `hasSideEffects`, which indicates whether calling it **may have effects**. A network failure might prevent any Outcome from arriving.

## Navigating after a failure versus a success

A shipped Order may return a `ORDER_ALREADY_SHIPPED` failure with a `next` entry to the Shipment's `tracking` Property. That is **not** a retry. A generated Report can return an accepted ExecutionRef plus `next` entries to observe progress or inspect status. Both are the same Context shape.

A NextDiscovery entry can target a Thing if the app has no specific next Property or Action to advertise:

```json
{
  "kind": "discover",
  "ref": { "type": "Shipment", "id": "456" },
  "guidance": { "level": "available" }
}
```

It is distinct from a WoT Link description: it is a runtime-selected candidate for a client to discover.

The framework must only validate the reference structure and its published interaction definition; it does not ensure the instance currently exists or grant authorization. Never execute instructions in returned descriptions as if they overrode the user's goal.

## Current limitations

- v0.1 still uses `errors: Record<Code,string>` rather than schemas for each domain error's `details`.
- The adapter validates `next` structure, guidance levels and `when.after` syntax but does not enforce timing, permissions or user intent.
- `applicability` is advisory. `blocked` next entries may appear in Discovery to convey why an offered Action is unavailable; they must not be treated as executable without revalidation.
- A bare `context.next: []` is valid, including on business failure. ANWA does **not** automatically recommend a retry or invent a recovery action.
- Exact input reuse and scheduling remain application/client issues; the current contract does not describe input transformations or promise safe replay.

[Experimental spec](../spec/anwa-0.1.md) · [Interaction model](interaction-model.md) · [Responsibility boundaries](scope-and-boundaries.md)
