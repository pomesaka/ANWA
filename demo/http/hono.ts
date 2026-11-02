// Run with Bun from repository root: bun demo/http/hono.ts
// Hono RPC needs chained routes and an exported type of the resulting router.
// The underlying ANWA Fetch binding still owns JSON parsing, validation and auth.
import { Hono, type TypedResponse } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { createCalculator } from "../calculator/index.ts";
import { schema } from "../calculator/contract.generated.ts";
import type { ExecutableRefs, InputOf, OutputOf } from "../../src/contracts.ts";
import type { InteractionResponse } from "../../src/anwa.ts";
import { createAnwaFetchHandler } from "../../src/http/fetch.ts";

const runtime = createCalculator();
const handler = createAnwaFetchHandler(runtime);

type CalculatorOperation = (typeof schema)["interactions"];
type CalculatorRef = ExecutableRefs<typeof schema>;

/** Typed client request, derived from the ANWA manifest rather than hand-written. */
type InvokeRequest = {
  [Ref in CalculatorRef]: {
    ref: Ref;
    input: InputOf<CalculatorOperation[Ref]>;
  };
}[CalculatorRef];

type InvokeOutput = {
  [Ref in CalculatorRef]: OutputOf<CalculatorOperation[Ref]>;
}[CalculatorRef];

type HttpProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
};
type CatalogBody = ReturnType<typeof runtime.catalog>;
type DiscoveryBody = ReturnType<typeof runtime.discover>;
type InvokeBody = InteractionResponse<InvokeOutput>;

// Hono RPC reads a TypedResponse marker at compile time. Since the Fetch
// binding returns validated JSON (including problem+json on protocol errors),
// attach the marker without re-parsing or re-serializing the real Response.
// The generic Invoke endpoint cannot correlate its response type with the
// particular "ref" supplied by the client; its output is their union.
type RPCResponse<T> = Response & TypedResponse<T | HttpProblem, StatusCode, "json">;
function rpcResponse<T>(response: Promise<Response>): Promise<RPCResponse<T>> {
  return response as Promise<RPCResponse<T>>;
}

type InvokeInput = {
  in: { json: InvokeRequest };
  out: { json: InvokeRequest };
};

// The third and fourth type parameters on .post supply the response and JSON
// request types for hc() without adding a second JSON parser to Hono.
// The Fetch adapter remains the *only* runtime request validator.
export const anwaRoutes = new Hono()
  .get("/catalog", (c) => rpcResponse<CatalogBody>(handler(c.req.raw)))
  .get("/interactions/:ref", (c) =>
    rpcResponse<DiscoveryBody>(handler(c.req.raw)),
  )
  .post<"/invoke", "/invoke", Promise<RPCResponse<InvokeBody>>, InvokeInput>(
    "/invoke",
    (c) => rpcResponse<InvokeBody>(handler(c.req.raw)),
  );

// Both the sub-router and the parent use chained calls, so typeof app retains
// the route schema for Hono's hc() typed client.
export const app = new Hono()
  .get("/health", (c) => c.text("healthy"))
  .route("/anwa", anwaRoutes);

export type AppType = typeof app;
export default app;

if (import.meta.main) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? "3000"),
    fetch: (request) => app.fetch(request),
  });
  console.log("Hono/ANWA listening on http://127.0.0.1:" + server.port);
}
