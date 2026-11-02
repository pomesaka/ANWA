import assert from "node:assert/strict";
import type { InteractionResponse, DomainError } from "../../src/anwa.ts";

/** Fail immediately on the wrong variant; an assertion must never be conditional on success. */
export function success<T>(response: InteractionResponse<T>): T {
  assert.equal(response.outcome.kind, "settled", "expected a settled outcome");
  assert.ok(
    response.outcome.kind === "settled" && response.outcome.result.ok,
    "expected success: " + JSON.stringify(response),
  );
  return response.outcome.result.value;
}
export function failure(
  response: InteractionResponse,
  expectedCode: string,
): DomainError {
  assert.equal(response.outcome.kind, "settled", "expected a settled outcome");
  assert.ok(
    response.outcome.kind === "settled" && !response.outcome.result.ok,
    "expected failure: " + JSON.stringify(response),
  );
  assert.equal(response.outcome.result.error.code, expectedCode);
  return response.outcome.result.error;
}
export function execution(response: InteractionResponse): string {
  assert.equal(
    response.outcome.kind,
    "accepted",
    "expected deferred execution",
  );
  assert.ok(response.outcome.kind === "accepted");
  assert.notEqual(response.outcome.execution.id, "");
  return response.outcome.execution.id;
}
export const opaqueFailure = {
  outcome: {
    kind: "settled",
    result: {
      ok: false,
      error: {
        code: "UNEXPECTED_ERROR",
        message: "Unexpected application failure",
        effects: "unknown",
      },
    },
  },
  context: { next: [] },
} as const;
