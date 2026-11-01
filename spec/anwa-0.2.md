# ANWA 0.2 — Interaction-first experimental contract

> **Status:** Experimental implementation profile, not a standard or compatibility guarantee. This is the active contract on main. [v0.1](anwa-0.1.md) is superseded. ANWA is WoT-*inspired*, not WoT TD-conformant.

## Central principle

**An Interaction is the primary published and invocable unit. A Thing is optional.** Application authors decide whether their domain even contains Things, how to identify instances, and which related operations to expose. No Interaction needs a parent Thing.

ANWA defines **Description → Binding → Discovery → Interaction** as logical responsibilities, not as a required transport topology or network protocol. Protocol adapters (REST, MCP, WoT, GraphQL) are separate concerns.

## Manifest

An application exposes an \`anwa.json\` document with:

| Field | Required | Meaning |
| --- | --- | --- |
| \`anwa: "0.2"\` | Yes | Breaking experimental profile version |
| \`interactions\` | Yes | Map of **global, app-scoped InteractionRefs** to definitions |
| \`entrypoints\` | Yes | Nonempty array of declared InteractionRefs offered as starting points |
| \`things\` | No | Optional Thing/domain metadata. No interaction is nested under or required to belong to a Thing |

Each Interaction definition has \`kind\` (\`query\`, \`action\`, or \`event\`) and \`description\`, optionally \`input\`, \`output\`, \`errors\`, \`semanticTypes\`, \`subjectType\`, and (Action only) \`guard\`, \`hasSideEffects\`, \`idempotent\`.

- \`query\`: obtains information and returns a typed \`Result\`. This is **ANWA's own generic term**, not a WoT PropertyAffordance.
- \`action\`: invokes an operation. It may have side effects and return either \`Result\` or \`accepted\`.
- \`event\`: an optional observation interface, which the in-process adapter exposes as an \`AsyncIterable\`.
- \`subjectType\`: optional reference to declared Thing **metadata**; this never forces a particular Thing instance or argument shape.
- \`input\`/\`output\`: payload types in the subset of JSON Schema supported by the reference adapter. For example, a dynamic order ID is ordinary input, **not** a required ThingRef.
- \`errors\`: exhaustively declared expected domain failure codes. Unknown codes and implementation failures map to opaque \`UNEXPECTED_ERROR\`.
- \`hasSideEffects\`/\`idempotent\`: optional, independent Action booleans. Absence is **unknown**, not false. They are not authorization or retry guarantees.

### Minimal Thing-free application

\`\`\`json
{
  "anwa": "0.2",
  "entrypoints": ["calculator.add"],
  "interactions": {
    "calculator.add": {
      "kind": "action",
      "description": "Add two numbers.",
      "input": {
        "type": "object",
        "properties": {
          "a": { "type": "number" },
          "b": { "type": "number" }
        },
        "required": ["a", "b"],
        "additionalProperties": false
      },
      "output": { "type": "number" },
      "hasSideEffects": false,
      "idempotent": true
    }
  }
}
\`\`\`

The optional Thing metadata does **not** appear in this manifest.

## References and resolution

An \`InteractionRef\` is an app-scoped **string** key, e.g., \`"report.generate"\`, \`"execution.result"\`, \`"shipment.track"\`. It is not a URL, ThingRef, or promise of cross-API delegation.

\`\`\`js
const app = new AnwaApp(manifest).bind({
  "calculator.add": async ({input}) => ok(input.a + input.b)
});
const catalog = app.catalog();
const { description } = await app.discover("calculator.add");
const response = await app.interact("calculator.add", {a: 2, b: 3});
\`\`\`

\`catalog()\` returns Interaction summaries plus entrypoints and optional Thing metadata.
\`discover(ref)\` resolves one declared/bound Interaction definition; it returns \`{description, context}\`.
\`interact(ref,input?)\` resolves an Action or Query and invokes the bound handler.
\`observe(ref,input?,options?)\` subscribes to an Event.

The runtime does **not** force one Thing per business entity, a particular ID scheme, database, action URL, or API aggregation structure. It **does** require every advertised Interaction to have a bound Handler in the current experimental adapter.

## Outcome and Context

Every delivered application-level Result has \`outcome\` and \`context\`. Domain failure and success use the same envelope. \`context.next\` is a list of **application-provided candidate next Interactions**, not mandatory instructions.

\`\`\`json
{
  "outcome": {
    "kind": "settled",
    "result": { "ok": false, "error": { "code": "NOT_READY", "effects": "none" } }
  },
  "context": {
    "next": [{
      "ref": "execution.result",
      "input": { "executionId": "42" },
      "guidance": { "kind": "retry", "level": "recommended" },
      "when": { "after": "PT30S" }
    }]
  }
}
\`\`\`

A \`next\` candidate has:
- \`ref\`: required reference to **a declared Interaction**.
- \`input\`: optional application-supplied input values, validated when present. It makes a dynamically identified execution actionable without a Thing.
- \`guidance.kind: "retry"\`: optional. When present, \`ref\` **must** be the same Interaction that produced this response.
- \`guidance.level\`: optional \`required\` / \`recommended\` / \`available\`; \`required\` means an application-defined prerequisite to a chosen continuation, **not** authority over the user.
- \`when.after\`: optional ISO 8601 duration. The runtime does not schedule anything.
- \`applicability\`: optional advisory \`available\` / \`blocked\` / \`unknown\`.

\`context.next: []\` is valid. The framework never synthesizes business decisions or blindly retries. If a candidate omits input but the target Interaction requires it, the client must supply an input satisfying its declared schema.

Actual effect certainty of a failed invocation belongs to \`error.effects\` (\`none\`, \`occurred\`, \`unknown\`) — it is different from static \`hasSideEffects\` and \`idempotent\`.

## Asynchronous work, without an Execution Thing

\`\`\`json
{
  "outcome": { "kind": "accepted", "execution": { "id": "42" } },
  "context": {
    "next": [{
      "ref": "execution.status",
      "input": { "executionId": "42" },
      "guidance": { "level": "recommended" }
    }]
  }
}
\`\`\`

\`ExecutionRef\` is a **logical execution identifier**, not a ThingRef. An implementation may store it however it chooses. The client can follow the next Interaction by invoking \`execution.status\` with the provided input. A streaming Event may similarly take \`executionId\` as input. An application *may* additionally model an execution as a Thing, but ANWA does not require it.

Streaming is observation, not durable execution. There are no guarantees of persistence, replay, exactly-once delivery, auth or remote availability from the in-process adapter.

## Implementation and tooling

- \`src/anwa-v02.mjs\`: executable Interaction-first reference adapter.
- \`src/schema-v02.mjs\`: schema checks and generated TypeScript input/output/Handler type aliases.
- \`spec/anwa-0.2.schema.json\`: machine-readable manifest + Result/Context types.
- \`tools/anwa.mjs\`: \`validate\`, \`generate\`, \`inspect\` based on 0.2.
- \`demo/calculator\`, \`demo/orders\`, \`demo/reports\`: examples with standalone Interactions.
- \`npm test\`, \`npm run validate\`, \`npm run types:orders\`, \`npm run demo\` in GitHub Actions.

**The payload validator implements a subset of JSON Schema 2020-12**, not the full standard. The adapter is an experimental in-memory implementation, not a deployed web service. AI usability has not been measured by a blind independent agent.

## What remains open

Network binding, federated/external API delegation, authorization, schema dialect completeness, typed domain error detail schemas, policy exposure, asynchronous durability and standard conformance. The model does not assume that a natural-language description or a side-effect flag is authoritative.

## Primary specification references

- [W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description11/) — Thing-bound Property/Action/Event Affordances. Interaction-first ANWA concepts do not claim TD 1.1 conformance.
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12).
- [RFC 8288 Web Linking](https://www.rfc-editor.org/info/rfc8288) — a source for relationship semantics, not a required ANWA Context shape.

[README](../README.md) · [Demo guide](../demo/README.md) · [Prior v0.1 contract](anwa-0.1.md)
