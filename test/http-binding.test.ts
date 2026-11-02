import { test } from "bun:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createAnwaFetchHandler } from "../src/http/fetch.ts";
import { createCalculator } from "../demo/calculator/index.ts";
import { createOrders } from "../demo/orders/index.ts";
import { createReports } from "../demo/reports/index.ts";

const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://example.test/anwa/invoke", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
const invokeBody = (ref: string, input?: unknown) =>
  JSON.stringify({ ref, ...(input === undefined ? {} : { input }) });

test("Fetch binding serves Discovery and Invoke without a network server", async () => {
  const handler = createAnwaFetchHandler(createCalculator());
  const catalog = await handler(
    new Request("https://example.test/anwa/catalog"),
  );
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("cache-control"), "no-store");
  assert.deepEqual((await catalog.json()).entrypoints, [
    "calculator.add",
    "calculator.divide",
  ]);
  const discovered = await handler(
    new Request("https://example.test/anwa/interactions/calculator.add"),
  );
  assert.equal(discovered.status, 200);
  assert.equal((await discovered.json()).description.ref, "calculator.add");

  const added = await handler(
    jsonRequest(invokeBody("calculator.add", { a: 2, b: 3 })),
  );
  assert.equal(added.status, 200);
  assert.deepEqual((await added.json()).outcome, {
    kind: "settled",
    result: { ok: true, value: 5 },
  });
  const divided = await handler(
    jsonRequest(invokeBody("calculator.divide", { a: 1, b: 0 })),
  );
  const divideResult = (await divided.json()).outcome;
  assert.equal(divided.status, 200); // domain errors are not transport errors
  assert.equal(divideResult.result.error.code, "DIVIDE_BY_ZERO");
  const invalid = await handler(
    jsonRequest(invokeBody("calculator.add", { a: "oops", b: 3 })),
  );
  assert.equal(invalid.status, 200);
  assert.equal(
    (await invalid.json()).outcome.result.error.code,
    "INVALID_INPUT",
  );
});

test("Fetch binding returns 202 for accepted async Actions", async () => {
  const handler = createAnwaFetchHandler(createReports());
  const result = await handler(
    jsonRequest(invokeBody("report.generate", { topic: "ANWA" })),
  );
  assert.equal(result.status, 202);
  assert.equal((await result.json()).outcome.kind, "accepted");
});

test("Trusted authentication is separate from public request fields", async () => {
  const app = createOrders();
  const handler = createAnwaFetchHandler(app, {
    authenticate: async (request) => {
      const authorization = request.headers.get("authorization");
      if (!authorization) return null;
      if (authorization !== "Bearer alice-secret")
        throw Error("Never reveal credential details");
      return { subject: "alice" };
    },
  });
  const anonymous = await handler(
    new Request("https://example.test/anwa/catalog"),
  );
  assert.deepEqual((await anonymous.json()).interactions, []);
  const privateDescriptor = await handler(
    new Request("https://example.test/anwa/interactions/order.cancel"),
  );
  assert.equal(privateDescriptor.status, 404);

  const denied = await handler(
    jsonRequest(invokeBody("order.get", { orderId: "pending" })),
  );
  assert.equal(denied.status, 200);
  assert.equal(
    (await denied.json()).outcome.result.error.code,
    "AUTH_REQUIRED",
  );

  const spoofed = await handler(
    jsonRequest(
      '{"ref":"order.get","input":{"orderId":"pending"},"caller":{"subject":"alice"}}',
    ),
  );
  assert.equal(spoofed.status, 400);

  const authHeaders = { authorization: "Bearer alice-secret" };
  const allowed = await handler(
    jsonRequest(invokeBody("order.get", { orderId: "pending" }), authHeaders),
  );
  assert.equal((await allowed.json()).outcome.result.value.id, "pending");

  const shipped = await handler(
    jsonRequest(
      invokeBody("order.cancel", {
        orderId: "shipped",
        reason: "Changed mind",
      }),
      authHeaders,
    ),
  );
  const failure = await shipped.json();
  assert.equal(failure.outcome.result.error.code, "ORDER_ALREADY_SHIPPED");
  const next = failure.context.next.find(
    (x: { ref: string }) => x.ref === "shipment.track",
  );
  assert.ok(next);
  const followed = await handler(
    jsonRequest(invokeBody(next.ref, next.input), authHeaders),
  );
  assert.equal((await followed.json()).outcome.result.value, "delivered");

  const wrongToken = await handler(
    new Request("https://example.test/anwa/catalog", {
      headers: { authorization: "Bearer bad" },
    }),
  );
  assert.equal(wrongToken.status, 401);
  assert.doesNotMatch(await wrongToken.text(), /Never reveal/);
});

