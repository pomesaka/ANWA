# W3C Web of Things — prior-art deep dive

> **Research note (2026-11-01).** Separates published Recommendations from ongoing drafts and future plans.

## Timeline, current status, and roadmap

- **2020-04-09:** Thing Description 1.0 published as W3C Recommendation.
- **2023-12-05:** [Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) and [WoT Discovery](https://www.w3.org/TR/wot-discovery/) published as Recommendations. These are the stable bases for current comparison.
- **2025-11-04:** [Thing Description 2.0](https://www.w3.org/TR/wot-thing-description-2.0/) First Public Working Draft.
- **2026-10-29:** The [editor's draft](https://w3c.github.io/wot-thing-description/) carries this date; it is *not* a Recommendation. TD 2.0 notes possible breaking compatibility changes.
- **2026-09-14:** The [W3C Working Group charter (2026–2028)](https://www.w3.org/2026/09/wot-wg-2026.html) was renewed. It explicitly targets dynamic resources, manageable actions, and developer guidance combining AI techniques, AI Agents and MCP. The AI/MCP primer is **planned for Q4 2027**, with no draft listed in the charter.

The [W3C article dated 2026-10-21](https://www.w3.org/ja/blog/2026/web-of-things-working-group-recharter-new-momentum-for-iot-interoperability/) explicitly discusses AI agents interacting with physical systems through Thing Descriptions.

## Core concepts

A **Thing** is an abstraction of a physical **or virtual entity** exposing interactions. Its **Thing Description (TD)** is a self-describing, JSON-based document with JSON-LD semantics.

| WoT concept | Function | Resembles in ANWA |
| --- | --- | --- |
| Thing / Thing Model | Concrete instance / abstract reusable model | Resource instance / type |
| TD `title`, `description`, `@type` | Human-readable and semantic annotation | Semantics |
| `properties` | Read, write, or observe state | Read / state interactions |
| `actions` | Invoke functions, including RPC-like functions | Capabilities |
| `events` | Asynchronous updates | Observe |
| `links` | Typed links to related Things or documents | Relations |
| `forms` | Invocation templates, including operation, endpoint and content type | Protocol binding / Interaction |
| `securityDefinitions` | Describes security mechanisms | Security metadata |
| `input`, `output` | Action parameter and result shapes | Schema |
| `safe`, `idempotent`, `synchronous` | Action behavioral declarations | Execution contract (partial) |

References: [TD 1.1](https://www.w3.org/TR/wot-thing-description11/), [WoT Architecture 1.1](https://www.w3.org/TR/wot-architecture11/).

**Important:** TD itself can express many things ANWA proposes, including Protocol Binding independent of core interaction concepts. Avoid asserting this is a new ANWA invention.

## Discovery: a separate W3C Recommendation

[WoT Discovery (2023)](https://www.w3.org/TR/wot-discovery/) explicitly separates:
1. **Introduction:** Find Exploration endpoints without leaking TD metadata prematurely.
2. **Exploration:** Authenticate and discover TDs from a TD Server or TD Directory.

The Directory provides CRUD/listing and describes syntactic/semantic searches (e.g. JSONPath, XPath, SPARQL), with differing normative/optional status. It includes authorization/privacy requirements and lifecycle/expiry metadata.

Distinguish this *finding TD documents* problem from ANWA's proposed *finding a relevant next semantic step while working on an intent and resource*. They overlap but are not identical. WoT already has meaningful discovery; do not characterize it as lacking discovery.

## Framework and implementation prior art

- [W3C WoT Scripting API](https://www.w3.org/TR/wot-scripting-api/) is an **informative Group Note**, not a Recommendation. It defines higher-level consuming, exposing and discovering APIs.
- [Eclipse Thingweb node-wot](https://github.com/eclipse-thingweb/node-wot) is a concrete **TypeScript server/client framework**. It supports application business logic over standard TD models, with protocol-specific packages. The official README documents HTTP, CoAP, MQTT and other bindings and example applications.
- [TD 1.1 implementation report](https://w3c.github.io/wot-thing-description/testing/report11.html) documents implementability of standard features; it explicitly does *not* claim full conformance or comprehensive interoperability testing.

## Limits and uncertainties for ANWA

1. **Domain focus:** WoT's concrete design, tools and implementations focus on devices, IoT and related services. Whether using Thing as a general object such as Order/Invoice is ergonomic requires a prototype, not just reading its abstract definition.
2. **Contextual availability:** TD declares properties/actions and can evolve, but one must still define how to report user- and state-specific availability, constraints and explanations at invocation time. No standard `availableForThisUserNow` field has been established by this review.
3. **AI-specific behavior:** intent-based relevance ranking, token-budgeted progressive descriptions, semantic planning support, and trustworthy approval/execution planning are not demonstrated as standardized by the reviewed TD/Discovery documents.
4. **Trust:** `securityDefinitions` describes security mechanisms; it does not replace actual authorization/approval checks. Action metadata such as `safe` and `idempotent` are declared properties that a runtime must implement correctly.
5. **Evolution:** TD 2.0 is a moving draft; even backward compatibility is not guaranteed. Basing a framework on 2.0 today adds specification-change risk.

## Critical consequence for ANWA

**WoT is both important prior art and a possible foundation.** There is no need to invent a new Thing Description or protocol abstraction without first testing whether WoT/Thing Model plus extensions and a suitable agent-facing authoring/runtime layer can solve ANWA's use cases.

A valuable first prototype would compare:
- Baseline: expose the same mock order-management application using node-wot and WoT TD 1.1.
- Proposal: add contextual, intent-oriented progressive discovery and execution contracts **without changing the business logic**.
- Measure task success, wrong operation attempts, token and tool-call usage, latency, and developer metadata burden.

## Primary sources

- [TD 1.1 (Recommendation)](https://www.w3.org/TR/wot-thing-description11/)
- [WoT Discovery (Recommendation)](https://www.w3.org/TR/wot-discovery/)
- [TD 2.0 (Working Draft)](https://www.w3.org/TR/wot-thing-description-2.0/)
- [TD 2.0 (Editor's Draft)](https://w3c.github.io/wot-thing-description/)
- [2026–2028 WoT WG Charter](https://www.w3.org/2026/09/wot-wg-2026.html)
- [2026-10-21 W3C update (Japanese)](https://www.w3.org/ja/blog/2026/web-of-things-working-group-recharter-new-momentum-for-iot-interoperability/)
- [Scripting API (Group Note)](https://www.w3.org/TR/wot-scripting-api/)
- [node-wot official GitHub](https://github.com/eclipse-thingweb/node-wot)
- [TD 1.1 implementation report](https://w3c.github.io/wot-thing-description/testing/report11.html)

[ANWA overview](../../README.md) · [Working glossary](../glossary.md) · [Hydra deep dive](hydra.md)
