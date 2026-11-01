# Prior art and official references

> Research index · updated 2026-11-01. This is not a comprehensive novelty review. **Primary specifications and official project material** are preferred.

ANWA does not claim that navigable responses, machine-readable operation descriptions, or workflow state machines are new ideas. The research question is whether a **schema-first, agent-oriented authoring framework** can combine these ideas coherently, while improving unknown-application discovery and interaction reliability.

## Existing ideas ANWA should reuse or challenge

| Work | Provides / describes | ANWA research question | Primary source |
| --- | --- | --- | --- |
| REST / Web Linking | Typed link relations, hypermedia-driven navigation | Can Context/Links reuse existing link semantics? | [RFC 8288](https://www.rfc-editor.org/info/rfc8288) |
| Hydra | Links, operations and semantic API descriptions for generic clients | What does an agent-focused developer workflow add beyond Hydra? | [Hydra Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/) |
| W3C WoT TD 1.1 | Things, Properties, Actions, Events, Interaction Affordances, Forms and Protocol Bindings | Can the base vocabulary / Thing Model be directly reused? | [TD 1.1](https://www.w3.org/TR/wot-thing-description11/) |
| W3C WoT Discovery | Introduction, Exploration, TD servers/directories | How does directory discovery relate to stepwise domain navigation? | [WoT Discovery](https://www.w3.org/TR/wot-discovery/) |
| W3C WoT Profiles | Async ActionStatus and HTTP error/observation conventions | Can Execution and Observation adapt cleanly to Profiles? | [Profiles Working Draft](https://www.w3.org/TR/wot-profile/) |
| OpenAPI | Schema-first interface contract and generation ecosystem | Which aspects of the authoring experience can be carried over? | [OpenAPI Specification](https://spec.openapis.org/oas/latest.html) |
| GraphQL | Typed graph, introspection, schema descriptions and mutations | Could a generated GraphQL adapter expose Discovery + Interaction without losing semantics? | [GraphQL Spec](https://spec.graphql.org/September2025/) |
| W3C SCXML / XState | State machines, guarded transitions, invoked async processes | What state metadata should be declared vs implemented? | [SCXML](https://www.w3.org/TR/scxml/) · [XState docs](https://stately.ai/docs/invoke) |
| MCP | Tools, Resources and agent-facing protocol | How much of contextual navigation can MCP expose? | [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) |
| A2A | Task lifecycle and streamed status/artifact updates | Execution and stream event design | [A2A Specification](https://a2a-protocol.org/latest/specification/) |
| CloudEvents / AsyncAPI | Event envelope / message-oriented API descriptions | Event representation and bindings (not a state machine) | [CloudEvents](https://github.com/cloudevents/spec) · [AsyncAPI 3.0](https://www.asyncapi.com/docs/reference/specification/v3.0.0) |
| Google RPC error details | Machine-readable reason, retry delay, field violations and help | Avoid inventing generic `retryAfter` and error categories without comparison | [error_details.proto](https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto) |
| RFC 9457 | Structured HTTP Problem Details | Adapter semantics for HTTP errors | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) |

## Publication status matters

- **WoT Thing Description 1.1** and **WoT Discovery** are W3C Recommendations; **WoT Profiles** is a Working Draft; the **Scripting API** is a Group Note.
- **Hydra** is a community draft, not a W3C Recommendation; its W3C Community Group closed in May 2026. Its hypermedia ideas remain relevant.
- **SCXML** is a W3C Recommendation, while XState is a project/library with its own documentation.
- Protocol adapter candidates evolve; select **explicit versions** at implementation time rather than treating every linked “latest” page as a pinned contract.

## Focused research notes

- [Hydra deep dive](research/hydra.md)
- [W3C WoT TD, Discovery, node-wot and roadmap](research/wot.md)
- [WoT error-handling conventions](research/wot-errors.md)
- [Async state machines, streaming and event protocols](research/async-state-streaming.md)

## What would constitute value?

Possibly the ability to declare an app contract once, write real guard/action logic once, and consistently expose **meaningful discovery plus Result + Context**, with state-aware choices across multiple protocol bindings.

This is an **unproven hypothesis**. Measure agent task success, unnecessary calls, errors, developer burden and correctness relative to existing tools and formats.

[README](../README.md) · [Decision status](decisions.md) · [Open questions](open-questions.md)
