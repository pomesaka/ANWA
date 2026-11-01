# ANWA HTTP Binding 0.1 (experimental)

> Optional transport binding for [ANWA v0.2](../spec/anwa-0.2.md). This is **not**
> a change to the Interaction-first core model and **not** a standardized wire
> protocol. Query/Action and Discovery only; Event streaming is not yet defined.

## Goal and transport boundary

The JSON `anwa.json` manifest and bound business handlers are independent of
network transport. The binding is a small adapter over the **existing ANWA
runtime**, not a second router, schema registry, auth provider or workflow
engine. An application **hosts** the adapter using its own router/server.

- Go: `go/httpbinding.New(app, opts)` returns `http.Handler` compatible
  with `net/http` and routers that accept this interface (e.g., chi).
- TypeScript / JavaScript: `createAnwaFetchHandler(app, opts)` returns
  `(request: Request) => Promise<Response>` using the Web Fetch standard.
  Hono can register it in a single `app.all(...)` route.
- Framework HTTP configuration, TLS, middleware, logging, deadlines, CORS,
  rate limits, and credential verification remain application/platform-owned.
  No new HTTP-specific fields are required in `anwa.json`.

These two host interfaces were chosen because they maximize useful reuse
without binding ANWA to one server framework.

## Routes

Default prefix: `/anwa`, customizable when creating the adapter.

| Method | Path | Wire result |
| --- | --- | --- |
| `GET` | `/anwa/catalog` | Caller-filtered Interaction catalog |
| `GET` | `/anwa/interactions/{ref}` | `{description, context:{next:[]}}` |
| `POST` | `/anwa/invoke` | Existing `{outcome, context}` |

A single-segment `{ref}` is an application-scoped InteractionRef, **not** a
resource instance or Thing identifier. `/anwa/invoke` accepts JSON:

```http
POST /anwa/invoke
Content-Type: application/json

{"ref":"calculator.add","input":{"a":2,"b":3}}
```

The `input` field may be omitted for Interactions without input. The
`caller` field is never accepted in the request envelope. No magic,
protocol-level `context.next` invocation endpoint is required: clients
submit the selected candidate's `ref` and optional `input` to
`/anwa/invoke` again, triggering the normal Guard and validation.

### HTTP statuses

| HTTP status | Meaning |
| --- | --- |
| `200` | Settled ANWA outcome (including **domain failure** and `INVALID_INPUT`) or successful Discovery |
| `202` | Action returned ANWA `accepted`; the task is **not** necessarily completed |
| `400` | Malformed JSON or invalid request envelope |
| `401` | Trusted authentication callback rejected credentials |
| `404` | Unknown route, undiscoverable description or unknown Interaction |
| `405` | Wrong method; `Allow` header is set |
| `413` | JSON body exceeds configured maximum (default 1 MiB) |
| `415` | Invoke Content-Type is not `application/json` |
| `500` | Adapter failure or unexpected runtime error, with details suppressed |

Protocol failures use `application/problem+json`, with `type`, `title`,
`status` and a `code` extension. ANWA's declared domain errors remain
in the **200 response envelope** so `context.next` is not discarded.
Every response sets `Cache-Control: no-store`.

ANWA core declares both `hasSideEffects` and `idempotent` on Actions.
These declarations **do not** cause automatic HTTP retries or implement
request deduplication. In particular, a timeout does not prove the Action
did not occur. The first binding does not define `Idempotency-Key` storage.

## Go: standard-library ServeMux

From the `go/` directory, the Calculator example can listen locally:

```bash
go run ./examples/calculator -listen 127.0.0.1:8080
curl -fsS http://127.0.0.1:8080/anwa/catalog
curl -fsS -X POST http://127.0.0.1:8080/anwa/invoke \
  -H 'Content-Type: application/json' \
  -d '{"ref":"calculator.add","input":{"a":2,"b":3}}'
```

Inside an existing Go web application:

