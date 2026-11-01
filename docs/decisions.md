# ANWA — Current experimental decisions

> Active ANWA v0.2, 2026-11-01. Historical v0.1 Thing-bound notes are not current specifications.

| Area | Current direction | Responsibility boundary |
| --- | --- | --- |
| Core | **Interaction-first**, no Thing construct | Domain objects are application data |
| Reference | App-scoped standalone InteractionRef string | No mandatory object identifier or globally resolvable URL |
| Kinds | `query`, `action`, `event` | WoT's Thing-bound vocabulary is prior art, not an identical ANWA contract |
| Schema | Top-level `interactions` and `entrypoints` | No `things` or `subjectType` |
| Binding | One TypeScript Handler per Interaction | Handler owns `Outcome + Context` |
| Context | Handler calls `reply(result, next)` | No global `context` resolver; no framework-selected business flow |
| Guard | Optional code-backed named Guard; Handler explicitly calls `app.assess` | Real authorization/transactions remain app-owned |
| Navigation | `context.next` lists potential next Interactions | Retry is another candidate with `guidance.kind: "retry"` |
| Errors | Expected domain codes exhaustively declared; unexpected errors opaque | Actual side-effect certainty belongs to the outcome |
| Side effects | Optional Action `hasSideEffects` / `idempotent` | Declared hints, not enforcement or safe retry certification |
| Async | `accepted` with opaque execution ID, status/event as ordinary Interactions | No required Execution Thing or workflow engine |
| Runtime | **Bun ^1.4.4 / TypeScript** | `bun fmt`, `bunx oxlint`, `bun check`, `bun test` and schema validation in CI |
| Agents | Implementing and consuming agents are primary schema clients | Human editing convenience is not a design requirement |

## Explicitly delegated to application authors

Which Interactions exist, domain ID shapes, business state and policy, authorization, Guards, effect semantics, concurrency, transactions, retry suggestions, generated reports, persistence, deployment, and next candidates. The framework must make these expressible, not decide them.

## Remaining framework questions

Full JSON Schema dialect support, statically typed binding against generated Handler types, authenticated Discovery, network adapters, cross-app delegation, error detail schemas and independent unfamiliar-agent evaluations.

[ANWA v0.2 contract](../spec/anwa-0.2.md) · [TypeScript architecture](architecture.md)
