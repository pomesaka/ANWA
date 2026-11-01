# Working glossary — WoT-aligned

> **Status:** Provisional vocabulary · 2026-11-01. Use W3C WoT terminology as the **reference vocabulary** until there is a demonstrated reason to diverge. ANWA is not yet a WoT-compliant framework, and a shared label does not imply a new standard.
>
> **Normative baseline:** [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) (Recommendation), [WoT Discovery](https://www.w3.org/TR/wot-discovery/) (Recommendation). [WoT Profiles](https://www.w3.org/TR/wot-profile/) is a **Working Draft**; [WoT Scripting API](https://www.w3.org/TR/wot-scripting-api/) is a **Group Note**.

## 1. W3C WoT terms to prefer

These are **WoT vocabulary**; descriptions below paraphrase its specifications rather than introducing ANWA-specific meanings.

| WoT term | Definition and role | Example in a business application |
| --- | --- | --- |
| **Thing** | Abstraction of a physical **or virtual** entity whose interactions can be described | An order, account, or inventory service (possible modelling choice, not a prescribed mapping) |
| **Thing Description (TD)** | Machine-readable metadata and interaction description for a specific Thing | The interface description of an order |
| **Thing Model (TM)** | Reusable abstract description of common Thing properties, actions and events | A reusable order-like domain model |
| **Interaction Affordance** | An abstract description of an interaction offered by a Thing | Reading an order's status or invoking cancellation |
| **PropertyAffordance** | An interaction for reading, writing, or observing a Property | `status`, `shipmentState` |
| **ActionAffordance** | An interaction for invoking an Action with possible inputs and outputs | `cancelOrder`, `requestRefund` |
| **EventAffordance** | An interaction for subscribing to notifications about Events | `orderShipped`, `paymentFailed` |
| **DataSchema** | Data structure and constraints, used for inputs, outputs, and Property data | Cancellation input schema |
| **Form** | Concrete information for performing an interaction, e.g., target, operation, content type, protocol metadata | HTTP binding for `invokeaction` |
| **Protocol Binding** | How a WoT interaction is mapped to a specific protocol | HTTP, CoAP, MQTT binding |
| **Link** | Typed link to another resource or description, optionally identifying a relation | `order → shipment` when modelled as a link |
| **Semantic annotation** | Domain-specific meaning using vocabulary terms and JSON-LD context (e.g. `@type`) | An external vocabulary class for an order |
| **SecurityScheme / securityDefinitions** | Declaration of security mechanisms required for interaction | OAuth/Bearer mechanism metadata |

The terms **Thing**, **Affordance**, **Form**, and **Link** do not by themselves certify that an agent understands the business meaning or has permission to execute an action. See [TD 1.1](https://www.w3.org/TR/wot-thing-description11/).

## 2. Discovery vocabulary

WoT Discovery specifies two phases (these terms are established in the [Discovery Recommendation](https://www.w3.org/TR/wot-discovery/)):

| Term | WoT meaning |
| --- | --- |
| **Introduction** | Find candidate exploration endpoints, while limiting premature disclosure of Thing metadata |
| **Exploration** | Obtain Thing Descriptions from TD Servers or TD Directories, subject to authorization |
| **Thing Description Directory (TDD)** | Service exposing registration, retrieval, listing and search of Thing Descriptions |
| **Consumer / Exposed Thing** | Client consuming, or software exposing, Thing interactions (see WoT Architecture and Scripting API context) |

**ANWA research distinction:** finding a TD and incrementally exploring relevant **domain relationships/operations** during a task are not identical. Both may be needed; ANWA has not decided how to map them.

## 3. Errors and asynchronous operations

| Term | Source and meaning | Status |
| --- | --- | --- |
| **ExpectedResponse** | Primary expected response metadata for a Form | TD 1.1 Recommendation |
| **AdditionalExpectedResponse** | Metadata for an additional response, possibly an error; `success: false` is the default and `schema` can describe its payload | TD 1.1 Recommendation |
| **`additionalResponses`** | Optional `Form` member listing additional expected responses (including errors) | TD 1.1 Recommendation |
| **HTTP error response** | Protocol-level failure, such as 400/401/403/404/500/503 in the HTTP profile | WoT Profiles Working Draft |
| **Problem Details** | Structured HTTP error body required in the draft WoT HTTP Profile if an error body is present; the draft cites RFC 7807 (superseded by RFC 9457) | WoT Profiles Working Draft |
| **ActionStatus** | Status object for an asynchronous action: `pending`, `running`, `completed`, `failed`; can include an `error` object | WoT Profiles Working Draft |
| **Protocol error mapping** | Translation from runtime exceptions to transport errors and back | Scripting API Group Note; standardized mapping explicitly left open |

See the detailed [WoT error handling research](research/wot-errors.md) and [WoT Profiles](https://www.w3.org/TR/wot-profile/).

## 4. ANWA terminology retained as *non-WoT* research terms

These terms help discuss ANWA's goals, but are **not normative WoT terms** and should not be presented as part of the WoT core vocabulary.

| ANWA working term | Meaning | WoT connection / boundary |
| --- | --- | --- |
| **Agent** | Software acting under delegated goals and limits | A kind of Consumer; no autonomous legal authority implied |
| **Application** | Domain state and behavior offered as software interactions | Could expose one or several Things |
| **Resource** | Broad shorthand for a domain object or state | Prefer `Thing` when WoT meaning is intended; do not conflate with MCP Resource |
| **Capability** | Informal shorthand for an ability | Prefer Property/Action/Event **Interaction Affordance** when speaking of WoT |
| **Semantics** | Business-level meaning of concepts and operations | WoT `description`, `@type`, semantic vocabulary; natural language alone is not formal validation |
| **Relation** | Meaningful connection between concepts | Prefer WoT `Link` when there is a concrete link |
| **Contextual availability** | Whether an interaction appears applicable to a specific user, Thing state, and time | **Not the WoT definition of Affordance**; a separate ANWA research requirement |
| **Intent-oriented discovery** | Finding relevant interactions and data for a caller's goal | Not the same thing as WoT Discovery's Introduction / Exploration |
| **Execution contract** | Proposed collection of effects, preconditions, approval, replay/idempotency and failure expectations | Related to DataSchema, ActionAffordance and AdditionalExpectedResponse; not a WoT-defined object |
| **Presentation** | Optional UI generated or provided to humans | Not the primary interaction model; WoT may link to UI via `Link` |

## 4a. ANWA working terminology — schema and runtime

**The following terms are ANWA design vocabulary, not W3C WoT-defined constructs.** They describe our current schema-first development model, but their exact interfaces have not been standardized.

| Term | Working meaning | Responsibility boundary |
| --- | --- | --- |
| **Public schema / ANWA Schema** | Machine-readable top-level Interaction declarations with input/output/errors, plus optional Thing metadata | Defines what the application exposes, **not** executable business logic; current v0.2 is experimental |
| **Implementation / Handler / Resolver** | Ordinary application code implementing Actions, Property reads, Link resolution and effects | Actual business logic and access checks |
| **State / Transition** | Named domain state and a potentially valid change under a specified trigger | Declared possible transitions do not automatically guarantee atomic enforcement |
| **Guard / Guard reference** | Named check referenced by the schema; evaluated by application code | May return structured allow/deny and reason; not a YAML predicate language |
| **Guard decision** | Runtime result of evaluating a guard, potentially including a reason and navigational hints | Must be policy-filtered, can become stale, does not eliminate server-side revalidation |
| **Interaction Response** | Proposed ANWA application-level envelope with Outcome and Context | **Not** a WoT standard response type and not yet a fixed wire format |
| **Outcome / Result** | Settled operation success or domain failure; an accepted execution may instead be returned | `ok` indicates the invocation outcome, not necessarily achievement of a larger business goal |
| **Interaction Context** | Application-supplied `next` entries referencing top-level InteractionRef strings, optionally with bound input, guidance, wait time and applicability | Required `next` list may be empty; candidates are not privileged instructions |
| **Contextual applicability** | `available / blocked / unknown` hint for a particular caller, Thing and moment | **Distinct** from a WoT Interaction Affordance and from authorization |
| **Next-interaction guidance** | Optional `guidance.kind: retry`, importance `required/recommended/available`, and `when.after` ISO 8601 duration on a `context.next` entry | Retry is the same interaction offered again, not a separate error retry property; hints are advisory |
| **Execution** | Identifiable instance of an in-progress or completed invocation, with its own lifecycle | Not the same as business domain state; may be modeled as a Thing |
| **Interaction Event / Observation** | State changes, progress reports, or artifact deltas sent to consumers | Streaming is not itself durable execution or an authoritative state store |

For a concrete end-to-end example, see [Order cancellation](examples/order-cancellation.md). The working conceptual model is in [Architecture](architecture.md) and [Interaction model](interaction-model.md).

### Correction to earlier ANWA usage

We previously defined **Affordance** as a *context-dependent available action*. That was **narrower than WoT's actual Interaction Affordance**: a WoT Affordance describes an **offered interaction**, not a standardized per-user `availableNow` authorization judgment.

Use **Interaction Affordance** for the WoT concept, **contextual availability / applicability** for the dynamic state-specific hint, and **authorization / enforcement** for the actual server-side decision. A cancelled or shipped order may still have a `cancelOrder` ActionAffordance in its TD even if invoking it fails.

### Capability ≠ Action

A previously used generic **Capability** may map to *reading a Property*, *invoking an Action*, or *subscribing to an Event*. It should not silently be reduced to WoT Action.

## 5. What remains open

The **schema-first workflow and code-implemented Guard** are current design directions, not a decision about the precise schema syntax. In particular, declarative states/transitions are *descriptions of the contract* and cannot generally replace the handler's transactional logic.

See [Current decision status](decisions.md).


- **Application choice, not a pending ANWA decision:** whether each business entity is a Thing or a service exposes several entities as Properties, Actions and Links. ANWA should provide a usable mechanism for chosen arrangements.
- How should TDs evolve with user permissions and per-instance state, without leaking privileged metadata?
- How should a Consumer discover domain data beyond the TD Directory's discovery function?
- Do additionalResponses and HTTP Problem Details sufficiently describe recoverable **domain errors**, or is an extension needed for suggested next steps?
- How can error recovery guidance remain advisory, auditable, and secure rather than letting server-provided text issue unsafe instructions to the Agent?

## Primary sources

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/)
- [W3C WoT Discovery](https://www.w3.org/TR/wot-discovery/)
- [W3C WoT Architecture 1.1](https://www.w3.org/TR/wot-architecture11/)
- [WoT Profiles — Working Draft](https://www.w3.org/TR/wot-profile/)
- [WoT Scripting API — Group Note](https://www.w3.org/TR/wot-scripting-api/)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)

[Back to README](../README.md) · [Scope](scope-and-boundaries.md) · [WoT errors](research/wot-errors.md) · [Open questions](open-questions.md)
