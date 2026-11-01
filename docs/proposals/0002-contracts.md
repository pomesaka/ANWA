# Proposal 0002A — Minimal Description and Interaction Contracts

> **Status: Discussion draft / not adopted** · 2026-11-01  
> Companion to [Proposal 0002: Minimal Core](0002-minimal-core.md).  
> **Scope:** What ANWA makes *expressible and interoperable*, not application-specific modeling or the wire protocol.

## Purpose and decision boundary

This paper proposes the **minimum information** an application author needs a framework to express, and a generic client needs to consume. It deliberately does **not** decide how many Things a service contains, the business workflow, how a handler obtains data, which next action is best, whether an app uses guards/state machines/queues, or which transport it deploys.

**Two contracts, four supporting responsibilities:**
- **Description Contract:** author-declared meaning, interaction signatures and discoverable references.
- **Interaction Contract:** an application's outcome plus navigational Context, supplied or selected by the application.
- **Binding:** framework mechanism to connect declared interactions to authored code.
- **Discovery:** framework mechanism to reveal descriptions and resolve references for permitted clients.

The Description/Interaction contracts are **logical types**, not necessarily distinct endpoints.

## 1. Description Contract — candidate minimum

### Normative-style language is *proposed only*

The words **required** and **optional** below describe a **candidate ANWA core**, not a released specification.

| Field/concept | Candidate | Purpose / rule |
| --- | --- | --- |
| **Reference** to a published description | **Required** | Opaque within the relevant application/connection scope; a generic client can ask Discovery for the description. No globally unique ID convention is mandated. |
| **Title/name** for the published Thing/description | **Required** | Identifies the author-described capability container; **Thing granularity is the developer's choice**. |
| **Human-readable description** | **Required candidate** | Explains purpose to a client; completeness or correctness cannot be inferred merely from its existence. |
| **Interaction entries** | **Required mechanism**, may be empty | A client can identify offered Property/Action/Event interactions when the author publishes them. A Thing may be descriptive only; whether a zero-interaction Thing is conformant remains a minor spec question. |
| **Interaction reference/name** | **Required for each published interaction** | Stable within the declared scope, usable for later description resolution/invocation. Does not require an HTTP URL. |
| **Interaction kind** | **Required for each published interaction** | Use WoT-aligned `property`, `action`, `event`. |
| **Interaction description** | **Required candidate for each published interaction** | Tells an agent what the operation means. Not an instruction to disregard client policy. |
| **Input data schema** | **Conditionally required** | If an interaction accepts typed input, describe its shape; absent means there is no input, **not** an unconstrained object. |
| **Output/event payload schema** | **Conditionally required** | If an interaction exposes typed output or payload, describe its shape; absent means no declared payload. |
| **Link descriptions** | **Optional** | Authors can describe related targets and relation types. ANWA does not invent relations or select target instances automatically. |
| **States/transitions, guards, errors, effect descriptions, authorization hints** | **Optional extensions** | Useful to some authors but should not be mandatory parts of the minimum Description. |

