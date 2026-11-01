# WoT error handling: what is standardized, and what remains open

> **Research note · 2026-11-01**. Primary sources only. Some features described here are in the **WoT Profiles Working Draft**, not a W3C Recommendation.

## Summary

WoT separates **declaring an interaction** (Thing Description) from **executing it** (a protocol binding / runtime). Error handling is likewise split across specifications:

1. **Thing Description 1.1 (Recommendation):** declares alternative expected responses with `Form.additionalResponses`, `AdditionalExpectedResponse.success`, and optional `schema`.
2. **WoT Profiles (Working Draft):** standardizes a subset of **HTTP** error status responses and Problem Details bodies, as well as asynchronous Action status/error responses.
3. **Scripting API (Group Note):** represents exceptions in scripts and delegates translation to protocol bindings; it explicitly notes that consistent standardized exception-to-protocol mapping is **unfinished**.

**What is not established by these sources:** a universal, protocol-independent business-error taxonomy or a machine-readable standard procedure for an agent to recover from each error.

## 1. Description-time: `additionalResponses` in TD 1.1

`Form.additionalResponses` is an optional list of `AdditionalExpectedResponse` objects. An additional response may be successful or erroneous, with `success: false` as the default. A `schema` field can reference a data schema distinct from a normal action output; a `contentType` can describe a different response representation.

The TD 1.1 specification gives a **startEngine** example: an operation can fail under cold, hot, or maintenance conditions, yielding a separately described error payload. The specification requires that different expected responses be distinguishable from the primary response by content type or protocol-specific mechanisms such as status codes.

**Important limits:**
- This describes the *shape* of an alternative response, not a guaranteed result.
- This does not introduce a standard `retryable`, `recoverWith`, or `availableNow` term.
- A payload-specific `reason` field can be modelled, but its business-specific reason values are **application-defined**, not standardized by WoT.
- Real authorization/state validation still occurs when executing the action.

Primary source: [TD 1.1 §5.3.4.2.2, §5.3.4.4, §6.3.9.4](https://www.w3.org/TR/wot-thing-description11/#additionalresponses).

## 2. Execution-time: HTTP Profiles' error response rules (Working Draft)

The [WoT Profiles Working Draft](https://www.w3.org/TR/wot-profile/#errors) specifies for **its HTTP profiles**:

- When an operation is unsuccessful, return an HTTP error status.
- Recommended errors: `400`, `401`, `403`, `404`, `500`, `503`. Other valid HTTP error codes are allowed; consumers can interpret unfamiliar codes generically.
- **If an error body exists**, that body **must conform to Problem Details**. The draft references RFC 7807, which was superseded by [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) in 2023.

Example of a **proposed business-application response**, not an official WoT error code:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://example.com/problems/order-already-shipped",
  "title": "Order cannot be cancelled",
  "status": 409,
  "detail": "Shipment has already been dispatched.",
  "orderId": "123"
}
```

Problem Details identifies an error category and optionally includes human-readable explanation and extension members. It does **not** tell an AI the next safe action by itself. A status `409` is a possible domain decision, **not specifically recommended by the WoT Profiles draft**.

## 3. Long-running actions: ActionStatus (Profiles Working Draft)

For the HTTP Basic Profile, an initial Action invocation may be synchronous, asynchronous, or an immediate error. For asynchronous Actions, an `ActionStatus` resource can report:

- `pending`, `running`, `completed`, or `failed`
- `output` after completion
- `error` after failure, serialized as Problem Details
- an `href` that can be used for subsequent `queryaction` and possibly `cancelaction`.

This distinguishes:
- **Request acceptance** (an asynchronous action has started or been accepted)
- **Task completion/failure** (it later reaches `completed` or `failed`)

In the draft HTTP Basic Profile, a long-running action may initially return `201` with a Location for its status object. The existence, timing, and retention of completed ActionStatus objects are implementation-dependent within the described constraints.

Primary source: [WoT Profiles §6.2.2](https://www.w3.org/TR/wot-profile/#actions).

## 4. Scripting API exception mapping is explicitly open

The 2023 [Scripting API Group Note §7.4](https://www.w3.org/TR/wot-scripting-api/#error-handling) states that errors seen by application scripts are mapped and encapsulated by protocol bindings. Its editor's note says a **standardized error mapping is needed** for consistent script↔protocol conversion; current mapping is encapsulated by individual implementations.

The note elsewhere uses exceptions including `SecurityError`, `NotFoundError`, `NotAllowedError`, and `NotSupportedError`. These are **runtime-level exception concepts**, not the same as a standardized business error vocabulary.

## 5. Failure categories and coverage

| Failure category | WoT facility | Remaining consideration for ANWA |
| --- | --- | --- |
| Invalid input/schema | TD DataSchema + protocol error | Useful field-specific correction hints are not standardized by the reviewed texts |
| Authentication/authorization | SecurityScheme metadata + HTTP 401/403 where applicable | Authorization and human approval must be enforced by the service |
| State conflict (already shipped) | Additional response schema + domain-specific code/body | Whether to rediscover state or change plan remains a client decision |
| Transient network/server failure | Protocol error (HTTP 5xx, timeouts, etc.) | Retry safety must not be inferred from status alone |
| Non-idempotent Action | `idempotent` metadata on ActionAffordance | Duplicate prevention and safe retries remain application concerns |
| Asynchronous Action failure | Profiles `ActionStatus.failed` + `error` | Need a clear next step and outcome verification policy |
| Unsupported operation | Binding/runtime error | Alternative interactions and fallback behavior are not universally defined |

## 6. ANWA design/research implications (NOT WoT features)

A useful experiment: provide the same failed cancellation both as (a) plain HTTP/Problem Details and (b) a structured response **plus linked follow-up affordances**. Measure whether the agent recovers correctly without more wrong calls.

**Potential extensions to investigate, not yet adopt:**
- stable typed **domain error codes** and preconditions
- a **recoverability** hint (retryable? requires updated state? human intervention?)
- machine-readable links to **related interactions** that may resolve the error
- explicit **side-effect uncertainty** after timeouts (to prevent duplicate submissions)
- error schema versioning and provenance/trust of descriptions.

Do not encode imperative instructions from untrusted servers as privileged directions to the Agent. Recovery hints must remain *data for planning*, not a replacement for permission checks.

## Sources (official)

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [W3C WoT Profiles — 2025 Working Draft](https://www.w3.org/TR/wot-profile/)
- [W3C WoT Scripting API — 2023 Group Note](https://www.w3.org/TR/wot-scripting-api/)
- [IETF RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [W3C WoT Discovery](https://www.w3.org/TR/wot-discovery/)

[Glossary](../glossary.md) · [WoT research](wot.md) · [ANWA README](../../README.md)
