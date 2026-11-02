/** Pure runtime contract checks. Application callbacks and HTTP I/O do not run here. */
import { err, ok, type Result } from "neverthrow";
import { match } from "ts-pattern";
import type {
  InteractionResponse,
  DomainError,
  NextInteraction,
} from "../anwa.ts";
import type { GuardDecision } from "../contracts.ts";
import type {
  Manifest,
  InteractionDefinition,
  DataSchema,
} from "../schema-tools.ts";

export type ContractViolation =
  | { kind: "callback-failed" }
  | { kind: "invalid-guard" }
  | { kind: "undeclared-error" }
  | { kind: "invalid-outcome" }
  | { kind: "invalid-output" }
  | { kind: "invalid-context" }
  | { kind: "invalid-next" };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const keysWithin = (
  value: Record<string, unknown>,
  allowed: readonly string[],
) => Object.keys(value).every((key) => allowed.includes(key));
const duration =
  /^P(?=.*\d)(?:\d+D)?(?:T(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/;

export function validateDomainError(
  spec: InteractionDefinition,
  error: unknown,
): Result<DomainError, ContractViolation> {
  if (!record(error) || typeof error.code !== "string")
    return err({ kind: "undeclared-error" });
  if (
    ["INVALID_INPUT", "UNEXPECTED_ERROR"].includes(error.code) ||
    own(error, "retry") ||
    !own(spec.errors ?? {}, error.code)
  )
    return err({ kind: "undeclared-error" });
  return ok(error as unknown as DomainError);
}

export function validateGuardDecision(
  spec: InteractionDefinition,
  value: unknown,
): Result<GuardDecision, ContractViolation> {
  if (!record(value)) return err({ kind: "invalid-guard" });
  if (value.allowed === true) return ok({ allowed: true });
  if (value.allowed !== false) return err({ kind: "invalid-guard" });
  return validateDomainError(spec, value.error).map((error) => ({
    allowed: false,
    error,
  }));
}

function validGuidance(value: unknown, ref: string, source: string): boolean {
  if (value === undefined) return true;
  if (
    !record(value) ||
    !Object.keys(value).length ||
    !keysWithin(value, ["kind", "level"])
  )
    return false;
  if (value.kind !== undefined && (value.kind !== "retry" || ref !== source))
    return false;
  return (
    value.level === undefined ||
    (typeof value.level === "string" &&
      ["required", "recommended", "available"].includes(value.level))
  );
}
function validTiming(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    record(value) &&
    Object.keys(value).length === 1 &&
    typeof value.after === "string" &&
    duration.test(value.after)
  );
}
function validApplicability(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    record(value) &&
    keysWithin(value, ["state", "reason"]) &&
    typeof value.state === "string" &&
    ["available", "blocked", "unknown"].includes(value.state) &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function validateNext(
  schema: Manifest,
  source: string,
  value: unknown,
  isBound: (ref: string) => boolean,
): Result<NextInteraction, ContractViolation> {
  if (
    !record(value) ||
    typeof value.ref !== "string" ||
    !keysWithin(value, ["ref", "input", "guidance", "when", "applicability"])
  )
    return err({ kind: "invalid-next" });
  if (!own(schema.interactions, value.ref) || !isBound(value.ref))
    return err({ kind: "invalid-next" });
  const spec = schema.interactions[value.ref];
  if (
    own(value, "input") &&
    (!spec.input || checkPayload(spec.input, value.input, "$", schema.$defs))
  )
    return err({ kind: "invalid-next" });
  if (
    !validGuidance(value.guidance, value.ref, source) ||
    !validTiming(value.when) ||
    !validApplicability(value.applicability)
  )
    return err({ kind: "invalid-next" });
  return ok(value as unknown as NextInteraction);
}

function validateContext(
  schema: Manifest,
  ref: string,
  value: unknown,
  isBound: (ref: string) => boolean,
): Result<{ next: NextInteraction[] }, ContractViolation> {
  if (
    !record(value) ||
    !keysWithin(value, ["next"]) ||
    !Array.isArray(value.next)
  )
    return err({ kind: "invalid-context" });
  const next: NextInteraction[] = [];
  for (const candidate of value.next) {
    const checked = validateNext(schema, ref, candidate, isBound);
    if (checked.isErr()) return err(checked.error);
    next.push(checked.value);
  }
  return ok({ next });
}

function validateOutcome(
  spec: InteractionDefinition,
  value: unknown,
  definitions: Manifest["$defs"],
): Result<InteractionResponse["outcome"], ContractViolation> {
  if (!record(value)) return err({ kind: "invalid-outcome" });
  if (value.kind === "accepted") {
    if (
      spec.kind !== "action" ||
      !record(value.execution) ||
      typeof value.execution.id !== "string" ||
      !value.execution.id
    )
      return err({ kind: "invalid-outcome" });
    return ok({ kind: "accepted", execution: { id: value.execution.id } });
  }
  if (
    value.kind !== "settled" ||
    !record(value.result) ||
    typeof value.result.ok !== "boolean"
  )
    return err({ kind: "invalid-outcome" });
  const result = value.result;
  if (result.ok === false)
    return validateDomainError(spec, result.error).map((error) => ({
      kind: "settled",
      result: { ok: false, error },
    }));
  if (spec.output && checkPayload(spec.output, result.value, "$", definitions))
    return err({ kind: "invalid-output" });
  return ok({ kind: "settled", result: { ok: true, value: result.value } });
}

export function validateResponse(
  schema: Manifest,
  ref: string,
  value: unknown,
  isBound: (ref: string) => boolean,
): Result<InteractionResponse, ContractViolation> {
  if (!record(value)) return err({ kind: "invalid-outcome" });
  return validateOutcome(
    schema.interactions[ref],
    value.outcome,
    schema.$defs,
  ).andThen((outcome) =>
    validateContext(schema, ref, value.context, isBound).map(
      (context): InteractionResponse =>
        match(outcome)
          .with({ kind: "accepted" }, (accepted) => ({
            outcome: accepted,
            context,
          }))
          .with({ kind: "settled" }, (settled) => ({
            outcome: settled,
            context,
          }))
          .exhaustive(),
    ),
  );
}

const payloadTypeChecks: Record<string, (value: unknown) => boolean> = {
  object: record,
  array: Array.isArray,
  integer: Number.isInteger,
  number: (value) => typeof value === "number" && Number.isFinite(value),
  null: (value) => value === null,
  string: (value) => typeof value === "string",
  boolean: (value) => typeof value === "boolean",
};
export function checkPayload(
  schema: DataSchema,
  value: unknown,
  path = "$",
  definitions: NonNullable<Manifest["$defs"]> = {},
): string | null {
  if (schema.$ref)
    return checkPayload(
      definitions[schema.$ref.slice(8)],
      value,
      path,
      definitions,
    );
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value)))
    return path + " not in enum";
  if (!payloadTypeChecks[schema.type!]?.(value))
    return path + " must be " + schema.type;
  return match(schema.type)
    .with("object", () =>
      checkObject(schema, value as Record<string, unknown>, path, definitions),
    )
    .with("array", () =>
      checkArray(schema, value as unknown[], path, definitions),
    )
    .otherwise(() => null);
}
function checkObject(
  schema: DataSchema,
  obj: Record<string, unknown>,
  path: string,
  definitions: NonNullable<Manifest["$defs"]>,
): string | null {
  const missing = schema.required?.find((field) => !own(obj, field));
  if (missing !== undefined) return path + "." + missing + " required";
  for (const [field, value] of Object.entries(obj)) {
    const fieldSchema = schema.properties?.[field];
    if (!fieldSchema && schema.additionalProperties === false)
      return path + "." + field + " not allowed";
    if (!fieldSchema) continue;
    const error = checkPayload(
      fieldSchema,
      value,
      path + "." + field,
      definitions,
    );
    if (error) return error;
  }
  return null;
}
function checkArray(
  schema: DataSchema,
  values: unknown[],
  path: string,
  definitions: NonNullable<Manifest["$defs"]>,
): string | null {
  if (!schema.items) return null;
  for (const [index, value] of values.entries()) {
    const error = checkPayload(
      schema.items,
      value,
      path + "[" + index + "]",
      definitions,
    );
    if (error) return error;
  }
  return null;
}
