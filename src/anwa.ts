import {
  validateManifest,
  type DataSchema,
  type Manifest,
  type InteractionDefinition,
} from "./schema-tools.ts";
export type { Manifest } from "./schema-tools.ts";

export interface DomainError {
  code: string;
  message?: string;
  details?: unknown;
  effects?: "none" | "occurred" | "unknown";
}
export type Result<T = unknown> =
  { ok: true; value: T } | { ok: false; error: DomainError };
export type Accepted = { kind: "accepted"; execution: { id: string } };
export type Outcome<T = unknown> =
  { kind: "settled"; result: Result<T> } | Accepted;
export interface NextInteraction {
  ref: string;
  input?: unknown;
  guidance?: {
    kind?: "retry";
    level?: "required" | "recommended" | "available";
  };
  when?: { after: string };
  applicability?: {
    state: "available" | "blocked" | "unknown";
    reason?: string;
  };
}
export interface InteractionResponse<T = unknown> {
  outcome: Outcome<T>;
  context: { next: NextInteraction[] };
}
export interface HandlerArgs {
  ref: string;
  input: any;
  app: AnwaApp;
}
export type InteractionHandler = (
  args: HandlerArgs,
) => InteractionResponse | Promise<InteractionResponse>;
export type EventHandler = (
  args: HandlerArgs & { cursor?: number },
) => AsyncIterable<unknown>;
export type GuardDecision =
  { allowed: true } | { allowed: false; error: DomainError };
export type Guard = (
  args: HandlerArgs,
) => GuardDecision | Promise<GuardDecision>;
export type Bindings = Record<string, InteractionHandler | EventHandler>;
export type GuardBindings = Record<string, Guard>;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (
  code: string,
  message?: string,
  extra: Partial<DomainError> = {},
): Result<never> => ({
  ok: false,
  error: { code, ...(message ? { message } : {}), ...extra },
});
export const accepted = (id: string): Accepted => ({
  kind: "accepted",
  execution: { id: String(id) },
});
export const reply = <T>(
  result: Result<T> | Accepted,
  next: NextInteraction[] = [],
): InteractionResponse<T> => ({
  outcome:
    "kind" in result && result.kind === "accepted"
      ? result
      : { kind: "settled", result },
  context: { next },
});
const unexpected = (): InteractionResponse =>
  reply(
    fail("UNEXPECTED_ERROR", "Unexpected application failure", {
      effects: "unknown",
    }),
  );
const own = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);
const duration =
  /^P(?=.*\d)(?:\d+D)?(?:T(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/;
const levels = new Set(["required", "recommended", "available"]);

function checkPayload(
  schema: DataSchema,
  value: unknown,
  path = "$",
): string | null {
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value)))
    return path + " not in enum";
  const valid =
    schema.type === "object"
      ? value !== null && typeof value === "object" && !Array.isArray(value)
      : schema.type === "array"
        ? Array.isArray(value)
        : schema.type === "integer"
          ? Number.isInteger(value)
          : schema.type === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : schema.type === "null"
              ? value === null
              : typeof value === schema.type;
  if (!valid) return path + " must be " + schema.type;
  if (schema.type === "object") {
    const obj = value as Record<string, unknown>;
    for (const field of schema.required ?? [])
      if (!own(obj, field)) return path + "." + field + " required";
    for (const [field, child] of Object.entries(obj)) {
      const fieldSchema = schema.properties?.[field];
      if (!fieldSchema) {
        if (schema.additionalProperties === false)
          return path + "." + field + " not allowed";
      } else {
        const error = checkPayload(fieldSchema, child, path + "." + field);
        if (error) return error;
      }
    }
  }
  if (schema.type === "array" && schema.items) {
    for (const [index, item] of (value as unknown[]).entries()) {
      const error = checkPayload(schema.items, item, path + "[" + index + "]");
      if (error) return error;
    }
  }
  return null;
}

export class AnwaApp {
  readonly schema: Manifest;
  private readonly handlers = new Map<
    string,
    InteractionHandler | EventHandler
  >();
  private guards: GuardBindings = {};

  constructor(schema: Manifest) {
    const errors = validateManifest(schema);
    if (errors.length)
      throw Error(
        "ANWA schema invalid:\n" +
          errors.map((x) => x.path + ": " + x.message).join("\n"),
      );
    this.schema = schema;
  }

  bind(
    handlers: Bindings,
    { guards = {} }: { guards?: GuardBindings } = {},
  ): this {
    for (const [ref, spec] of Object.entries(this.schema.interactions)) {
      if (typeof handlers[ref] !== "function")
        throw Error("Unbound interaction: " + ref);
      if (spec.guard && typeof guards[spec.guard] !== "function")
        throw Error("Missing Guard: " + spec.guard);
    }
    for (const [ref, handler] of Object.entries(handlers)) {
      if (!own(this.schema.interactions, ref) || typeof handler !== "function")
        throw Error("Unknown or invalid interaction binding: " + ref);
    }
    this.handlers.clear();
    for (const [ref, handler] of Object.entries(handlers))
      this.handlers.set(ref, handler);
    this.guards = guards;
    return this;
  }

  private resolve(ref: string): {
    spec: InteractionDefinition;
    handler: InteractionHandler | EventHandler;
  } {
    if (
      typeof ref !== "string" ||
      !own(this.schema.interactions, ref) ||
      !this.handlers.has(ref)
    )
      throw Error("Unknown or unbound InteractionRef");
    return {
      spec: this.schema.interactions[ref],
      handler: this.handlers.get(ref)!,
    };
  }

