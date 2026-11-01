import {
  validateManifest,
  type DataSchema,
  type Manifest,
  type InteractionDefinition,
} from "./schema-tools.ts";
export type { Manifest } from "./schema-tools.ts";

import type {
  BindingsFor,
  GuardsFor,
  GuardNames,
  GuardDecision,
  Refs,
  ExecutableRefs,
  ObservableRefs,
  InputOf,
  Operation,
  OutputOf,
  ErrorCodes,
} from "./contracts.ts";

/** Supplied only by a trusted authentication adapter. Never derive this from Interaction input. */
export interface VerifiedCaller {
  readonly subject: string;
  readonly claims?: Readonly<Record<string, unknown>>;
}
export interface RequestContext {
  readonly caller?: VerifiedCaller | null;
}
export interface DiscoveryArgs {
  readonly ref: string;
  readonly caller: VerifiedCaller | null;
}
export type DiscoveryPolicy = (args: DiscoveryArgs) => boolean;

/** Failed Event subscription: no Event handler ran or produced data. */
export class ObservationDenied extends Error {
  constructor(readonly code: string) {
    super("Event subscription denied");
    this.name = "ObservationDenied";
  }
}

export interface DomainError<C extends string = string> {
  code: C;
  message?: string;
  details?: unknown;
  effects?: "none" | "occurred" | "unknown";
}
export type Result<T = unknown, C extends string = string> =
  { ok: true; value: T } | { ok: false; error: DomainError<C> };
export type Accepted = { kind: "accepted"; execution: { id: string } };
export type Outcome<T = unknown, C extends string = string> =
  { kind: "settled"; result: Result<T, C> } | Accepted;
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
export interface SettledResponse<T = unknown, C extends string = string> {
  outcome: { kind: "settled"; result: Result<T, C> };
  context: { next: NextInteraction[] };
}
export interface AcceptedResponse {
  outcome: Accepted;
  context: { next: NextInteraction[] };
}
export type InteractionResponse<T = unknown, C extends string = string> =
  SettledResponse<T, C> | AcceptedResponse;

type RuntimeArgs = {
  ref: string;
  input: any;
  app: AnwaApp<any>;
  caller: VerifiedCaller | null;
};
type RuntimeRun = (args: RuntimeArgs & { cursor?: number }) => unknown;
type RuntimeBinding =
  | RuntimeRun
  | {
      run: RuntimeRun;
      onDenied?: (
        args: RuntimeArgs & { error: DomainError },
      ) => NextInteraction[] | Promise<NextInteraction[]>;
    };
type RuntimeGuard = (
  args: RuntimeArgs,
) => GuardDecision | Promise<GuardDecision>;

export const ok = <T>(value: T): { ok: true; value: T } => ({
  ok: true,
  value,
});
export const fail = <C extends string>(
  code: C,
  message?: string,
  extra: Partial<DomainError<C>> = {},
): { ok: false; error: DomainError<C> } => ({
  ok: false,
  error: { code, ...(message ? { message } : {}), ...extra },
});
export const accepted = (id: string): Accepted => ({
  kind: "accepted",
  execution: { id: String(id) },
});

export function reply<T>(
  result: { ok: true; value: T },
  next?: NextInteraction[],
): SettledResponse<T, never>;
export function reply<C extends string>(
  result: { ok: false; error: DomainError<C> },
  next?: NextInteraction[],
): SettledResponse<never, C>;
export function reply<T, C extends string>(
  result: Result<T, C>,
  next?: NextInteraction[],
): SettledResponse<T, C>;
export function reply(
  result: Accepted,
  next?: NextInteraction[],
): AcceptedResponse;
export function reply(
  result: Result<unknown> | Accepted,
  next: NextInteraction[] = [],
): InteractionResponse {
  return "kind" in result
    ? { outcome: result, context: { next } }
    : { outcome: { kind: "settled", result }, context: { next } };
}
const unexpected = (): InteractionResponse =>
  reply(
    fail("UNEXPECTED_ERROR", "Unexpected application failure", {
      effects: "unknown",
    }),
  );
