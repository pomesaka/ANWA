# Current direction and decision status

> **As of 2026-11-01.** Conversation-level design intent, **not** an accepted specification or a guarantee that a runtime exists. Start with [Scope and responsibility boundaries](scope-and-boundaries.md).

## Principles we intend to preserve

| Topic | Current direction | Important boundary |
| --- | --- | --- |
| Product | Schema-first agent-facing web application framework | ANWA is a **framework**, not an application generator that chooses business workflows |
| Authoring | Developer declares a public contract and implements behavior in ordinary code | ANWA does not prescribe the business domain |
| Protocol | Application semantics independent of GraphQL/REST/RPC/MCP; adapters possible | Exact adapters and conformance TBD |
| Vocabulary | Prefer W3C WoT terms (Thing, Interaction Affordances, Link, DataSchema, Form) | Vocabulary alignment ≠ WoT conformance |
| Discovery | Provide means to expose descriptions, relations, available interactions and contextual hints | Developer decides what is published; ANWA need not enumerate everything |
| Interaction | Aim for **Outcome + Context** after delivered application-level interactions | Context can be empty/restricted; next steps are **options, not instructions** |
| Errors | Support structured domain outcomes, meaningful retry/effect information where warranted | Application determines semantics; transport protocols still have errors/status |
| Guards | If an application uses guards, schema may reference their contract, actual checks live in code | A declarative guard DSL is not required; ANWA does not automatically infer conditions |
| States/transitions | ANWA should allow state/transition descriptions when useful | **Not required** that every application or Thing be authored as a state machine |
| Async / streaming | Provide appropriate representation/integration paths for nonblocking work and observation | Application/infrastructure chooses durable engine, event guarantees, transport |
| UI | Human UI is not required as primary interface | Generating the actual UI is a client/application choice |

## Error-contract and tooling decisions (2026-11-01 update)

- Expected **domain error codes are exhaustively declared** on each interaction when domain errors are possible.
- Runtime-reported but undeclared domain codes are classified as the reserved **`UNEXPECTED_ERROR`**, without revealing internal implementation details. **`INVALID_INPUT`** is the separate framework-generated input contract error. The current 0.1 reference has not standardized all transport-level failures.
- **Schema-first tooling should generate interfaces/type declarations**, not application business logic.
- Schema shape/known references and implementation outputs should be validated; runtime side-effect correctness cannot be proven by static types.
- The existing hand-authored JSON manifest is not presumed human-friendly or empirically AI-friendly; the 0.1 prototype provides `validate`, `generate`, and `inspect` commands.
- **Cross-service/external API delegation is deferred** for a future interoperability proposal; app-scoped references remain the experimental profile.

See [Schema authoring and validation](schema-authoring.md) for the current implementation and limitations.

## Agent-first schema design clarification (2026-11-01)

- Primary consumers of the schema are **agents generating/implementing applications** and **agents discovering/invoking applications**. Human writing/editing convenience is not a design objective.
- Preserve an **unambiguous machine-verifiable public contract** and progressive Discovery rather than optimizing the manifest's visual compactness.
- Optional `semanticTypes` provide application-authored semantic identifiers (absolute URI/URN). On Actions, independent optional booleans `hasSideEffects` and `idempotent` describe business-observable effects and repeatability. **Omission means unknown**, not `false`; these are not an alias for WoT `safe`.
- Semantic and effect annotations are **untrusted metadata**. They do not certify authorization, actual side effects, business rule enforcement, or automatic safe retries.
- Actual utility for unfamiliar AI agents remains unmeasured; neither structured JSON nor readable prose is proof of better task completion.

See [Agent-native schema contract](../spec/agent-native-schema.md).

## Things explicitly delegated to application developers

These are **not pending ANWA decisions**:

- Granularity: an order, an order collection or an order service as a Thing.
- Which domain states, transitions, Actions, errors and relations exist.
- Whether an application needs a state machine at all.
- Guard predicates, business rules, approval requirements, how to implement transactions and data persistence.
- Which related resources/next interactions to expose for a specific result.
- Which optional facilities (streaming, async execution, persistence) to adopt and how to deploy them.
- User experience, domain-specific recommendations and business success criteria.

ANWA's job is to supply **ways to express and expose** these decisions when appropriate, without making them universal.

## Questions ANWA itself still owns (non-exhaustive)

- Which interoperable core primitives and extension points are necessary to expose descriptions, links, interactions, results and context?
- Which fields/semantics of **Outcome + Context** are common, required, optional or extensible?
- How can a public schema bind to user-defined guards/handlers/resolvers, and how much validation can tooling actually guarantee?
- What, if any, canonical model should adapt to WoT/GraphQL/MCP/RPC without falsely asserting conformance?
- What optional lifecycle/observation interfaces make async and streaming representable without mandating an execution engine?
- What are the minimum safeguards against unsafe interpretation of descriptions and disclosure of unauthorized hints?

See [Open questions](open-questions.md) for prioritization. The above are **framework-design questions**, not decisions about a sample business application.

## Corrections to earlier discussions

1. **State-machine-first → schema-first:** a state machine is **one optional** domain modeling tool, not ANWA's mandatory authoring entrypoint.
2. **Guard predicates in YAML → references to application code:** ANWA may define a binding contract, not a new language for arbitrary guard logic.
3. **Affordance = currently possible → WoT Interaction Affordance + optional contextual applicability:** definition and dynamic hint are separate; neither is an authorization grant.
4. **Recovery-after-failure → any-interaction navigation:** a result may carry relevant next-interaction references after success or domain failure.
5. **"Decide Thing granularity" → developer choice:** ANWA only needs an expressive mechanism that can support relevant modeling styles.
6. **"ANWA must generate next steps/state transitions" → "ANWA must enable authors to expose them":** automatic derivation is an optional feature to justify separately.

[README](../README.md) · [Scope](scope-and-boundaries.md) · [Architecture](architecture.md) · [Glossary](glossary.md)
