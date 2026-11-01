import { validateManifest } from "./schema-tools.mjs";
/** Dependency-free ANWA 0.1 in-memory reference adapter; NOT production ready. */
export const thing = (type, id) => ({ type, id: String(id) });
export const interaction = (target, kind, name) => ({ thing: target, kind, name });
export const ok = (value = null) => ({ ok: true, value });
export const fail = (code, message, extra = {}) => ({
  ok: false, error: { code, ...(message ? { message } : {}), ...extra }
});
export const accepted = execution => ({ kind: "accepted", execution });
const emptyContext = () => ({ next: [] });
const GUIDANCE_LEVELS = new Set(["required", "recommended", "available"]);
const AFTER_DURATION = /^P(?=.*\d)(?:\d+D)?(?:T(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const RESERVED_ERRORS = new Set(["INVALID_INPUT", "UNEXPECTED_ERROR"]);
const unexpected = () => fail("UNEXPECTED_ERROR", "Unexpected application failure", {
  effects: "unknown"
});

function validate(schema, value, at = "$") {
  if (!schema) return null;
  if (schema.enum && !schema.enum.some(v => Object.is(v, value))) return at + " is not in enum";
  const t = schema.type;
  const typeOK = t === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
    : t === "array" ? Array.isArray(value)
    : t === "integer" ? Number.isInteger(value)
    : t === "number" ? typeof value === "number" && Number.isFinite(value)
    : t === "null" ? value === null : !t || typeof value === t;
  if (!typeOK) return at + " must be " + t;
  if (t === "object") {
    for (const key of schema.required ?? []) {
      if (!own(value, key)) return at + "." + key + " is required";
    }
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (!sub) {
        if (schema.additionalProperties === false) return at + "." + key + " is not allowed";
      } else {
        const issue = validate(sub, item, at + "." + key);
        if (issue) return issue;
      }
    }
  }
  if (t === "array" && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const issue = validate(schema.items, value[i], at + "[" + i + "]");
      if (issue) return issue;
    }
  }
  return null;
}

function assertRef(ref) {
  if (!ref || typeof ref.type !== "string" || !ref.type ||
      typeof ref.id !== "string" || !ref.id) {
    throw new Error("ThingRef needs nonempty type and string id");
  }
}

export class AnwaApp {
  constructor(schema) {
    const diagnostics = validateManifest(schema);
    if (diagnostics.length) {
      throw new Error("ANWA schema validation failed:\n" +
        diagnostics.map(d => d.path + ": " + d.message).join("\n"));
    }
    this.schema = schema;
    this.bindings = new Map();
  }

  catalog() {
    return {
      anwa: this.schema.anwa,
      things: Object.entries(this.schema.things).map(([type, model]) => ({
        type, title: model.title, description: model.description,
        ...(model.semanticTypes ? { semanticTypes: model.semanticTypes } : {})
      })),
      entrypoints: this.schema.entrypoints
    };
  }

  bind(type, { properties = {}, actions = {}, events = {}, guards = {},
               context = () => emptyContext() }) {
    const model = this.schema.things[type];
    if (!model) throw new Error("Undeclared Thing type: " + type);
    for (const [kind, handlers] of [["properties", properties], ["actions", actions], ["events", events]]) {
      for (const name of Object.keys(model[kind] ?? {})) {
        if (typeof handlers[name] !== "function") {
          throw new Error("Missing " + kind + " implementation: " + type + "." + name);
        }
      }
      for (const name of Object.keys(handlers)) {
        if (!own(model[kind] ?? {}, name)) {
          throw new Error("Undeclared " + kind + " handler: " + type + "." + name);
        }
      }
    }
    for (const [kind, bucket] of [["properties", model.properties], ["actions", model.actions], ["events", model.events]]) {
      for (const [name, spec] of Object.entries(bucket ?? {})) {
        for (const code of Object.keys(spec.errors ?? {})) {
          if (RESERVED_ERRORS.has(code)) {
            throw new Error("Reserved framework error code: " + type + "." + name + "." + code);
          }
        }
        if (kind === "actions" && spec.guard && typeof guards[spec.guard] !== "function") {
          throw new Error("Missing guard implementation: " + type + "." + spec.guard);
        }
      }
    }
    if (typeof context !== "function") throw new Error("context must be a function");
    this.bindings.set(type, { properties, actions, events, guards, context });
    return this;
  }

