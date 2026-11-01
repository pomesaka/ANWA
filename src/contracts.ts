/** Type-level projection of the JSON Schema subset supported by ANWA. */
import type { Manifest } from "./schema-tools.ts";
import type {
  AnwaApp,
  DomainError,
  AcceptedResponse,
  SettledResponse,
  NextInteraction,
} from "./anwa.ts";

export type Refs<M extends Manifest> = Extract<keyof M["interactions"], string>;
export type Operation<
  M extends Manifest,
  R extends Refs<M>,
> = M["interactions"][R];

export type ExecutableRefs<M extends Manifest> = string extends Refs<M> ? string : {
  [R in Refs<M>]: Operation<M, R> extends {kind: "event"} ? never : R;
}[Refs<M>];
export type ObservableRefs<M extends Manifest> = string extends Refs<M> ? string : {
  [R in Refs<M>]: Operation<M, R> extends {kind: "event"} ? R : never;
}[Refs<M>];

type RequiredKeys<S> = S extends { required: readonly (infer K)[] }
  ? Extract<K, string>
  : never;
type Properties<S> = S extends { properties: infer P } ? P : never;

export type FromDataSchema<S> = S extends { enum: readonly (infer V)[] }
  ? V
  : S extends { type: "string" }
    ? string
    : S extends { type: "number" | "integer" }
      ? number
      : S extends { type: "boolean" }
        ? boolean
        : S extends { type: "null" }
          ? null
          : S extends { type: "array"; items: infer I }
            ? Array<FromDataSchema<I>>
            : S extends { type: "object" }
              ? S extends { properties: object }
                ? {
                    [
                      K in keyof Properties<S> as K extends RequiredKeys<S>
                        ? K
                        : never
                    ]-?: FromDataSchema<Properties<S>[K]>;
                  } & {
                    [
                      K in keyof Properties<S> as K extends RequiredKeys<S>
                        ? never
                        : K
                    ]?: FromDataSchema<Properties<S>[K]>;
                  }
                : Record<string, unknown>
              : unknown;

export type InputOf<S> = S extends { input: infer I }
  ? FromDataSchema<I>
  : "input" extends keyof S
    ? unknown
    : undefined;
export type OutputOf<S> = S extends { output: infer O }
  ? FromDataSchema<O>
  : unknown;
export type ErrorCodes<S> = S extends { errors: infer E }
  ? Extract<keyof E, string>
  : "errors" extends keyof S
    ? string
    : never;

export type ArgsFor<M extends Manifest, R extends Refs<M>> = {
  ref: R;
  input: InputOf<Operation<M, R>>;
  app: AnwaApp<M>;
};
export type GuardArgsFor<M extends Manifest, N extends string> = {
  [R in Refs<M>]: Operation<M, R> extends { guard: N } ? ArgsFor<M, R> : never;
}[Refs<M>];

export type GuardNames<M extends Manifest> = {
  [R in Refs<M>]: Operation<M, R> extends { guard: infer N extends string }
    ? N
    : never;
}[Refs<M>];

type GuardCodes<M extends Manifest, N extends string> = {
  [R in Refs<M>]: Operation<M, R> extends { guard: N }
    ? ErrorCodes<Operation<M, R>>
    : never;
}[Refs<M>];

export type GuardDecision<E extends string = string> =
  { allowed: true } | { allowed: false; error: DomainError<E> };

export type GuardsFor<M extends Manifest> = {
  [N in GuardNames<M>]: (
    args: GuardArgsFor<M, N>,
  ) =>
    GuardDecision<GuardCodes<M, N>> | Promise<GuardDecision<GuardCodes<M, N>>>;
};
export type HandlerResult<S> =
  | SettledResponse<OutputOf<S>, ErrorCodes<S>>
  | (S extends { kind: "action" } ? AcceptedResponse : never);

export type HandlerFor<M extends Manifest, R extends Refs<M>> = (
  args: ArgsFor<M, R>,
) => HandlerResult<Operation<M, R>> | Promise<HandlerResult<Operation<M, R>>>;

export type OnDeniedFor<M extends Manifest, R extends Refs<M>> = (
  args: ArgsFor<M, R> & { error: DomainError<ErrorCodes<Operation<M, R>>> },
) => NextInteraction[] | Promise<NextInteraction[]>;

export type BindingsFor<M extends Manifest> = {
  [R in Refs<M>]: Operation<M, R> extends { kind: "event" }
    ? (args: ArgsFor<M, R> & { cursor?: number }) => AsyncIterable<unknown>
    : Operation<M, R> extends { guard: string }
      ? { run: HandlerFor<M, R>; onDenied: OnDeniedFor<M, R> }
      : HandlerFor<M, R>;
};
