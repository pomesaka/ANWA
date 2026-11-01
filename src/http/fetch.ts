import { type VerifiedCaller, type RequestContext, type AnwaApp } from "../anwa.ts";

/** Minimal ANWA HTTP Binding 0.1 over the Web Fetch Request/Response API.
 * Frameworks such as Hono and Bun can register this handler directly.
 * It intentionally does not implement authentication, CORS, or Event transport.
 */
export interface FetchBindingOptions {
  /** URL path prefix, default /anwa. Must start with /. */
  prefix?: string;
  /** Trusted server-side authentication; caller identity is never read from JSON. */
  authenticate?: (request: Request) => VerifiedCaller | null | Promise<VerifiedCaller | null>;
  /** Maximum JSON request size in bytes, default 1 MiB. */
  maxBodyBytes?: number;
}

type Runtime = AnwaApp<any>;

function problem(status: number, code: string, title: string, allow?: string): Response {
  return new Response(JSON.stringify({ type: "about:blank", title, status, code }), {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
      "cache-control": "no-store",
      ...(allow ? { allow } : {}),
    },
  });
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

async function readEnvelope(request: Request, limit: number): Promise<
  | { ok: true; value: { ref: string; input?: unknown } }
  | { ok: false; response: Response }
> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, response: problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json") };
  }
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) {
    return { ok: false, response: problem(413, "PAYLOAD_TOO_LARGE", "Request body too large") };
  }
  if (!request.body) {
    return { ok: false, response: problem(400, "INVALID_REQUEST", "Invalid request envelope") };
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { ok: false, response: problem(413, "PAYLOAD_TOO_LARGE", "Request body too large") };
      }
      chunks.push(part.value);
    }
  } catch {
    return { ok: false, response: problem(400, "INVALID_REQUEST", "Invalid request envelope") };
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let index = 0;
  for (const chunk of chunks) {
    joined.set(chunk, index);
    index += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch {
    return { ok: false, response: problem(400, "INVALID_REQUEST", "Invalid JSON request") };
  }
  if (
    !record(value) ||
    typeof value.ref !== "string" ||
    !value.ref ||
    Object.keys(value).some((key) => key !== "ref" && key !== "input")
  ) {
    return { ok: false, response: problem(400, "INVALID_REQUEST", "Invalid request envelope") };
  }
  return { ok: true, value: value as { ref: string; input?: unknown } };
}

/** Adapt ANWA's in-process catalog, discover, and invoke to a Fetch handler.
 *
 * GET  {prefix}/catalog
 * GET  {prefix}/interactions/{ref}
 * POST {prefix}/invoke with {"ref":"...", "input": ...}
 *
 * Returns a 202 status for an accepted outcome, and 200 for settled results,
 * including domain errors. Event streaming is deliberately outside 0.1.
 */
export function createAnwaFetchHandler(
  app: Runtime,
  options: FetchBindingOptions = {},
): (request: Request) => Promise<Response> {
  const prefix = options.prefix ?? "/anwa";
  if (!prefix.startsWith("/") || prefix === "/" || prefix.endsWith("/") ||
      prefix.includes("?") || prefix.includes("#") || prefix.includes("//")) {
    throw Error("Invalid ANWA HTTP prefix");
  }
  const limit = options.maxBodyBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error("Invalid maxBodyBytes");
  return async (request) => {
    const path = new URL(request.url).pathname;
    const isCatalog = path === prefix + "/catalog";
    const isInvoke = path === prefix + "/invoke";
    const isDescription = path.startsWith(prefix + "/interactions/");
    if (!isCatalog && !isInvoke && !isDescription) {
      return problem(404, "NOT_FOUND", "Route not found");
    }
    const allow = isInvoke ? "POST" : "GET";
    if (request.method !== allow) {
      return problem(405, "METHOD_NOT_ALLOWED", "Method not allowed", allow);
    }
    let caller: VerifiedCaller | null;
    try {
      caller = (await options.authenticate?.(request)) ?? null;
      if (caller && (typeof caller.subject !== "string" || !caller.subject.trim())) {
        return problem(500, "ADAPTER_ERROR", "Invalid authenticated caller");
      }
    } catch {
      return problem(401, "UNAUTHENTICATED", "Authentication failed");
    }
    const ctx: RequestContext = { caller };
    if (isCatalog) {
      try {
        return json(app.catalog(ctx));
      } catch {
        return problem(500, "INTERNAL_ERROR", "Server error");
      }
    }
    if (isDescription) {
      const ref = path.slice((prefix + "/interactions/").length);
      if (!ref || ref.includes("/") || ref.includes("%")) {
        return problem(404, "NOT_FOUND", "Interaction not found");
      }
      try {
        return json(app.discover(ref, ctx));
      } catch {
        return problem(404, "NOT_FOUND", "Interaction not found");
      }
    }
    const envelope = await readEnvelope(request, limit);
    if (!envelope.ok) return envelope.response;
    try {
      const response = await app.interact(
        envelope.value.ref,
        own(envelope.value, "input") ? envelope.value.input : undefined,
        ctx,
      );
      return json(response, response.outcome.kind === "accepted" ? 202 : 200);
    } catch (error) {
      if (error instanceof Error && /Unknown or unbound InteractionRef|Use observe for Event/.test(error.message)) {
        return problem(404, "NOT_FOUND", "Interaction not found");
      }
      return problem(500, "INTERNAL_ERROR", "Server error");
    }
  };
}
