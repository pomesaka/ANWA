# Working glossary

> Provisional project terminology. These definitions should not be mistaken for normative definitions from GraphQL, MCP, A2A, or W3C WoT.

| Term | Meaning in ANWA (working definition) | Important boundary |
| --- | --- | --- |
| **Application** | A system exposing meaningful domain state and behavior | Not synonymous with a website or UI |
| **Agent** | A software client acting under delegated goals and constraints | Does not imply independent legal or payment authority |
| **Resource** | An identifiable domain object or state representation | Not necessarily a database row or MCP Resource |
| **Semantics** | Meaning, purpose, and constraints of a domain concept or operation | A description is not a verified formal guarantee |
| **Relation** | A typed, meaningful connection among domain concepts or resources | More than a generic URL or database foreign key |
| **Capability** | A generally defined ability, such as read, cancel, or observe | Its existence does not imply it is currently usable |
| **Affordance** | A context-sensitive hint connecting a resource/situation to a possible interaction | Not an authorization grant or promise of success |
| **Discovery** | Identifying domain meanings, relationships, capabilities, and contextual hints | Not only internet-scale service search |
| **Interaction** | Reading, invoking, or observing actual application state and behavior | Broader than data retrieval alone |
| **Schema** | A machine-readable description of types and structural constraints | Insufficient by itself to express all business semantics |
| **Intent** | An outcome desired by the user or calling agent | Not necessarily a concrete RPC method |
| **Execution contract** | Candidate abstraction for inputs, effects, preconditions, retry behavior, and safety | Not a defined ANWA specification yet |
| **Protocol adapter** | Mapping the application model to an interface such as MCP or GraphQL | May lose or require extension of semantics |
| **Presentation** | A human-facing representation of application information | Optional, not the source of truth |

## Crucial distinctions

### Capability vs. affordance vs. authorization

- The service defines `cancelOrder` → **Capability**.
- The service indicates that order 123 may currently be canceled → **Affordance**.
- The server checks permissions, state, and preconditions and processes the request → **Authorization and execution**.

The availability hint may become stale between discovery and invocation.

### Semantics vs. schema vs. state

- `status: string` → **Schema**.
- “Status describes the order's fulfillment lifecycle” → **Semantics**.
- `status = shipped` → **State**.
- “Cancellation is not presently offered” → **Contextual affordance**.

### Relation vs. affordance

- `order → shipment` → A **Relation** to another domain resource.
- `order → cancelOrder` → An **Affordance** for interaction with a capability.

## Relationship to existing vocabularies

The terms **Affordance**, **Property**, **Action**, **Event**, and **Protocol Binding** have established usage in the [W3C WoT Thing Description](https://www.w3.org/TR/wot-thing-description11/). MCP has its own [Tools and Resources](https://modelcontextprotocol.io/specification/2025-11-25). GraphQL has its own [Query / Mutation and Type System](https://spec.graphql.org/September2025/). ANWA currently borrows some everyday terms but has **not adopted those standards' exact semantics**.

[Back to README](../README.md) · [Vision](vision.md) · [Open questions](open-questions.md)
