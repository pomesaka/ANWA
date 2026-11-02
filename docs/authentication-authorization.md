# Authentication, authorization and discovery

> Active experimental ANWA v0.2 design. Core is in-process, and the optional [HTTP Binding 0.1](http-binding.md) supplies transport routing only. Neither is an authentication provider or a deployable security boundary.

## Trust boundary

**Authentication** belongs to a trusted transport adapter. It verifies credentials or session state before it calls ANWA, then passes a `RequestContext` containing `VerifiedCaller`. The public Interaction `input` is untrusted business data and **must never be used to establish caller identity**.

```ts
const request = { caller: { subject: "alice", claims: { tenant: "demo" } } };
await app.interact("order.get", {orderId:"123"}, request);
await app.follow(candidate, request);
app.catalog(request);
app.discover("order.get", request);
```

The code above **simulates** a verified identity. `VerifiedCaller` is a TypeScript contract, **not a cryptographic proof**. The in-process `interact` API accepts ordinary objects; a web adapter must **not** permit clients to supply or override that trusted argument directly. No token verification, sessions, or password handling is implemented in the ANWA reference runtime. The optional HTTP Binding accepts a trusted application-authored authentication callback, but it does not verify credentials itself or trust a `caller` field in JSON.

## Runtime access control

The same named Guard mechanism applies to all three kinds: `query`, `action`, and `event`.

- Each Interaction with a declared Guard must bind the matching Guard function; a Query/Action binds `{run,onDenied}`, an Event binds `{run}`.
- The Runtime validates the input, evaluates the Guard **before** calling `run` or subscribing to the Event.
- Query/Action Guard rejection returns a declared domain error in `Outcome`; only the **same Interaction's** `onDenied` callback builds the next candidates. No business `run` is invoked.
- Event Guard rejection prevents observation; the AsyncIterable throws `ObservationDenied` when consumed, with its machine-readable `code`. Event streaming is not an Interaction Result envelope in the current reference.
- Each unguarded Interaction must appear in the explicit `public` allowlist at `bind` time, or binding fails. **Omitted is denied, not public.**
- Guard declarations are not authentication or atomicity guarantees: authorization decisions depend on implementing the actual policy in application code, and writes must revalidate necessary conditions atomically.

## Discoverability is a separate coarse-grained decision

`catalog(request)` and `discover(ref, request)` filter published descriptions to protect private operation names. Public Interactions are discoverable to everyone. Guarded Interactions are not discoverable by default; a dedicated `discoverable({ref,caller})` function may grant coarse permission to disclose an Interaction's description.

This policy has **no resource input**, so it cannot prove access to a particular order or report. The normal Guard checks authorization using actual Interaction input at invocation. Throwing in a discovery policy fails closed.

`Context.next` references to private Interactions are filtered using the same discovery policy before returning a Result. The app controls which follow-ups it creates; ANWA merely avoids exposing entries it would hide in Discovery.

## Incomplete security features

An optional HTTP routing adapter now exists, but it **does not** provide an authentication implementation, session management, identity-provider integration, durable audit trail, atomic policy check in storage, or token-based authorization. Do not expose guarded ANWA operations without a trusted authenticator and business-side authorization. Consumers must not treat the current runtime as a secure externally callable server.

[Architecture](architecture.md) · [ANWA v0.2](../spec/anwa-0.2.md) · [Orders demo](../demo/orders/index.ts)