test("Fetch binding distinguishes protocol errors from ANWA Results", async () => {
  const handler = createAnwaFetchHandler(createCalculator(), {
    maxBodyBytes: 64,
  });
  const cases = [
    [new Request("https://example.test/anwa/missing"), 404],
    [new Request("https://example.test/anwa/invoke"), 405],
    [new Request("https://example.test/anwa/interactions/unknown"), 404],
    [jsonRequest('{"ref":"missing"}'), 404],
    [jsonRequest('{"ref":"calculator.add"'), 400],
    [jsonRequest('{"ref":"calculator.add","caller":"untrusted"}'), 400],
    [jsonRequest("null"), 400],
    [jsonRequest('{"ref":"calculator.add"}{}'), 400],
    [
      new Request("https://example.test/anwa/invoke", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "text/plain" },
      }),
      415,
    ],
    [
      jsonRequest(
        '{"ref":"calculator.add","input":{"a":1,"b":2},"padding":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
      ),
      413,
    ],
  ] as const;
  for (const [request, expected] of cases) {
    const response = await handler(request);
    assert.equal(response.status, expected, request.url);
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/problem\+json/,
    );
    assert.equal((await response.json()).status, expected);
  }
  const method = await handler(new Request("https://example.test/anwa/invoke"));
  assert.equal(method.headers.get("allow"), "POST");
  const jsonWithCharset = await createAnwaFetchHandler(createCalculator())(
    jsonRequest(invokeBody("calculator.add", { a: 1, b: 2 }), {
      "content-type": "application/json; charset=utf-8",
    }),
  );
  assert.equal(jsonWithCharset.status, 200);
  assert.throws(
    () => createAnwaFetchHandler(createCalculator(), { prefix: "/anwa/" }),
    /prefix/,
  );
});

test("Hono can register the Fetch binding directly on an existing router", async () => {
  const router = new Hono();
  router.get("/health", (c) => c.text("healthy"));
  const handler = createAnwaFetchHandler(createCalculator());
  router.all("/anwa/*", (c) => handler(c.req.raw));

  const health = await router.request("https://example.test/health");
  assert.equal(await health.text(), "healthy");
  const response = await router.request("https://example.test/anwa/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: invokeBody("calculator.add", { a: 7, b: 8 }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome.result.value, 15);
});

test("Hono + Fetch binding accepts real loopback HTTP traffic", async () => {
  const router = new Hono();
  const handler = createAnwaFetchHandler(createCalculator());
  router.all("/anwa/*", (c) => handler(c.req.raw));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => router.fetch(request),
  });
  try {
    const response = await fetch(
      "http://127.0.0.1:" + server.port + "/anwa/invoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: invokeBody("calculator.add", { a: 20, b: 22 }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).outcome.result.value, 42);
  } finally {
    server.stop(true);
  }
});

test("Explicit null does not become an omitted request input", async () => {
  const { AnwaApp, ok, reply } = await import("../src/anwa.ts");
  const schema = {
    anwa: "0.2",
    entrypoints: ["ping"],
    interactions: { ping: { kind: "query", description: "Public ping" } },
  } as const;
  const runtime = new AnwaApp(schema).bind(
    { ping: async () => reply(ok("pong")) },
    { public: ["ping"] },
  );
  const handler = createAnwaFetchHandler(runtime);
  const omitted = await handler(jsonRequest('{"ref":"ping"}'));
  assert.equal((await omitted.json()).outcome.result.value, "pong");
  const explicitNull = await handler(
    jsonRequest('{"ref":"ping","input":null}'),
  );
  assert.equal(explicitNull.status, 200);
  assert.equal(
    (await explicitNull.json()).outcome.result.error.code,
    "INVALID_INPUT",
  );
});

test("Chained Hono routes work with the manifest-typed hc client over HTTP", async () => {
  const { hc } = await import("hono/client");
  const { app } = await import("../demo/http/hono.ts");
  type AppType = typeof import("../demo/http/hono.ts").app;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => app.fetch(request),
  });
  try {
    const client = hc<AppType>("http://127.0.0.1:" + server.port);
    const catalog = await client.anwa.catalog.$get();
    assert.equal(catalog.status, 200);
    const catalogJson = await catalog.json();
    assert.ok("entrypoints" in catalogJson);

    const discovered = await client.anwa.interactions[":ref"].$get({
      param: { ref: "calculator.add" },
    });
    assert.equal(discovered.status, 200);
    const found = await discovered.json();
    assert.ok("description" in found);

    const result = await client.anwa.invoke.$post({
      json: { ref: "calculator.add", input: { a: 20, b: 22 } },
    });
    assert.equal(result.status, 200);
    const outcome = await result.json();
    assert.ok("outcome" in outcome);
    if ("outcome" in outcome && outcome.outcome.kind === "settled") {
      assert.equal(outcome.outcome.result.ok, true);
      if (outcome.outcome.result.ok) {
        assert.equal(outcome.outcome.result.value, 42);
      }
    }
  } finally {
    server.stop(true);
  }
});