const own = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function verifiedCaller(request?: RequestContext): VerifiedCaller | null {
  if (request === undefined) return null;
  if (
    !request ||
    typeof request !== "object" ||
    Array.isArray(request) ||
    Object.keys(request).some((key) => key !== "caller")
  )
    throw Error("Invalid trusted RequestContext");
  const caller = request.caller ?? null;
  if (caller === null) return null;
  if (
    typeof caller !== "object" ||
    Array.isArray(caller) ||
    typeof caller.subject !== "string" ||
    !caller.subject.trim()
  )
    throw Error(
      "Invalid verified Caller; authentication belongs to the Adapter",
    );
  if (
    caller.claims !== undefined &&
    (!caller.claims ||
      typeof caller.claims !== "object" ||
      Array.isArray(caller.claims))
  )
    throw Error("Caller claims must be a record");
  return Object.freeze({
    subject: caller.subject,
    ...(caller.claims ? { claims: Object.freeze({ ...caller.claims }) } : {}),
  });
}

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

export class AnwaApp<const M extends Manifest = Manifest> {
  readonly schema: M;
  private readonly handlers = new Map<string, RuntimeBinding>();
  private guards: Record<string, RuntimeGuard> = {};
  private readonly publicRefs = new Set<string>();
  private discoveryPolicy?: DiscoveryPolicy;

  constructor(schema: M) {
    const errors = validateManifest(schema);
    if (errors.length)
      throw Error(
        "ANWA schema invalid:\n" +
          errors.map((x) => x.path + ": " + x.message).join("\n"),
      );
    this.schema = schema;
  }

  bind(
    handlers: BindingsFor<M>,
    ...settings: GuardNames<M> extends never
      ? [
          options: {
            public?: readonly Refs<M>[];
            discoverable?: DiscoveryPolicy;
            guards?: GuardsFor<M>;
          },
        ]
      : [
          options: {
            public?: readonly Refs<M>[];
            discoverable?: DiscoveryPolicy;
            guards: GuardsFor<M>;
          },
        ]
  ): this {
    const options = settings[0] as {
      public?: readonly Refs<M>[];
      discoverable?: DiscoveryPolicy;
      guards?: GuardsFor<M>;
    };
    const guards = options.guards ?? ({} as GuardsFor<M>);
    const publicRefs = options.public ?? [];
    if (!Array.isArray(publicRefs))
      throw Error("Public Interaction references must be an array");
    const publicSet = new Set<string>();
    for (const ref of publicRefs) {
      if (typeof ref !== "string" || !own(this.schema.interactions, ref))
        throw Error("Undeclared public Interaction: " + String(ref));
      if (this.schema.interactions[ref].guard)
        throw Error(
          "Guarded Interaction cannot bypass Guard via public: " + ref,
        );
      publicSet.add(ref);
    }
    if (
      options.discoverable !== undefined &&
      typeof options.discoverable !== "function"
    )
      throw Error("discoverable must be a function");
    const rawHandlers = handlers as Record<string, unknown>;
    const rawGuards = guards as Record<string, unknown>;
    for (const [ref, spec] of Object.entries(this.schema.interactions)) {
      const binding = rawHandlers[ref];
      if (spec.guard) {
        if (typeof rawGuards[spec.guard] !== "function")
          throw Error("Missing Guard: " + spec.guard);
        if (
          !binding ||
          typeof binding !== "object" ||
          Array.isArray(binding) ||
          typeof (binding as { run?: unknown }).run !== "function"
        )
          throw Error("Guarded Interaction requires {run}: " + ref);
        if (
          spec.kind !== "event" &&
          typeof (binding as { onDenied?: unknown }).onDenied !== "function"
        )
          throw Error("Guarded Query/Action requires {run, onDenied}: " + ref);
      } else if (!publicSet.has(ref)) {
        throw Error(
          "Interaction requires a named Guard or explicit public declaration: " +
            ref,
        );
      } else if (typeof binding !== "function") {
        throw Error("Unbound or invalid Interaction: " + ref);
      }
    }
    for (const ref of Object.keys(rawHandlers))
      if (!own(this.schema.interactions, ref))
        throw Error("Unknown or invalid interaction binding: " + ref);
    this.handlers.clear();
    for (const [ref, value] of Object.entries(rawHandlers))
      this.handlers.set(ref, value as RuntimeBinding);
    this.guards = rawGuards as Record<string, RuntimeGuard>;
    this.publicRefs.clear();
    for (const ref of publicSet) this.publicRefs.add(ref);
    this.discoveryPolicy = options.discoverable;
    return this;
  }

