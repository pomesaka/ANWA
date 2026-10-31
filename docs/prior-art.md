# Prior art and official references

> Initial landscape, 2026-11-01. Primary specifications only; no claim of comprehensive prior-art review.

Much of the proposed behavior predates AI agents. Hypermedia in particular already asks clients to discover valid next transitions from server-provided representations. ANWA should be compared seriously against existing standards, not assume a new protocol is required.

| Standard / project | Primary source | Connection to ANWA | Open distinction |
| --- | --- | --- | --- |
| Web Linking | [IETF RFC 8288](https://www.rfc-editor.org/info/rfc8288) | Link relation types and typed relationships | Should ANWA reuse common relation types? |
| Hydra | [Hydra Core Vocabulary](https://www.hydra-cg.com/spec/latest/core/) | Operations, API documentation, hypermedia controls | What additional support does an AI-oriented authoring framework provide? |
| W3C WoT | [Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) | Properties, Actions, Events, Interaction Affordances, forms, protocol bindings | Can its domain-neutral mechanisms be reused for general business apps? |
| GraphQL | [September 2025 specification](https://spec.graphql.org/September2025/) | Typed schema, descriptions, introspection, queries/mutations | How to expose instance-specific affordances independent of a GraphQL binding? |
| MCP | [2025-11-25 specification](https://modelcontextprotocol.io/specification/2025-11-25) | Tools, Resources, interoperable agent-facing exposure | How to retain domain relationships and affordances across adapters? |
| A2A | [Protocol specification](https://a2a-protocol.org/latest/specification/) | Agent discovery and asynchronous task execution | Where does an app-level model stop and agent-to-agent coordination begin? |

## Notes on scope and status

- **Hydra:** The Hydra Core Vocabulary is a community specification and work in progress, not a W3C Recommendation. It explicitly describes supported operations and even permission-dependent links.
- **WoT:** W3C Thing Description 1.1 is a Recommendation. The model includes virtual entities and action affordances that can abstract RPC-style calls—not exclusively physical devices.
- **GraphQL:** Introspection provides schema structure and descriptions; policies and state-sensitive behavior still belong to the application's implementation and model.
- **MCP:** A connection protocol for tools and resources. ANWA may generate MCP exposure; that does not make ANWA a replacement for MCP.
- **A2A:** Concerned with agent-to-agent interaction, capabilities, and task lifecycle rather than necessarily modeling every business resource.

## Hypothesized contribution to test

The possible novel contribution lies in **developer experience and an agent-oriented application model** that joins progressive exploration, semantics, relations, capabilities, contextual affordances, and execution adapters.

Nothing in these notes establishes novelty, feasibility, performance, or superiority. Those require both a more thorough review of existing implementations and controlled experiments.

[Back to README](../README.md) · [Open questions](open-questions.md)
