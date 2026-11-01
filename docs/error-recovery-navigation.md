# Errors, retry guidance, and next-interaction navigation

> **ANWA working design; not all fields below are implemented in v0.1.** This records a core concept that must not be lost when refining the schema. For actual v0.1 behavior see [the experimental contract](../spec/anwa-0.1.md) and [Interaction model](interaction-model.md).

## Three distinct responsibilities

| Responsibility | Where it belongs | What it says |
| --- | --- | --- |
| **Error Definition** | Public interaction schema | Exhaustive expected **domain** error codes, meanings, and optionally the structure of their details |
| **Retry Guidance** | Optional declarative defaults **and/or concrete Interaction outcome** | Whether the **same** interaction may be tried again, and under what conditions |
| **Next Interactions** | `InteractionResponse.context` after **success or failure** | Links to other resources/interactions the application chooses to expose; **options, not instructions** |

**Never equate retrying the same operation with taking a different next action.** The framework transports both pieces of information but does not select a business workflow for the agent.

## Candidate structured error definition (not yet implemented)

The current experimental manifest uses `errors: Record<Code, string>`. This is insufficient to express typed error details and static retry advice.

A candidate extension is:

```json
{
  "errors": {
    "ORDER_ALREADY_SHIPPED": {
      "description": "Cancellation is unavailable after shipment.",
      "details": {
        "type": "object",
        "properties": {
          "shipmentId": {"type": "string"}
        },
        "required": ["shipmentId"]
      },
      "retry": {"mode": "never"}
    }
  }
}
```

- The expected domain error codes must be **exhaustive** for the interaction. Undeclared application error codes become `UNEXPECTED_ERROR`.
- `description` explains the category but is **not** a machine-readable substitute for a code, type or retry rule.
- `details` is an **optional data schema**, not a mandatory list of recovery actions.
- `retry` is optional and must not fabricate certainty. Its precise schema and correspondence with per-invocation advice require separate conformance rules.
- When an error's retry policy depends on runtime state, it can be determined at invocation rather than copied into a static definition.

A static default must **never override contrary facts** from a concrete invocation; an adapter should treat inconsistencies as contract violations rather than silently picking one.

## Runtime outcome: actual attempt

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": {
        "code": "ORDER_ALREADY_SHIPPED",
        "details": {"shipmentId": "shipment-456"},
        "retry": {"mode": "never"},
        "effects": "none"
      }
    }
  },
  "context": {
    "links": [
      {"rel": "shipment", "target": {"type": "Shipment", "id": "shipment-456"}}
    ],
    "affordances": [
      {"ref": {
        "thing": {"type": "Shipment", "id": "shipment-456"},
        "kind": "property",
        "name": "tracking"
      }}
    ]
  }
}
```

This illustrates **two independent client decisions**:
1. **Don't repeat the failed cancellation**, because retry guidance says `never`.
2. **You may inspect shipment tracking**, because the application offered that Property in Context — but only if relevant to the user's delegated goal.

The example is not a framework mandate that every cancelled/shipped Order have a shipment or tracking Property.

## Retry semantics to keep separate from next steps

| Candidate retry advice | Meaning | Notes |
| --- | --- | --- |
| `never` | Repeating the same interaction is not advised for this failure | Does not forbid investigating another resource |
| `after` with duration/time | The application advises waiting before reattempting | Cannot by itself guarantee safe repetition after uncertain effects |
| `after-input-change` | Reattempt only after changing the input | Does not tell the agent which input to choose |
| `after-state-change` | Reattempt after observing an appropriate state change | Context can offer a Property to inspect; not an instruction to invoke it |
| `inspect-first` | First determine whether the prior attempt took effect | Particularly important after uncertain side effects |
| Omitted / unknown | Insufficient information to decide whether retry is appropriate | **Never** interpret as `after` or `safe` |

These are **working semantic categories** from the original research notes, not yet a standardized enumerated v0.1 `retry` schema. A later implementation should define their wire representation, optional timing data and compatibility rules.

### Effect certainty is a different axis

- `none`: the application can establish that this attempted interaction caused none of its advertised business-observable effects.
- `occurred`: it can establish that such an effect occurred (not necessarily that the entire user goal succeeded).
- `unknown`: it cannot establish the effect; a retry may duplicate it.

This field is **about the specific attempt**, unlike an Action's static `hasSideEffects` flag. `idempotent: true` is also not a universal license to retry after network loss, authorization issues or external failures.

## Next-interaction semantics

`context.links` and `context.affordances` remain available for **both success and failure**. They may be empty. The application may publish alternative operations, explanatory resources, a Property to check, or a resulting object. ANWA does not rank or automatically choose those options.

These refs are references to advertised interactions. Applicability hints are advisory and can become stale; they do **not** confer authorization. The agent selects whether to follow a ref based on the user's objective.

Avoid baking recommended next actions into `ErrorDefinition` by default: actual links/instances and relevant options depend on state, caller and outcome.

## Implementation gap in the current v0.1 profile

**Already present:** `Outcome + Context`, runtime error `retry`/effect information as optional values, structured result codes, application-selected Links and AffordanceRefs, `UNEXPECTED_ERROR` on undeclared domain failures.

**Not implemented:** structured `errors[code]` definitions with typed details; a validated, discriminated `RetryAdvice` union; runtime validation of error details / retry/effect consistency; generated error-detail types and retry-rule conformance tests.

Until those changes land, illustrative fields in this document are **design candidates**, not claims about the current running adapter.

[0.1 specification](../spec/anwa-0.1.md) · [Interaction model](interaction-model.md) · [Responsibility boundary](scope-and-boundaries.md)
