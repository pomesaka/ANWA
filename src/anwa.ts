import {
  checkPayload,
  validateGuardDecision,
  validateResponse,
  type ContractViolation,
} from "./runtime/validation.ts";
import { Result as NeverthrowResult, ResultAsync, okAsync } from "neverthrow";
import { match } from "ts-pattern";
import {
  validateManifest,
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
export type ObservationDenied = Error & {
  name: "ObservationDenied";
  code: string;
};
export const observationDenied = (code: string): ObservationDenied =>
  Object.assign(new Error("Event subscription denied"), {
    name: "ObservationDenied" as const,
    code,
  });
export const isObservationDenied = (
  error: unknown,
): error is ObservationDenied =>
  error instanceof Error &&
  error.name === "ObservationDenied" &&
  "code" in error &&
  typeof error.code === "string";

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

export interface Catalog {
  anwa: "0.2";
  entrypoints: string[];
  interactions: Array<{
    ref: string;
    kind: InteractionDefinition["kind"];
    description: string;
  }>;
}
export type Description = { ref: string } & InteractionDefinition;
export interface Discovery {
  description: Description;
  context: { next: NextInteraction[] };
}

/** Structural API; implementations have no prototype or receiver dependency. */
export interface AnwaApp<M extends Manifest = Manifest> {
  readonly schema: M;
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
  ): AnwaApp<M>;
  catalog(request?: RequestContext): Catalog;
  describe(ref: string, request?: RequestContext): Description;
  discover(ref: string, request?: RequestContext): Discovery;
  interact<R extends Refs<M> & ExecutableRefs<M>>(
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
  >;
  follow(
    candidate: NextInteraction,
    request?: RequestContext,
  ): Promise<InteractionResponse>;
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
  ): AsyncIterable<unknown>;
}

interface RuntimeBindings {
  handlersByRef: ReadonlyMap<string, RuntimeBinding>;
  guardBindings: Readonly<Record<string, RuntimeGuard>>;
  exposedRefs: ReadonlySet<string>;
  discoveryPolicy?: DiscoveryPolicy;
}

export function createAnwaApp<const M extends Manifest>(schema: M): AnwaApp<M> {
  const diagnostics = validateManifest(schema);
  if (diagnostics.length)
    throw Error(
      "ANWA schema invalid:\n" +
        diagnostics.map((x) => x.path + ": " + x.message).join("\n"),
    );
  return createRuntime(schema, {
    handlersByRef: new Map(),
    guardBindings: {},
    exposedRefs: new Set(),
  });
}