  private resolve(ref: string): {
    spec: InteractionDefinition;
    handler: RuntimeBinding;
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

  private canDiscover(ref: string, caller: VerifiedCaller | null): boolean {
    if (this.publicRefs.has(ref)) return true;
    if (
      !own(this.schema.interactions, ref) ||
      !this.schema.interactions[ref].guard
    )
      return false;
    try {
      return this.discoveryPolicy?.({ ref, caller }) === true;
    } catch {
      return false; // Fail closed if discovery policy cannot decide.
    }
  }

  /** Discovery is filtered separately from invocation Guards; it has no resource input. */
  catalog(request?: RequestContext) {
    const caller = verifiedCaller(request);
    return {
      anwa: this.schema.anwa,
      entrypoints: this.schema.entrypoints.filter((ref) =>
        this.canDiscover(ref, caller),
      ),
      interactions: Object.entries(this.schema.interactions)
        .filter(([ref]) => this.canDiscover(ref, caller))
        .map(([ref, spec]) => ({
          ref,
          kind: spec.kind,
          description: spec.description,
        })),
    };
  }
  describe(ref: string, request?: RequestContext) {
    const caller = verifiedCaller(request);
    if (!this.canDiscover(ref, caller))
      throw Error("Unknown or undiscoverable Interaction");
    return { ref, ...this.resolve(ref).spec };
  }
  discover(ref: string, request?: RequestContext) {
    return { description: this.describe(ref, request), context: { next: [] } };
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

  /** Runtime enforces the named Guard before run; onDenied only builds this Interaction's Context. */
  async interact<R extends Refs<M> & ExecutableRefs<M>>(
    ref: R,
    ...args: string extends Refs<M>
      ? [input?: unknown, request?: RequestContext]
      : InputOf<Operation<M, R>> extends undefined
        ? [input?: undefined, request?: RequestContext]
        : [input: InputOf<Operation<M, R>>, request?: RequestContext]
  ): Promise<
    InteractionResponse<
      OutputOf<Operation<M, R>>,
      ErrorCodes<Operation<M, R>> | "INVALID_INPUT" | "UNEXPECTED_ERROR"
    >
  > {
    return this.interactInternal(ref, args[0], args[1]) as Promise<
      InteractionResponse<
        OutputOf<Operation<M, R>>,
        ErrorCodes<Operation<M, R>> | "INVALID_INPUT" | "UNEXPECTED_ERROR"
      >
    >;
  }

  /** Follow a runtime-selected candidate. Dynamic inputs are checked against the public schema. */
  async follow(
    candidate: NextInteraction,
    request?: RequestContext,
  ): Promise<InteractionResponse> {
    return this.interactInternal(candidate.ref, candidate.input, request);
  }

  private async interactInternal(
    ref: string,
    input?: unknown,
    request?: RequestContext,
  ): Promise<InteractionResponse> {
    const caller = verifiedCaller(request);
    const { spec, handler } = this.resolve(ref);
    if (spec.kind === "event")
      throw Error("Use observe for Event Interactions");
    const error = spec.input
      ? checkPayload(spec.input, input)
      : input === undefined
        ? null
        : "Unexpected input";
    if (error) return reply(fail("INVALID_INPUT", error));
    try {
      const params = { ref, input, app: this, caller };
      let response: InteractionResponse;
      if (spec.guard) {
        const decision = await this.guards[spec.guard](params);
        if (
          typeof decision?.allowed !== "boolean" ||
          (!decision.allowed && !decision.error?.code)
        )
          throw Error("Invalid Guard decision");
        const guarded = handler as Extract<RuntimeBinding, { run: RuntimeRun }>;
        if (!decision.allowed) {
          this.declaredError(spec, decision.error);
          const next = await guarded.onDenied!({
            ...params,
            error: decision.error,
          });
          response = reply({ ok: false, error: decision.error }, next);
        } else {
          response = (await guarded.run(params)) as InteractionResponse;
        }
      } else {
        response = (await (handler as RuntimeRun)(
          params,
        )) as InteractionResponse;
      }
      if (!response || !response.outcome)
        throw Error("Handler must return reply(...)");
      const outcome = response.outcome;
      if (outcome.kind === "accepted") {
        if (
          spec.kind !== "action" ||
          typeof outcome.execution?.id !== "string" ||
          !outcome.execution.id
        )
          throw Error("Invalid accepted outcome");
      } else if (outcome.kind === "settled") {
        const result = outcome.result;
        if (typeof result?.ok !== "boolean") throw Error("Invalid Result");
        if (result.ok) {
          if (spec.output && checkPayload(spec.output, result.value))
            throw Error("Invalid handler output");
        } else this.declaredError(spec, result.error);
      } else throw Error("Unknown outcome");
      this.validateContext(response.context, ref);
      // Avoid advertising private Interaction names in a result delivered to this caller.
      return {
        ...response,
        context: {
          next: response.context.next.filter((choice) =>
            this.canDiscover(choice.ref, caller),
          ),
        },
      };
    } catch {
      return unexpected();
    }
  }

  /** Async Guards are evaluated when an Event stream is first consumed, before the Event handler starts. */
  observe<R extends Refs<M> & ObservableRefs<M>>(
    ref: R,
    ...args: string extends Refs<M>
      ? [
          input?: unknown,
          options?: { cursor?: number },
          request?: RequestContext,
        ]
      : InputOf<Operation<M, R>> extends undefined
        ? [
            input?: undefined,
            options?: { cursor?: number },
            request?: RequestContext,
          ]
        : [
            input: InputOf<Operation<M, R>>,
            options?: { cursor?: number },
            request?: RequestContext,
          ]
  ): AsyncIterable<unknown> {
    const [input, options = {}, request] = args;
    const caller = verifiedCaller(request);
    const { spec, handler } = this.resolve(ref);
    if (spec.kind !== "event")
      throw Error("Only Event Interactions may be observed");
    const invalid = spec.input
      ? checkPayload(spec.input, input)
      : input === undefined
        ? null
        : "Unexpected event input";
    if (invalid) throw Error("Invalid event input");
    return (async function* (runtime: AnwaApp<M>): AsyncGenerator<unknown> {
      const params = { ref, input, app: runtime, caller };
      if (spec.guard) {
        let decision: GuardDecision;
        try {
          decision = await runtime.guards[spec.guard](params);
          if (
            typeof decision?.allowed !== "boolean" ||
            (!decision.allowed && !decision.error?.code)
          )
            throw Error("Invalid Guard decision");
          if (!decision.allowed) runtime.declaredError(spec, decision.error);
        } catch {
          throw new ObservationDenied("UNEXPECTED_ERROR");
        }
        if (!decision.allowed) throw new ObservationDenied(decision.error.code);
      }
      const run = typeof handler === "function" ? handler : handler.run;
      const stream = run({ ...params, ...options });
      if (
        !stream ||
        typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] !==
          "function"
      )
        throw Error("Event must return AsyncIterable");
      yield* stream as AsyncIterable<unknown>;
    })(this);
  }
}
