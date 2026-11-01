# ANWA

**Agent-Native Web Applications**

> A schema-first framework concept for web applications that AI agents can discover, understand, and interact with — without requiring a predefined human-facing UI.

**Status: Interaction-first experimental v0.2 specification + executable demos on `main`.** A dependency-free in-process reference adapter exists; there is no released package, stable API, network protocol, security/conformance guarantee, or published standard.

## Why ANWA?

A human can discover what a web application does by navigating pages and forms. An AI agent should instead be able to **discover application semantics and interactions**, retrieve state, invoke operations, and get enough context to decide where to go next.

ANWA explores an **OpenAPI-like, schema-first development experience**: implementing agents or application authors declare **standalone Interactions** and bind them to ordinary handlers. **Thing modeling is optional**: no Interaction must be nested under an entity or service Thing. The framework exposes what the application chooses to publish; it does not decide domain structure or business workflows.

**Core principle:** *Every delivered application-level interaction result contains an outcome and the context for what can come next.*

The application provides options and constraints; the agent chooses what to do according to the user's intent.

## How it would work

```mermaid
flowchart TB
    S[Public Interaction schema] --> F[ANWA Runtime]
    C[Bound application handlers and optional guards] --> F
    F --> D[Discovery: Interaction descriptions]
    F --> I[Interaction: Outcome and Context.next]
    D --> A[AI Agent]
    I --> A
```

### 1. Define the public contract

Declare top-level **Interactions** (`query`, `action`, `event`), inputs/outputs, expected errors and optional guards. **Thing metadata is optional**; business entity IDs are regular input fields, not mandatory Thing references.

**The schema is not business-logic code.** A guard is declared by name and contract, not reimplemented as a condition language in YAML.

### 2. Implement behavior

Application authors choose domain boundaries, states, policies and follow-up candidates. They bind InteractionRefs directly to handlers and optional guards in ordinary code. Where relevant, the **same named guard** may support Discovery-time applicability hints and Invocation-time checks. Real authorization and transactional enforcement still happen on the server.

### 3. Serve a navigable application

Two **logical** interfaces—not necessarily two wire protocols:

| Interface | Responsibility |
| --- | --- |
| **Discovery** | Expose declared Interactions, types, semantic annotations and optionally Thing metadata, without requiring a Thing parent |
| **Interaction** | Read, invoke and observe; return **Outcome + Context**, with a single `context.next` list of available next interactions/discovery targets and optional guidance/timing |

Interaction may complete immediately with a typed `Result<Success, Error>`, or optionally accept an execution reference that can be observed later (durability depends on the application). **Async execution and streaming observation are different concerns.**

[Architecture and developer workflow](docs/architecture.md) · [Worked order cancellation example](docs/examples/order-cancellation.md) · [Interaction and streaming model](docs/interaction-model.md)

## Executable v0.2 interaction-first contract lab

The working [v0.2 contract](spec/anwa-0.2.md), [machine-readable schema](spec/anwa-0.2.schema.json), [in-process runtime](src/anwa.mjs), [schema tooling](src/schema-tools.mjs) and [three runnable demos](demo/README.md) are on `main`. [v0.1](spec/anwa-0.1.md) is retained as historical research.

```bash
# Node.js >=20, no runtime dependencies
npm test
npm run demo
```

The demos use first-class InteractionRefs: [stateless Calculator](demo/calculator/), [Orders](demo/orders/) with **optional Thing metadata**, and [async Reports](demo/reports/) with **no Execution Thing**. They demonstrate expressive power, not prescribed app architecture or production runtime features. In particular, the adapter does not provide authentication, durable jobs, network transport, or complete JSON Schema validation.

**v0.2 is a breaking experimental profile for discussion, not an adopted standard.** See the merged [Minimal Core proposal](docs/proposals/0002-minimal-core.md) for historical design context.

## Agent-first schema and contract tooling

ANWA's experimental v0.2 Schema-first workflow includes **contract validation**, **type/interface generation** and a **diagnostic schema view**. These tools do not generate business logic. **Human ease of writing the manifest is not a design target**: the contract is primarily for implementing agents and consuming agents.

```bash
npm run validate       # validates demo manifests against the supported schema subset
npm run types:orders   # generates TypeScript handler interfaces
npm run inspect:orders # renders schema meaning, fields and domain errors as Markdown
npm test               # validates declared errors against runtime behavior
```

For an Action that declares `errors`, **all expected domain error codes must be listed**. An undeclared domain error becomes opaque `UNEXPECTED_ERROR`; `INVALID_INPUT` is framework input validation. **Retries and other follow-up interactions use one `context.next` list**: `guidance.kind: "retry"`, optional `guidance.level`, and optional `when.after`. There is no separate `error.retry`.

**Machine-readable is not the same as AI-effective.** Optional semantic identifiers and Action effect categories are exposed through Discovery, but are untrusted declarations rather than guarantees. We have **not benchmarked agent task performance** against OpenAPI, WoT or MCP. See [Agent-native schema contract](spec/agent-native-schema.md) and [contract validation](docs/schema-authoring.md).

## Vocabulary and relationship to WoT

ANWA uses **W3C Web of Things (WoT)** concepts for comparison, but the v0.2 core is **Interaction-first**, not Thing-bound:

| WoT term | Working use in ANWA |
| --- | --- |
| Thing / Thing Description | Optional metadata for app domain concepts; not required to own an Interaction |
| Property / Action / Event Affordance | Prior-art Thing-bound concepts; ANWA uses top-level `query` / `action` / `event` |
| Link | Related resource/Thing |
| DataSchema / Form | Typed data and a protocol-specific interaction binding |

