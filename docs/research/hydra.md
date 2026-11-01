# Hydra — prior-art deep dive

> **Research note (2026-11-01).** Primary sources only. This is analysis, not an ANWA design decision.

## Provenance and current status

- The W3C Hydra Community Group launched on **2013-06-18** to develop APIs and generic clients based on machine-readable hypermedia.
- The Core Vocabulary page identifies itself as **Unofficial Draft — 2021-07-13**, and warns that some sections are incomplete, missing, or outdated. It is **not a W3C Standard**.
- W3C records that the Community Group **closed on 2026-05-21**. This establishes the group's status, not that every related repository or implementation has stopped receiving changes.

Primary sources:
- [W3C launch announcement](https://www.w3.org/community/hydra/)
- [Core Vocabulary](https://docs.hydra-cg.com/spec/latest/core/)
- [W3C closed-group record](https://www.w3.org/groups/cg/hydra/)
- [Official specification issue tracker](https://github.com/HydraCG/Specifications/issues)

## Core problem

Web services that require custom SDKs and out-of-band documentation cannot easily be explored by generic clients. Hydra combines **REST / hypermedia** with **Linked Data / JSON-LD / RDF semantics** to let clients discover links and possible state transitions from machine-processable representations.

## Building blocks and their meaning

| Hydra concept | What it expresses | ANWA concept it resembles |
| --- | --- | --- |
| `ApiDocumentation` | A discoverable API document and entry point | Application description / Discovery |
| `Class`, `supportedProperty` | Resource class, properties, readable/writable/required hints | Resource type / Schema |
| `Link` | An explicitly dereferenceable semantic relation | Relation |
| `supportedOperation` | An operation described on a class or link | Capability |
| `operation` | Operation advertised in a resource representation | Contextual Affordance |
| `expects`, `returns`, `possibleStatus` | Invocation input/output and possible outcomes | Execution contract (partial) |
| `IriTemplate` | Parameterized resource links | Parameterized navigation |

Key specification passages: [Adding Affordances to Representations](https://docs.hydra-cg.com/spec/latest/core/#adding-affordances-to-representations), [Documenting a Web API](https://docs.hydra-cg.com/spec/latest/core/#documenting-a-web-api), [Discovering a Hydra-powered Web API](https://docs.hydra-cg.com/spec/latest/core/#discovering-a-hydra-powered-web-api).

## What this already covers

1. A representation can advertise an operation (e.g., DELETE on a given resource) instead of requiring a client to guess endpoints.
2. Classes can describe generally supported operations, while resource-specific representations can expose relevant operations.
3. The official text explicitly describes hiding a delete link when a user lacks permission.
4. A client can find machine-readable `ApiDocumentation` via an HTTP `Link` header, then follow semantic links.
5. Human-readable titles and descriptions supplement machine-readable identifiers and HTTP operation descriptions.
6. The specification warns that runtime operations may fail, so described possible outcomes are **hints**, not guarantees.

## Limits and uncertainties for ANWA

- Hydra's `Operation` is framed around constructing **HTTP requests**, whereas ANWA currently wants a protocol-independent application model.
- Authentication and authorization are deliberately not covered in Hydra's issue-tracker example, even though permission-filtered links are mentioned.
- JSON-LD/Linked Data semantics create power and global identifiers, but may impose authoring and client complexity. **That cost has not been benchmarked.**
- Intent-conditioned *progressive* graph search, LLM-oriented explanation retrieval, approval management, and execution planning are **not established as solved by the reviewed Hydra Core text**; this is not evidence that Hydra extensions cannot implement them.
- The Community Group is closed and the draft remains unfinished. Use Hydra as significant prior art, not as a current W3C Recommendation.

## Consequence for ANWA

**Dynamic links, semantic relations, operation affordances, and generic clients are prior art.** ANWA cannot claim novelty from those alone.

A meaningful comparison is whether ANWA offers a better developer workflow and experimentally better **agent-directed exploration across unfamiliar business applications**, while preserving enforceable policy and minimizing expensive full-schema exposure.

[ANWA overview](../../README.md) · [Working glossary](../glossary.md) · [WoT deep dive](wot.md)