  #lookup(target, kind, name) {
    assertRef(target);
    const model = this.schema.things[target.type];
    const binding = this.bindings.get(target.type);
    if (!model || !binding) throw new Error("Unknown or unbound Thing: " + target.type);
    if (!kind) return { model, binding };
    const bucket = { property: "properties", action: "actions", event: "events" }[kind];
    if (!bucket || !own(model[bucket] ?? {}, name)) {
      throw new Error("Unknown interaction: " + target.type + "." + kind + "." + name);
    }
    return { model, binding, spec: model[bucket][name], handler: binding[bucket][name] };
  }

  describe(target) {
    const { model } = this.#lookup(target);
    return {
      thing: target, title: model.title, description: model.description,
      ...(model.semanticTypes ? { semanticTypes: model.semanticTypes } : {}),
      interactions: Object.entries({ properties: "property", actions: "action", events: "event" })
        .flatMap(([bucket, kind]) => Object.entries(model[bucket] ?? {}).map(([name, spec]) => ({
          ref: interaction(target, kind, name),
          description: spec.description,
          ...(spec.semanticTypes ? { semanticTypes: spec.semanticTypes } : {}),
          ...(spec.hasSideEffects !== undefined ? { hasSideEffects: spec.hasSideEffects } : {}),
          ...(spec.idempotent !== undefined ? { idempotent: spec.idempotent } : {}),
          ...(spec.input ? { input: spec.input } : {}),
          ...(spec.output ? { output: spec.output } : {}),
          ...(spec.errors ? { errors: spec.errors } : {})
        }))),
      links: model.links ?? {}
    };
  }

  #assertDeclaredError(spec, error) {
    if (typeof error?.code !== "string" || !error.code ||
        RESERVED_ERRORS.has(error.code) || own(error, "retry") ||
        !own(spec.errors ?? {}, error.code)) {
      throw new Error("Undeclared or invalid application error");
    }
  }

  async assess(target, actionName) {
    const { binding, spec } = this.#lookup(target, "action", actionName);
    if (!spec.guard) return { allowed: true };
    const decision = await binding.guards[spec.guard]({ thing: target, app: this });
    if (typeof decision?.allowed !== "boolean" || (!decision.allowed && !decision.error?.code)) {
      throw new Error("Invalid guard decision for " + target.type + "." + actionName);
    }
    if (!decision.allowed) this.#assertDeclaredError(spec, decision.error);
    return decision;
  }

  #context(raw) {
    const result = raw ?? emptyContext();
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        Object.keys(result).some(k => k !== "next") ||
        !Array.isArray(result.next)) {
      throw new Error("Interaction Context must be {next: []}");
    }
    for (const next of result.next) {
      if (!next || typeof next !== "object" || Array.isArray(next) ||
          Object.keys(next).some(k => !["kind", "ref", "guidance", "when", "applicability"].includes(k))) {
        throw new Error("Invalid next-interaction candidate");
      }
      if (next.kind === "discover") {
        if (next.ref?.thing || !next.ref?.type ||
            next.guidance?.kind === "retry") {
          throw new Error("Discover next requires ThingRef and cannot be retry");
        }
        this.#lookup(next.ref);
      } else if (next.kind === undefined) {
        this.#lookup(next.ref?.thing, next.ref?.kind, next.ref?.name);
      } else {
        throw new Error("Unsupported next-interaction kind");
      }
      if (next.guidance !== undefined) {
        const g = next.guidance;
        if (!g || typeof g !== "object" || Array.isArray(g) ||
            Object.keys(g).some(k => !["kind", "level"].includes(k)) ||
            (g.kind !== undefined && g.kind !== "retry") ||
            (g.level !== undefined && !GUIDANCE_LEVELS.has(g.level))) {
          throw new Error("Invalid next-interaction guidance");
        }
      }
      if (next.when !== undefined) {
        const when = next.when;
        if (!when || typeof when !== "object" || Array.isArray(when) ||
            Object.keys(when).length !== 1 || typeof when.after !== "string" ||
            !AFTER_DURATION.test(when.after)) {
          throw new Error("Invalid next-interaction timing");
        }
      }
      if (next.applicability !== undefined) {
        const a = next.applicability;
        if (!a || typeof a !== "object" || Array.isArray(a) ||
            Object.keys(a).some(k => !["state", "reason"].includes(k)) ||
            !["available", "blocked", "unknown"].includes(a.state) ||
            (a.reason !== undefined && typeof a.reason !== "string")) {
          throw new Error("Invalid applicability hint");
        }
      }
    }
    return result;
  }

  async discover(target) {
    const { binding } = this.#lookup(target);
    const raw = await binding.context({ thing: target, phase: "discovery", app: this });
    return { description: this.describe(target), context: this.#context(raw) };
  }

  async interact(ref, input) {
    const { binding, spec, handler } = this.#lookup(ref?.thing, ref?.kind, ref?.name);
    if (ref.kind === "event") throw new Error("Use observe() for EventAffordances");
    const issue = spec.input ? validate(spec.input, input)
      : input === undefined ? null : "Interaction does not accept input";
    let outcome;
    if (issue) {
      outcome = { kind: "settled", result: fail("INVALID_INPUT", issue) };
    } else {
      try {
        const decision = ref.kind === "action"
          ? await this.assess(ref.thing, ref.name) : { allowed: true };
        if (!decision.allowed) {
          outcome = { kind: "settled", result: { ok: false, error: decision.error } };
        } else {
          const result = await handler({ thing: ref.thing, input, app: this });
          if (result?.kind === "accepted") {
            this.#lookup(result.execution);
            outcome = { kind: "accepted", execution: result.execution };
          } else if (typeof result?.ok === "boolean" &&
                     (result.ok ? own(result, "value") : !!result.error?.code)) {
            if (result.ok && spec.output) {
              const bad = validate(spec.output, result.value);
              if (bad) throw new Error("Output contract violated: " + bad);
            }
            if (!result.ok) this.#assertDeclaredError(spec, result.error);
            outcome = { kind: "settled", result };
          } else {
            throw new Error("Handler returned invalid Result");
          }
        }
      } catch {
        // Undeclared domain errors and unexpected exceptions share one opaque framework error.
        outcome = { kind: "settled", result: unexpected() };
      }
    }
    try {
      const raw = await binding.context({
        thing: ref.thing, interaction: ref, outcome, phase: "result", app: this
      });
      return { outcome, context: this.#context(raw) };
    } catch {
      // Handler side effects may already have occurred; do not imply a safe retry.
      return {
        outcome: { kind: "settled", result: unexpected() },
        context: emptyContext()
      };
    }
  }

  observe(ref, options = {}) {
    const { handler } = this.#lookup(ref?.thing, ref?.kind, ref?.name);
    if (ref.kind !== "event") throw new Error("Only EventAffordances may be observed");
    const events = handler({ thing: ref.thing, app: this, ...options });
    if (!events?.[Symbol.asyncIterator]) throw new Error("Event handler must return AsyncIterable");
    return events;
  }
}