```go
handler, err := httpbinding.New(app, httpbinding.Options{
    Authenticate: func(r *http.Request) (*anwa.VerifiedCaller, error) {
        // Validate credentials/session via the hosting app.
        // Never trust caller identity from JSON input or an unsigned header.
        return identityProvider.Verify(r)
    },
})
if err != nil { return err }
mux := http.NewServeMux()
mux.Handle("/anwa/", handler)
```

The returned `http.Handler` can also be mounted under a chi router that
accepts `http.Handler`. No chi dependency is introduced into ANWA.

## TypeScript / Hono and Fetch-native runtimes

The [Hono runnable demo](../demo/http/hono.ts) is a regular Hono app.
It attaches the Fetch handler to **an existing route**:

```ts
const router = new Hono();
const handler = createAnwaFetchHandler(anwaApp, {
  authenticate: async (request) => verifyCredential(request),
});
router.all("/anwa/*", (c) => handler(c.req.raw));
```

For the public Calculator demo:

```bash
bun install --frozen-lockfile
bun demo/http/hono.ts
curl -fsS -X POST http://127.0.0.1:3000/anwa/invoke \
  -H 'Content-Type: application/json' \
  -d '{"ref":"calculator.add","input":{"a":2,"b":3}}'
```

The **same Fetch handler** can be used in a Fetch-standard host such as
Bun's `fetch` server callback or Cloudflare Workers' `fetch` entrypoint,
with host-specific setup provided by the application.

## Authentication and security boundary

The binding optionally accepts a **trusted callback** that returns
`VerifiedCaller`. Omitting this callback makes every request anonymous;
only explicit public Interactions can be used without a Guard. A rejected
credential returns HTTP 401; a Guard's domain denial remains an ANWA
`Outcome`. A discovered Interaction is **not** proof of permission to use a
specific record; Guard and transactional app authorization still apply.

The binding does **not** enable CORS by default, derive caller identity from
request fields, expose raw errors, or assume cookies and cross-origin access
are safe. Deploying outside a trusted environment requires HTTPS, real
authentication, rate limits, request timeouts, trusted proxy configuration
and, for cookie-backed auth, CSRF protections. The application must decide
how to handle user-supplied URLs and external-service requests.

## Other framework surfaces (design direction, not claims of support)

| Host interface | Proposed integration | Current status |
| --- | --- | --- |
| Go `net/http`, chi | Mount `http.Handler` | Go binding implemented; stdlib tested |
| Hono | Route calls the Fetch handler with `c.req.raw` | Hono integration tested |
| Bun / Deno / Cloudflare Workers | Native Fetch Request → Response | Fetch binding implemented |
| Express / Fastify | Separate thin Node `IncomingMessage` / response bridge | Not implemented |
| Gin / Echo | Thin wrapper to adapt `http.Handler`, without core changes | Not implemented |
| Next.js / SvelteKit | Framework route delegates to Fetch binding | Not implemented / needs host verification |

Avoid writing a separate ANWA router or adding new manifest fields for
each framework. Add one tiny bridge only when a host does **not** directly
accept the existing Go or Fetch interface.

## Next protocol questions

- **Events:** how to bind `observe` (likely SSE or a streaming POST), including
  denial before the stream, cursor/resume, cancellation, framing and error
  semantics. This v0.1 intentionally returns 404 for an unimplemented Event
  endpoint and does not route Event refs through `invoke`.
- **Retries:** application-backed idempotency keys, deduplication lifetime,
  conflict semantics, and handling uncertain outcomes.
- **Interoperability:** cross-language conformance fixtures, version negotiation,
  nested/mounted prefix behavior, and streaming under reverse proxies.
- **Error typing:** eventually expose structured runtime errors rather than
  mapping today's unknown Interaction exceptions at the HTTP edge.

[ANWA architecture](architecture.md) ·
[Authentication boundary](authentication-authorization.md) ·
[HTTP binding source in Go](../go/httpbinding/http.go) ·
[HTTP binding source in TypeScript](../src/http/fetch.ts)