  catalog() {
    return {
      anwa: this.schema.anwa,
      entrypoints: [...this.schema.entrypoints],
      interactions: Object.entries(this.schema.interactions).map(
        ([ref, spec]) => ({
          ref,
          kind: spec.kind,
          description: spec.description,
        }),
      ),
    };
  }
  describe(ref: string) {
    return { ref, ...this.resolve(ref).spec };
  }
  discover(ref: string) {
    return { description: this.describe(ref), context: { next: [] } };
  }

  private declaredError(spec: InteractionDefinition, error: DomainError): void {
    if (
      typeof error?.code !== "string" ||
      ["INVALID_INPUT", "UNEXPECTED_ERROR"].includes(error.code) ||
      own(error, "retry") ||
      !own(spec.errors ?? {}, error.code)
    ) {
      throw Error("Undeclared domain error");
    }
  }

  /** Guard evaluation is explicitly called by the owning handler so it can return its own Context. */
  async assess(ref: string, input: unknown): Promise<GuardDecision> {
    const { spec } = this.resolve(ref);
    if (!spec.guard) return { allowed: true };
    const decision = await this.guards[spec.guard]({ ref, input, app: this });
    if (
      typeof decision?.allowed !== "boolean" ||
      (!decision.allowed && !decision.error?.code)
    )
      throw Error("Invalid Guard decision");
    if (!decision.allowed) this.declaredError(spec, decision.error);
    return decision;
  }

  private validateContext(context: unknown, source: string): void {
    if (
      !context ||
      typeof context !== "object" ||
      Array.isArray(context) ||
      Object.keys(context).some((key) => key !== "next") ||
      !Array.isArray((context as { next?: unknown }).next)
    )
      throw Error("Invalid Context");
    for (const choice of (context as { next: unknown[] }).next) {
      if (
        !choice ||
        typeof choice !== "object" ||
        Array.isArray(choice) ||
        Object.keys(choice).some(
          (key) =>
            !["ref", "input", "guidance", "when", "applicability"].includes(
              key,
            ),
        )
      )
        throw Error("Invalid next candidate");
      const next = choice as NextInteraction;
      const { spec } = this.resolve(next.ref);
      if (
        own(next, "input") &&
        (!spec.input || checkPayload(spec.input, next.input))
      )
        throw Error("Invalid bound next input");
      if (next.guidance !== undefined) {
        const guidance = next.guidance;
        if (
          !guidance ||
          typeof guidance !== "object" ||
          Array.isArray(guidance) ||
          !Object.keys(guidance).length ||
          Object.keys(guidance).some(
            (key) => !["kind", "level"].includes(key),
          ) ||
          (guidance.kind !== undefined && guidance.kind !== "retry") ||
          (guidance.level !== undefined && !levels.has(guidance.level))
        )
          throw Error("Invalid guidance");
        if (guidance.kind === "retry" && next.ref !== source)
          throw Error("Retry must use source InteractionRef");
      }
      if (next.when !== undefined) {
        if (
          !next.when ||
          typeof next.when !== "object" ||
          Array.isArray(next.when) ||
          Object.keys(next.when).length !== 1 ||
          !duration.test(next.when.after)
        )
          throw Error("Invalid timing");
      }
      if (next.applicability !== undefined) {
        const value = next.applicability;
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).some(
            (key) => !["state", "reason"].includes(key),
          ) ||
          !["available", "blocked", "unknown"].includes(value.state) ||
          (value.reason !== undefined && typeof value.reason !== "string")
        )
          throw Error("Invalid applicability");
      }
    }
  }

  /** Each handler owns its Context; there is no application-wide context resolver. */
  async interact(ref: string, input?: unknown): Promise<InteractionResponse> {
    const { spec, handler } = this.resolve(ref);
    if (spec.kind === "event")
      throw Error("Use observe for event interactions");
    const error = spec.input
      ? checkPayload(spec.input, input)
      : input === undefined
        ? null
        : "Unexpected input";
    if (error) return reply(fail("INVALID_INPUT", error));
    try {
      const response = await (handler as InteractionHandler)({
        ref,
        input,
        app: this,
      });
      if (!response || !response.outcome)
        throw Error("Handler must return reply(...)");
      const outcome = response.outcome;
      if (outcome.kind === "accepted") {
        if (typeof outcome.execution?.id !== "string" || !outcome.execution.id)
          throw Error("Invalid ExecutionRef");
      } else if (outcome.kind === "settled") {
        const result = outcome.result;
        if (typeof result?.ok !== "boolean") throw Error("Invalid Result");
        if (result.ok) {
          if (spec.output && checkPayload(spec.output, result.value))
            throw Error("Invalid handler output");
        } else this.declaredError(spec, result.error);
      } else throw Error("Unknown outcome");
      this.validateContext(response.context, ref);
      return response;
    } catch {
      return unexpected();
    }
  }

  observe(
    ref: string,
    input?: unknown,
    options: { cursor?: number } = {},
  ): AsyncIterable<unknown> {
    const { spec, handler } = this.resolve(ref);
    if (spec.kind !== "event")
      throw Error("Only event Interactions may be observed");
    const error = spec.input
      ? checkPayload(spec.input, input)
      : input === undefined
        ? null
        : "Unexpected event input";
    if (error) throw Error("Invalid event input");
    const stream = (handler as EventHandler)({
      ref,
      input,
      app: this,
      ...options,
    });
    if (!stream?.[Symbol.asyncIterator])
      throw Error("Event must return AsyncIterable");
    return stream;
  }
}