function createRuntime<const M extends Manifest>(
  schema: M,
  bindings: RuntimeBindings,
): AnwaApp<M> {
  const { handlersByRef, guardBindings, exposedRefs, discoveryPolicy } =
    bindings;

  function bind(
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
  ): AnwaApp<M> {
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
      if (typeof ref !== "string" || !own(schema.interactions, ref))
        throw Error("Undeclared public Interaction: " + String(ref));
      if (schema.interactions[ref].guard)
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
    for (const [ref, spec] of Object.entries(schema.interactions)) {
      validateBinding(ref, spec, rawHandlers[ref], rawGuards, publicSet);
    }
    for (const ref of Object.keys(rawHandlers))
      if (!own(schema.interactions, ref))
        throw Error("Unknown or invalid interaction binding: " + ref);
    return createRuntime(schema, {
      handlersByRef: new Map(
        Object.entries(rawHandlers) as Array<[string, RuntimeBinding]>,
      ),
      guardBindings: Object.freeze({ ...rawGuards }) as Record<
        string,
        RuntimeGuard
      >,
      exposedRefs: publicSet,
      discoveryPolicy: options.discoverable,
    });
  }

  function validateBinding(
    ref: string,
    spec: InteractionDefinition,
    binding: unknown,
    guards: Record<string, unknown>,
    publicRefs: ReadonlySet<string>,
  ): void {
    if (spec.guard) return validateGuardedBinding(ref, spec, binding, guards);
    if (!publicRefs.has(ref))
      throw Error(
        "Interaction requires a named Guard or explicit public declaration: " +
          ref,
      );
    if (typeof binding !== "function")
      throw Error("Unbound or invalid Interaction: " + ref);
  }

  function validateGuardedBinding(
    ref: string,
    spec: InteractionDefinition,
    binding: unknown,
    guards: Record<string, unknown>,
  ): void {
    if (typeof guards[spec.guard!] !== "function")
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
  }

  function resolve(ref: string): {
    spec: InteractionDefinition;
    handler: RuntimeBinding;
  } {
    if (
      typeof ref !== "string" ||
      !own(schema.interactions, ref) ||
      !handlersByRef.has(ref)
    )
      throw Error("Unknown or unbound InteractionRef");
    return {
      spec: schema.interactions[ref],
      handler: handlersByRef.get(ref)!,
    };
  }

  function canDiscover(ref: string, caller: VerifiedCaller | null): boolean {
    if (exposedRefs.has(ref)) return true;
    if (!own(schema.interactions, ref) || !schema.interactions[ref].guard)
      return false;
    return NeverthrowResult.fromThrowable(
      () => discoveryPolicy?.({ ref, caller }) === true,
      () => ({ kind: "discovery-policy-failure" }) as const,
    )().unwrapOr(false); // Fail closed if the application policy throws.
  }

  function catalog(request?: RequestContext) {
    const caller = verifiedCaller(request);
    return {
      anwa: schema.anwa,
      entrypoints: schema.entrypoints.filter((ref) => canDiscover(ref, caller)),
      interactions: Object.entries(schema.interactions)
        .filter(([ref]) => canDiscover(ref, caller))
        .map(([ref, spec]) => ({
          ref,
          kind: spec.kind,
          description: spec.description,
        })),
    };
  }

  function describe(ref: string, request?: RequestContext) {
    const caller = verifiedCaller(request);
    if (!canDiscover(ref, caller))
      throw Error("Unknown or undiscoverable Interaction");
    return { ref, ...resolve(ref).spec };
  }

  function discover(ref: string, request?: RequestContext) {
    return { description: describe(ref, request), context: { next: [] } };
  }

  async function interact<R extends Refs<M> & ExecutableRefs<M>>(
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
    return interactInternal(ref, args[0], args[1]) as Promise<
      InteractionResponse<
        OutputOf<Operation<M, R>>,
        ErrorCodes<Operation<M, R>> | "INVALID_INPUT" | "UNEXPECTED_ERROR"
      >
    >;
  }

  async function follow(
    candidate: NextInteraction,
    request?: RequestContext,
  ): Promise<InteractionResponse> {
    return interactInternal(candidate.ref, candidate.input, request);
  }

  async function interactInternal(
    ref: string,
    input?: unknown,
    request?: RequestContext,
  ): Promise<InteractionResponse> {
    const caller = verifiedCaller(request);
    const { spec, handler } = resolve(ref);
    if (spec.kind === "event")
      throw Error("Use observe for Event Interactions");
    const inputIssue = spec.input
      ? checkPayload(spec.input, input, "$", schema.$defs)
      : input === undefined
        ? null
        : "Unexpected input";
    if (inputIssue) return reply(fail("INVALID_INPUT", inputIssue));
    const params: RuntimeArgs = { ref, input, app: api, caller };
    return dispatch(spec, handler, params)
      .andThen((response) =>
        attempt(() =>
          validateResponse(schema, ref, response, (candidate) =>
            handlersByRef.has(candidate),
          ),
        ).andThen((validated) => validated),
      )
      .map((response) => ({
        ...response,
        context: {
          next: response.context.next.filter((candidate) =>
            canDiscover(candidate.ref, caller),
          ),
        },
      }))
      .match(
        (response) => response,
        () => unexpected(),
      );
  }

  function attempt<T>(
    operation: () => T | Promise<T>,
  ): ResultAsync<T, ContractViolation> {
    return ResultAsync.fromThrowable(
      async () => operation(),
      (): ContractViolation => ({ kind: "callback-failed" }),
    )();
  }

  function evaluateGuard(
    spec: InteractionDefinition,
    params: RuntimeArgs,
  ): ResultAsync<GuardDecision, ContractViolation> {
    if (!spec.guard) return okAsync({ allowed: true });
    return attempt(() => guardBindings[spec.guard!](params)).andThen(
      (decision) => validateGuardDecision(spec, decision),
    );
  }

  function dispatch(
    spec: InteractionDefinition,
    handler: RuntimeBinding,
    params: RuntimeArgs,
  ): ResultAsync<unknown, ContractViolation> {
    const run = typeof handler === "function" ? handler : handler.run;
    return evaluateGuard(spec, params).andThen((decision) =>
      match(decision)
        .with({ allowed: true }, () => attempt(() => run(params)))
        .with({ allowed: false }, ({ error }) => {
          const guarded = handler as Extract<
            RuntimeBinding,
            { run: RuntimeRun }
          >;
          return attempt(() => guarded.onDenied!({ ...params, error })).map(
            (next) => reply({ ok: false, error }, next),
          );
        })
        .exhaustive(),
    );
  }

  function observe<R extends Refs<M> & ObservableRefs<M>>(
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
    const { spec, handler } = resolve(ref);
    if (spec.kind !== "event")
      throw Error("Only Event Interactions may be observed");
    const invalid = spec.input
      ? checkPayload(spec.input, input, "$", schema.$defs)
      : input === undefined
        ? null
        : "Unexpected event input";
    if (invalid) throw Error("Invalid event input");
    return (async function* (): AsyncGenerator<unknown> {
      const params = { ref, input, app: api, caller };
      const decision = await evaluateGuard(spec, params).match(
        (value) => value,
        () => {
          throw observationDenied("UNEXPECTED_ERROR");
        },
      );
      if (!decision.allowed) throw observationDenied(decision.error.code);
      const run = typeof handler === "function" ? handler : handler.run;
      const stream = run({ ...params, ...options });
      if (
        !stream ||
        typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] !==
          "function"
      )
        throw Error("Event must return AsyncIterable");
      yield* stream as AsyncIterable<unknown>;
    })();
  }

  const api: AnwaApp<M> = Object.freeze({
    schema,
    bind,
    catalog,
    describe,
    discover,
    interact,
    follow,
    observe,
  });
  return api;
}