**WoT relationship:** this is an ANWA *semantic minimum*, **not** the JSON serialization of a conforming WoT TD. TD 1.1, for example, has its own mandatory `@context`, `title`, `security` and `securityDefinitions` requirements, and `description` is optional. A WoT adapter would have to satisfy that specification independently. [Official TD 1.1](https://www.w3.org/TR/wot-thing-description11/)

### Candidate abstract type — notation only

```ts
type Ref = string; // opaque here; resolution and authorization are separately defined
type DataSchema = unknown; // framework chooses a schema dialect later

type InteractionDescription = {
  ref: Ref;
  kind: "property" | "action" | "event";
  description: string;
  input?: DataSchema;  // omit means no input
  output?: DataSchema; // omit means no output (event payload mapping TBD)
};

type Description = {
  ref: Ref;
  title: string;
  description: string;
  interactions: InteractionDescription[];
  links?: LinkDescription[];
};
```

Neither `Ref` nor `DataSchema` is sufficiently defined to be a final implementable type; **this is a minimum-information test**. Particularly, event subscriptions may need richer payload/stream declarations in an extension.

## 2. Discovery Contract — only what those fields need

The minimal purpose of Discovery is to make a published description **retrievable** and an interaction reference **resolvable**.

- A client can acquire an entry description through a configured ANWA adapter/connection.
- A client can resolve a published interaction `ref` to its description and invoke it through the chosen binding, subject to authorization and current availability.
- A client can use the same mechanism to resolve ANWA-navigable target references returned in Context, **when the application deliberately exposes them as resolvable**.
- Missing, stale, forbidden and not-found references must have explicit failure behavior defined later.
- ANWA does **not** require intent search, a web-scale registry, ranking, directory synchronization, or automatic scanning of all resources as its minimum.

A reference can be a scoped identifier, a URI or a transport handle in a later binding. **The core must state what resolution means without prescribing an ID-generation scheme or server layout.**

## 3. Interaction Contract — candidate minimum

For every **delivered application-level** result, the proposed core envelope has:

| Field/concept | Candidate | Purpose / rule |
| --- | --- | --- |
| `outcome` | **Required** | Which application outcome occurred |
| `outcome.kind` | **Required** | `settled` in base; additional kinds (e.g. `accepted`) via extensions |
| `result.ok` | **Required if settled** | Discriminates successful operation from expected domain failure |
| `result.value` | **Required if ok** | May be `null` when a successful action has no output; distinguish from missing response |
| `result.error.code` | **Required if not ok** | Stable, machine-readable, application- or framework-defined error category; no requirement for HTTP statuses |
| `result.error.message`, `details` | **Optional** | Human-readable explanation, structured application details |
| `context` | **Required** | Shared navigation container independently of success/failure |
| `context.links` | **Required field, may be `[]`** | Application-selected related targets with typed relation |
| `context.affordances` | **Required field, may be `[]`** | Application-selected next interaction references |
| `context.subject`, `revision`, applicability, policy, retry, effects | **Optional extensions** | No single primary subject, state machine, guard or retry rule is required of every app |

### Candidate abstract type — notation only

```ts
type DomainError = {
  code: string;
  message?: string;
  details?: unknown;
};

type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

type LinkRef = {
  rel: string;
  target: Ref;
};

type AffordanceRef = {
  ref: Ref; // must point to a published interaction description when offered
};

type InteractionResponse<T, E = DomainError> = {
  outcome: { kind: "settled"; result: Result<T, E> };
  context: {
    links: LinkRef[];
    affordances: AffordanceRef[];
  };
};
```

This is intentionally **smaller than Proposal 0001**. In particular, it does *not* require `subject: ThingRef`, `revision`, `GuardDecision`, `retry`, `effects` or any actual follow-up interactions.

### Reference obligations

- An `AffordanceRef` included in Context is a **reference to a declared interaction**, not an arbitrary natural-language command; the client should be able to discover its schema or get an explicit unavailable/unauthorized outcome.
- A `LinkRef` has a meaningful `rel` and target reference. A future binding must clarify whether this points to an ANWA-resolvable description or an external resource; **do not silently promise universal dereferencing**.
- A previously available interaction may become unavailable when invoked. References and applicability hints **never authorize the action**.

## 4. Minimal scenario without states or guards

**Public Description** (illustrative JSON, not WoT TD or final ANWA wire format):

```json
{
  "ref": "service:calculator",
  "title": "Calculator",
  "description": "Performs arithmetic operations.",
  "interactions": [{
    "ref": "service:calculator/add",
    "kind": "action",
    "description": "Adds two numbers.",
    "input": {
      "type": "object",
      "properties": {
        "a": { "type": "number" },
        "b": { "type": "number" }
      },
      "required": ["a", "b"]
    },
    "output": { "type": "number" }
  }]
}
```

**Implementation:** an author binds `service:calculator/add` to any ordinary function computing a sum. ANWA does **not** require a state machine, guard, user account, database, search algorithm, or workflow engine.

**Successful Interaction Result**:

```json
{
  "outcome": { "kind": "settled", "result": { "ok": true, "value": 5 } },
  "context": { "links": [], "affordances": [] }
}
```

**Domain failure** (e.g. an application-defined request rule, not transport failure):

```json
{
  "outcome": {
    "kind": "settled",
    "result": {
      "ok": false,
      "error": { "code": "INVALID_OPERAND", "message": "One operand is not allowed." }
    }
  },
  "context": { "links": [], "affordances": [] }
}
```

**Optional navigation after either outcome:** the application can include `{"ref":"service:calculator/help"}` in `context.affordances` **if** it has published that interaction. The framework conveys that choice; it does not invent a `help` function.

## 5. Optional extensions: compatibility rule (candidate)

The same minimal contracts should be able to grow through separately versioned, **opt-in** extensions:

| Extension | Adds | Does not require of base users |
| --- | --- | --- |
| Contextual applicability | `available / blocked / unknown`, reason | A guard or automatic selection algorithm |
| Guard binding | Named guard contract, structured allow/deny result | A declarative business-rule DSL |
| State metadata | States / named transitions and possible effects | That every Thing has a state machine |
| Semantic errors | Retry advice, expected delay, side-effect uncertainty | That every handler implements retries or specific business error codes |
| Async execution | `outcome.kind = accepted` with execution reference; later settled result | Workflow persistence and durable engine for synchronous apps |
| Observation | Event/subscription description, snapshot and delta semantics | One stream transport or replay guarantee |
| Protocol bindings | WoT TD, MCP, GraphQL, RPC, etc. | One canonical wire protocol for every application |

How clients negotiate extensions, detect support and handle unknown fields/kinds is a **framework-level interoperability decision still open**. A base client should not silently treat `accepted` as a settled success.

## 6. Minimal conformance-style tests (proposal)

These are **acceptance criteria for ANWA tooling**, not requirements on an app's domain:

| Test | Expected framework capability |
| --- | --- |
| Describe | Publish one Thing-like description with one Action, its meaning and schemas |
| Bind | Register a normal function and reject missing or mismatched bindings where statically checkable |
| Discover | Resolve an advertised interaction reference into its description, or an explicit inaccessible/not-found outcome |
| Success | Marshal a valid `settled/ok` response with Context present and empty arrays accepted |
| Domain error | Marshal a `settled/error` response with machine-readable `code` and Context |
| Follow-up | Allow author to return an existing declared interaction reference in Context and discover it |
| Non-prescriptive | Support an app with **no guards, state machine, streaming or persistent per-object Thing** |
| Transport boundary | Do not claim that broken network connections can deliver a Result |
| Safety boundary | Do not interpret server-authored descriptions/next-step hints as authority overriding client/user policy |

No claim is made that these tests have been implemented or passed.

## 7. Actual decisions remaining

Before considering this a real **v0.1 spec** we must still settle:

1. What makes a `Ref` resolvable, what an unavailable reference means, and how to scope it.
2. Which schema dialect and validation semantics to use (if any); `DataSchema=unknown` is not enough for interoperability.
3. Whether `description` is required and what "machine understandable" can realistically promise.
4. Whether to require `context.links` and `context.affordances` as present arrays or permit omission/defaults in bindings.
5. How to define extensibility/version negotiation, including `accepted` as an optional outcome.
6. WoT conformance / translation boundaries and how existing auth metadata is projected.
7. The minimum binding API and which mismatch checks are guaranteed.

**Not our decisions:** how Orders are modeled, what states exist, which guard conditions to implement, which links to return, and which backend/transport an app deploys.

## Primary sources and context

- [W3C WoT Thing Description 1.1 (Recommendation)](https://www.w3.org/TR/wot-thing-description11/) — Thing / Interaction Affordances / DataSchema / Forms / required TD fields
- [OpenAPI Specification](https://spec.openapis.org/oas/) — API description and typed interfaces
- [RFC 8288 — Web Linking](https://www.rfc-editor.org/info/rfc8288) — relation semantics
- [Hydra Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/) — hypermedia operations

[Proposal 0002](0002-minimal-core.md) · [Responsibility boundaries](../scope-and-boundaries.md) · [Working glossary](../glossary.md) · [Interaction research](../interaction-model.md)
