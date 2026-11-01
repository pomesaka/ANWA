# Open questions

> These are questions to answer **before** committing to an API or protocol.

## Core model

1. What is the smallest meaningful unit: Resource, Capability, or something else?
2. Should discovery work from both a domain object and a natural-language intent?
3. How precisely can Semantics be represented without building a whole new ontology?
4. Do Relation and Affordance need distinct graph edge types?
5. WoT already defines Interaction Affordance. Should ANWA separately model contextual availability, applicability and recommendations? How is freshness represented?
6. Which information is global/static, and which depends on a user, resource instance, policy, or time?

## Interface boundaries

7. Are Discovery and Interaction simply two logical views of one model, or separate APIs?
8. How can an agent retrieve only the explanations and structures relevant to its current goal?
9. Should Read, Invoke, and Observe be separate primitives?
10. Can GraphQL / RPC / MCP adapters express the same semantics without lossy mappings?
11. What is the minimum metadata needed for reliable discovery of an unfamiliar application?

## Correctness and trust

12. How should ANWA reconcile TD 1.1 additionalResponses, HTTP Problem Details (WoT Profiles draft), and runtime exceptions? What happens when explanations disagree with actual implementation behavior?
13. How do we prevent the agent from treating untrusted descriptions as instructions?
14. How are authorization, approval, preconditions, and retries enforced independently of hints?
15. How should a stale affordance, race condition, or non-idempotent operation be handled?

## Validation

A candidate comparison: expose the same order-management test application through (a) conventional OpenAPI/RPC, (b) GraphQL introspection, (c) MCP Tools/Resources, and (d) an ANWA-style model.

Keep domain behavior, permissions, and task definitions comparable. Measure task completion rate, incorrect operation attempts, tool calls, token use, latency, and developer effort. Be careful: giving one variant more or better explanations would confound the comparison.

## Deliberately undecided

Name of individual interfaces, JSON representation, transport, DSL/SDK, language, framework internals, licensing, and commercialization.

[Back to README](../README.md) · [Vision](vision.md) · [Prior art](prior-art.md)