**WoT Interaction Affordance describes an offered interaction; it does not mean an action is currently authorized or guaranteed to succeed.** ANWA is investigating separate **contextual applicability** hints, plus a common Result + Context response. These are proposed ANWA abstractions, **not WoT TD 1.1 fields**.

ANWA is **WoT-informed, not currently WoT-compliant**. GraphQL, REST, RPC, MCP and related technologies remain possible adapters rather than required foundations.

[WoT-aligned Glossary](docs/glossary.md) · [Framework vs application boundaries](docs/scope-and-boundaries.md) · [Current decisions and non-decisions](docs/decisions.md)

## Documentation map

| Start here | Document |
| --- | --- |
| Vision & scope | [Vision](docs/vision.md) |
| Responsibility boundary and feature-evaluation method | [Scope & boundaries](docs/scope-and-boundaries.md) |
| Working decisions / unresolved choices | [Decision status](docs/decisions.md) |
| Schema-first architecture | [Architecture](docs/architecture.md) |
| Step-by-step schema + code example | [Order cancellation](docs/examples/order-cancellation.md) |
| Result, async execution, streaming | [Interaction model](docs/interaction-model.md) |
| Errors, retry guidance and next-interaction navigation (`context.next`) | [Error recovery and navigation](docs/error-recovery-navigation.md) |
| Established and proposed terminology | [Glossary](docs/glossary.md) |
| Risks, next tests, unresolved design | [Open questions](docs/open-questions.md) |
| Comparison against existing work | [Prior art](docs/prior-art.md) |
| Executable Interaction-first profile | [ANWA 0.2 contract](spec/anwa-0.2.md) |
| Schema reference | [Manifest / Result JSON Schema](spec/anwa-0.2.schema.json) |
| Agent-first semantic design contract | [Agent-native schema](spec/agent-native-schema.md) |
| Generation and validation | [Schema authoring and tooling](docs/schema-authoring.md) |
| Working demos and tests | [Demo guide](demo/README.md) |
| Proposed concrete shape (not adopted) | [Proposal 0001 — Draft PR](https://github.com/pomesaka/ANWA/pull/1) |

### Research notes

- [Hydra / Hypermedia](docs/research/hydra.md)
- [W3C WoT, WoT Discovery and node-wot](docs/research/wot.md)
- [WoT error handling](docs/research/wot-errors.md)
- [Async, state machines and streaming](docs/research/async-state-streaming.md)

## Prior art & primary references

ANWA is **not claiming that machine-readable operations or navigable responses are new inventions**. These ideas already exist across Hypermedia, WoT and agent protocols.

| Standard / project | Relevance | Official source |
| --- | --- | --- |
| REST / Web Linking | Navigable representations and typed link relations | [RFC 8288](https://www.rfc-editor.org/info/rfc8288) |
| Hydra | Hypermedia links, operations and generic clients | [Hydra Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/) |
| W3C WoT | Thing Description, Interaction Affordances, Forms and protocol bindings | [TD 1.1](https://www.w3.org/TR/wot-thing-description11/) |
| W3C WoT Discovery | Introduction, Exploration and Thing Description directories | [Discovery](https://www.w3.org/TR/wot-discovery/) |
| OpenAPI | Machine-readable API contract and schema-first tooling | [OpenAPI Specification](https://spec.openapis.org/oas/latest.html) |
| GraphQL | Typed schema, introspection, data selection and mutations | [GraphQL Specification](https://spec.graphql.org/September2025/) |
| SCXML | State machines and transitions | [W3C Recommendation](https://www.w3.org/TR/scxml/) |
| MCP | Agent-facing tools and resources | [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) |
| A2A | Task states, updates and output streaming | [A2A Specification](https://a2a-protocol.org/latest/specification/) |
| CloudEvents | Common event envelope | [CloudEvents Specification](https://github.com/cloudevents/spec) |

These are **references, not mandatory dependencies or endorsements**. Hydra's community specification is unfinished; WoT TD 1.1 is a W3C Recommendation, while WoT Profiles remains a Working Draft. See [Prior Art](docs/prior-art.md).

## Status and contributing

The repository now includes **working documents and a runnable experimental in-process prototype**. Its v0.2 Interaction-first JSON profile is a testable proposal, not a final schema or public API. Network transports, runtime security, full JSON Schema compliance, versioning and licensing remain unselected. External API delegation/federated references are future work, not a v0.2 guarantee. The immediate goal is to test whether the framework lets developers express agent-navigable applications with less duplication and acceptable interoperability costs. **Application design choices remain with application authors**; example orders/payments are tests of expressive power, not universal ANWA requirements.

Corrections, competing prior art and design feedback are welcome via issues or PRs. Please distinguish **established standard behavior** from **ANWA proposals**.

**License:** Not yet selected. No open-source license is granted merely by making a repository public.

---

<details>
<summary>日本語概要</summary>

ANWA（Agent-Native Web Applications）は、**AIエージェントが直接探索・理解・操作できるWebアプリケーション**を作るための、Schema-firstなフレームワーク構想です。

開発者はOpenAPIのような公開スキーマで必要なThingやActionなどを宣言し、GuardやActionのビジネスロジックは通常のコードで実装します。状態機械やGuard、関連リソースの設計をすべてのアプリに要求するわけではありません。ANWAは、開発者が選んだ意味・関係・操作と、成功・失敗のOutcome + ContextをAIに公開する共通の仕組みを目指します。Thingの粒度、業務フロー、次に何を提示するかはアプリケーション実装者の選択です。

WoTの語彙を優先しますが、ANWA独自のResult形式や状態依存の案内はまだ設計仮説です。現在のv0.2ではInteractionをThingに属させず単独で公開・発見・実行できます。Thingは任意のメタデータです。実験実装と動作デモはありますが、製品向けの安全性や互換性は保証していません。

</details>
