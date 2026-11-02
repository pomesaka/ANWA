import { Result, ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import type { Result as TypedResult } from "neverthrow";

/** HTTP transport failures are distinct from ANWA domain-level Results. */
export type HttpFailure =
  | {
      kind: "invalid-request";
      title: "Invalid JSON request" | "Invalid request envelope";
    }
  | { kind: "unsupported-media" }
  | { kind: "payload-too-large" }
  | { kind: "unauthenticated" }
  | { kind: "invalid-caller" }
  | { kind: "not-found"; title: "Route not found" | "Interaction not found" }
  | { kind: "method-not-allowed"; allow: "GET" | "POST" }
  | { kind: "internal" };

const invalidEnvelope = (): HttpFailure => ({
  kind: "invalid-request",
  title: "Invalid request envelope",
});

/** Exhaustive mapping between a tagged transport error and an HTTP response. */
export function respondToFailure(failure: HttpFailure): Response {
  const definition = match(failure)
    .with({ kind: "invalid-request" }, ({ title }) => ({
      status: 400,
      code: "INVALID_REQUEST",
      title,
    }))
    .with({ kind: "unsupported-media" }, () => ({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      title: "Expected application/json",
    }))
    .with({ kind: "payload-too-large" }, () => ({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      title: "Request body too large",
    }))
    .with({ kind: "unauthenticated" }, () => ({
      status: 401,
      code: "UNAUTHENTICATED",
      title: "Authentication failed",
    }))
    .with({ kind: "invalid-caller" }, () => ({
      status: 500,
      code: "ADAPTER_ERROR",
      title: "Invalid authenticated caller",
    }))
    .with({ kind: "not-found" }, ({ title }) => ({
      status: 404,
      code: "NOT_FOUND",
      title,
    }))
    .with({ kind: "method-not-allowed" }, () => ({
      status: 405,
      code: "METHOD_NOT_ALLOWED",
      title: "Method not allowed",
    }))
    .with({ kind: "internal" }, () => ({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Server error",
    }))
    .exhaustive();
  return new Response(
    JSON.stringify({
      type: "about:blank",
      ...definition,
    }),
    {
      status: definition.status,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        "cache-control": "no-store",
        ...(failure.kind === "method-not-allowed"
          ? { allow: failure.allow }
          : {}),
      },
    },
  );
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type InvocationEnvelope = { ref: string; input?: unknown };

/** Bounded streaming read: a rejected read and oversize input are different failures. */
async function readBytes(
  request: Request,
  limit: number,
): Promise<TypedResult<Uint8Array, HttpFailure>> {
  if (!request.body) return err(invalidEnvelope());
  const readerResult = Result.fromThrowable(
    () => request.body!.getReader(),
    invalidEnvelope,
  )();
  if (readerResult.isErr()) return err(readerResult.error);
  const reader = readerResult.value;
  const result = await ResultAsync.fromThrowable(
    async (): Promise<TypedResult<Uint8Array, HttpFailure>> => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return err({ kind: "payload-too-large" } as const);
        }
        chunks.push(part.value);
      }
      const data = new Uint8Array(size);
      let index = 0;
      for (const chunk of chunks) {
        data.set(chunk, index);
        index += chunk.byteLength;
      }
      return ok(data);
    },
    invalidEnvelope,
  )().andThen((value) => value);
  // A broken stream or a failed lock release is still a transport failure;
  // neither may escape into the public Interaction result channel.
  const released = Result.fromThrowable(
    () => reader.releaseLock(),
    invalidEnvelope,
  )();
  if (released.isErr()) return err(released.error);
  return result;
}

export async function readEnvelope(
  request: Request,
  limit: number,
): Promise<TypedResult<InvocationEnvelope, HttpFailure>> {
  const type = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (type !== "application/json") return err({ kind: "unsupported-media" });
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit)
    return err({ kind: "payload-too-large" });

  const bytes = await readBytes(request, limit);
  if (bytes.isErr()) return err(bytes.error);

  const parsed = Result.fromThrowable(
    (): unknown =>
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.value)),
    (): HttpFailure => ({
      kind: "invalid-request",
      title: "Invalid JSON request",
    }),
  )();
  if (parsed.isErr()) return err(parsed.error);
  const value = parsed.value;
  if (
    !record(value) ||
    typeof value.ref !== "string" ||
    !value.ref ||
    Object.keys(value).some((key) => key !== "ref" && key !== "input")
  )
    return err(invalidEnvelope());
  return ok(value as InvocationEnvelope);
}
