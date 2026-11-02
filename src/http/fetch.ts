import { Result, ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import {
  type VerifiedCaller,
  type RequestContext,
  type AnwaApp,
} from "../anwa.ts";
import {
  jsonResponse,
  readEnvelope,
  respondToFailure,
  type HttpFailure,
} from "./protocol.ts";

/**
 * ANWA HTTP Binding 0.1 over the Web Fetch Request/Response API.
 * No HTTP server, authentication provider, CORS or Event transport is implied.
 */
export interface FetchBindingOptions {
  /** URL path prefix, default /anwa. Must start with /. */
  prefix?: string;
  /** Trusted server-side authentication; never read caller identity from JSON. */
  authenticate?: (
    request: Request,
  ) => VerifiedCaller | null | Promise<VerifiedCaller | null>;
  /** Maximum JSON request body, default 1 MiB. */
  maxBodyBytes?: number;
}

type Runtime = AnwaApp<any>;
const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const internal = (): HttpFailure => ({ kind: "internal" });
const missing = (title: "Route not found" | "Interaction not found"): HttpFailure => ({
  kind: "not-found", title,
});

function classifyInvocationFailure(error: unknown): HttpFailure {
  if (
    error instanceof Error &&
    /Unknown or unbound InteractionRef|Use observe for Event/.test(error.message)
  ) return missing("Interaction not found");
  return internal();
}

async function authenticate(
  request: Request,
  options: FetchBindingOptions,
): Promise<import("neverthrow").Result<VerifiedCaller | null, HttpFailure>> {
  const attempted = await ResultAsync.fromThrowable(
    async () => (await options.authenticate?.(request)) ?? null,
    (): HttpFailure => ({ kind: "unauthenticated" }),
  )();
  return attempted.andThen((caller) =>
    caller && (typeof caller.subject !== "string" || !caller.subject.trim())
      ? err({ kind: "invalid-caller" } as const)
      : ok(caller)
  );
}

/** Adapt ANWA catalog, discover, and invoke to a Fetch request handler.
 *
 * GET  {prefix}/catalog
 * GET  {prefix}/interactions/{ref}
 * POST {prefix}/invoke with {"ref":"...", "input": ...}
 *
 * A settled Outcome is HTTP 200 (including domain failures); accepted is 202.
 * Event streaming is deliberately outside HTTP Binding 0.1.
 */
export function createAnwaFetchHandler(
  app: Runtime,
  options: FetchBindingOptions = {},
): (request: Request) => Promise<Response> {
  const prefix = options.prefix ?? "/anwa";
  if (
    !prefix.startsWith("/") ||
    prefix === "/" ||
    prefix.endsWith("/") ||
    prefix.includes("?") ||
    prefix.includes("#") ||
    prefix.includes("//")
  ) throw Error("Invalid ANWA HTTP prefix");

  const limit = options.maxBodyBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw Error("Invalid maxBodyBytes");

  return async (request) => {
    const path = new URL(request.url).pathname;
    const route = match(path)
      .with(prefix + "/catalog", () => ({ kind: "catalog" }) as const)
      .with(prefix + "/invoke", () => ({ kind: "invoke" }) as const)
      .otherwise((other) =>
        other.startsWith(prefix + "/interactions/")
          ? ({ kind: "discover", ref: other.slice((prefix + "/interactions/").length) }) as const
          : ({ kind: "unknown" }) as const
      );

    if (route.kind === "unknown") return respondToFailure(missing("Route not found"));
    const allowedMethod = route.kind === "invoke" ? "POST" : "GET";
    if (request.method !== allowedMethod)
      return respondToFailure({ kind: "method-not-allowed", allow: allowedMethod });

    const verified = await authenticate(request, options);
    if (verified.isErr()) return respondToFailure(verified.error);
    const ctx: RequestContext = { caller: verified.value };

    return match(route)
      .with({ kind: "catalog" }, () =>
        Result.fromThrowable(
          () => jsonResponse(app.catalog(ctx)),
          internal,
        )().match((response) => response, respondToFailure)
      )
      .with({ kind: "discover" }, ({ ref }) => {
        if (!ref || ref.includes("/") || ref.includes("%"))
          return respondToFailure(missing("Interaction not found"));
        return Result.fromThrowable(
          () => jsonResponse(app.discover(ref, ctx)),
          () => missing("Interaction not found"),
        )().match((response) => response, respondToFailure);
      })
      .with({ kind: "invoke" }, async () => {
        const envelope = await readEnvelope(request, limit);
        if (envelope.isErr()) return respondToFailure(envelope.error);
        return ResultAsync.fromThrowable(
          async () => {
            const result = await app.interact(
              envelope.value.ref,
              own(envelope.value, "input") ? envelope.value.input : undefined,
              ctx,
            );
            const status = match(result.outcome)
              .with({ kind: "settled" }, () => 200)
              .with({ kind: "accepted" }, () => 202)
              .exhaustive();
            return jsonResponse(result, status);
          },
          classifyInvocationFailure,
        )().match((response) => response, respondToFailure);
      })
      .exhaustive();
  };
}
