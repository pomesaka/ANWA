/** HTTP Binding 0.1 — transport failures and ANWA outcomes are separate channels. */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { hc } from "hono/client";
import { createAnwaFetchHandler } from "../src/http/fetch.ts";
import { createCalculator } from "../demo/calculator/index.ts";
import { createOrders } from "../demo/orders/index.ts";
import { createReports } from "../demo/reports/index.ts";
import { createAnwaApp, ok, reply } from "../src/anwa.ts";
import { app as honoApp, type AppType } from "../demo/http/hono.ts";
import { success, failure, execution } from "./support/outcome.ts";

const request = (
  path: string,
  body?: string,
  headers: Record<string, string> = {},
  method = body === undefined ? "GET" : "POST",
) =>
  new Request("https://example.test" + path, {
    method,
    ...(body === undefined ? {} : { body }),
    headers: { "content-type": "application/json", ...headers },
  });
const envelope = (ref: string, input?: unknown) =>
  JSON.stringify({ ref, ...(input === undefined ? {} : { input }) });
const authenticated = () =>
  createAnwaFetchHandler(createOrders(), {
    authenticate: (req) => {
      const token = req.headers.get("authorization");
      if (!token) return null;
      if (token !== "Bearer test-alice") throw Error("private token detail");
      return { subject: "alice" };
    },
  });

describe("HTTP — protocol failures have exact status, code and no ANWA outcome", () => {
  const cases = [
    {
      name: "unknown route",
      path: "/anwa/missing",
      status: 404,
      code: "NOT_FOUND",
    },
    {
      name: "wrong invoke method",
      path: "/anwa/invoke",
      status: 405,
      code: "METHOD_NOT_ALLOWED",
      allow: "POST",
    },
    {
      name: "unknown description",
      path: "/anwa/interactions/missing",
      status: 404,
      code: "NOT_FOUND",
    },
    {
      name: "unknown Interaction",
      path: "/anwa/invoke",
      body: '{"ref":"missing"}',
      status: 404,
      code: "NOT_FOUND",
    },
    {
      name: "malformed JSON",
      path: "/anwa/invoke",
      body: '{"ref":',
      status: 400,
      code: "INVALID_REQUEST",
    },
    {
      name: "extra envelope field",
      path: "/anwa/invoke",
      body: '{"ref":"calculator.add","caller":"alice"}',
      status: 400,
      code: "INVALID_REQUEST",
    },
    {
      name: "null envelope",
      path: "/anwa/invoke",
      body: "null",
      status: 400,
      code: "INVALID_REQUEST",
    },
    {
      name: "two JSON documents",
      path: "/anwa/invoke",
      body: '{"ref":"calculator.add"}{}',
      status: 400,
      code: "INVALID_REQUEST",
    },
    {
      name: "non-JSON content type",
      path: "/anwa/invoke",
      body: "{}",
      headers: { "content-type": "text/plain" },
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    },
    {
      name: "body exceeds 64-byte limit",
      path: "/anwa/invoke",
      body: '{"ref":"calculator.add","input":{"a":1,"b":2},"padding":"xxxxxxxxxxxxxxxxxxxx"}',
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    },
  ];
  test.each(cases)(
    "$name",
    async ({ path, body, headers, status, code, allow }) => {
      const handler = createAnwaFetchHandler(createCalculator(), {
        maxBodyBytes: 64,
      });
      const response = await handler(request(path, body, headers));
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(
        response.headers.get("content-type") ?? "",
        /^application\/problem\+json/,
      );
      assert.equal(response.headers.get("allow"), allow ?? null);
      const document = await response.json();
      assert.deepEqual(Object.keys(document).sort(), [
        "code",
        "status",
        "title",
        "type",
      ]);
      assert.equal(document.type, "about:blank");
      assert.equal(document.status, status);
      assert.equal(document.code, code);
      assert.equal(typeof document.title, "string");
    },
  );
  test.each([
    {
      name: "throwing authenticator is 401",
      authenticate: () => {
        throw Error("private credential");
      },
      status: 401,
      code: "UNAUTHENTICATED",
    },
    {
      name: "empty trusted subject is adapter error",
      authenticate: () => ({ subject: " " }),
      status: 500,
      code: "ADAPTER_ERROR",
    },
  ])("$name", async ({ authenticate, status, code }) => {
    const response = await createAnwaFetchHandler(createCalculator(), {
      authenticate,
    })(request("/anwa/catalog"));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal(body.status, status);
    assert.doesNotMatch(JSON.stringify(body), /private credential/);
  });
  test.each([
    { name: "trailing slash prefix", options: { prefix: "/anwa/" } },
    { name: "root prefix", options: { prefix: "/" } },
    { name: "negative body limit", options: { maxBodyBytes: -1 } },
  ])("$name fails at construction", ({ options }) => {
    assert.throws(
      () => createAnwaFetchHandler(createCalculator(), options),
      /Invalid ANWA HTTP prefix|Invalid maxBodyBytes/,
    );
  });
});

describe("HTTP — settled success and failure both preserve Outcome + Context", () => {
  test.each([
    {
      name: "numeric sum",
      ref: "calculator.add",
      input: { a: 2, b: 3 },
      value: 5,
      code: null,
    },
    {
      name: "declared division failure",
      ref: "calculator.divide",
      input: { a: 1, b: 0 },
      value: undefined,
      code: "DIVIDE_BY_ZERO",
    },
    {
      name: "schema-invalid input",
      ref: "calculator.add",
      input: { a: "oops", b: 3 },
      value: undefined,
      code: "INVALID_INPUT",
    },
  ])("$name returns 200 JSON", async ({ ref, input, value, code }) => {
    const response = await createAnwaFetchHandler(createCalculator())(
      request("/anwa/invoke", envelope(ref, input)),
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^application\/json/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    if (code === null) assert.deepEqual(success(body), value);
    else failure(body, code);
    assert.deepEqual(body.context.next, []);
  });
  test("accepted Action returns 202 with an execution handle, not a settled result", async () => {
    const handler = createAnwaFetchHandler(
      createReports({ wait: () => Promise.resolve() }),
    );
    const response = await handler(
      request("/anwa/invoke", envelope("report.generate", { topic: "ANWA" })),
    );
    assert.equal(response.status, 202);
    assert.notEqual(execution(await response.json()), "");
  });
  test("application/json with charset is accepted", async () => {
    const result = await createAnwaFetchHandler(createCalculator())(
      request("/anwa/invoke", envelope("calculator.add", { a: 2, b: 3 }), {
        "content-type": "application/json; charset=utf-8",
      }),
    );
    assert.equal(result.status, 200);
    assert.equal(success(await result.json()), 5);
  });
});

describe("HTTP AUTH — credentials are adapter input, never envelope input", () => {
  test.each([
    { name: "anonymous", token: "", visible: [], code: "AUTH_REQUIRED" },
    {
      name: "verified owner",
      token: "Bearer test-alice",
      visible: ["order.get", "order.cancel", "shipment.track"],
      code: null,
    },
  ])("$name discovery and invocation", async ({ token, visible, code }) => {
    const handler = authenticated();
    const headers: Record<string, string> = token
      ? { authorization: token }
      : {};
    const catalog = await handler(request("/anwa/catalog", undefined, headers));
    assert.equal(catalog.status, 200);
    assert.deepEqual(
      (await catalog.json()).interactions.map((op: { ref: string }) => op.ref),
      visible,
    );
    const response = await handler(
      request(
        "/anwa/invoke",
        envelope("order.get", { orderId: "pending" }),
        headers,
      ),
    );
    assert.equal(response.status, 200);
    if (code) failure(await response.json(), code);
    else
      assert.deepEqual(success(await response.json()), {
        id: "pending",
        status: "pending",
      });
  });
  test("hidden description is not disclosed", async () => {
    const response = await authenticated()(
      request("/anwa/interactions/order.cancel"),
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "NOT_FOUND");
  });
  test("forged caller field cannot bypass anonymous Guard", async () => {
    const response = await authenticated()(
      request(
        "/anwa/invoke",
        '{"ref":"order.get","input":{"orderId":"pending"},"caller":{"subject":"alice"}}',
      ),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
  });
});

describe("HTTP INPUT — omitted input and explicit null remain distinct", () => {
  test.each([
    { name: "omitted input succeeds", body: '{"ref":"ping"}', code: null },
    {
      name: "explicit null is unexpected input",
      body: '{"ref":"ping","input":null}',
      code: "INVALID_INPUT",
    },
  ])("$name", async ({ body, code }) => {
    const schema = {
      anwa: "0.2",
      entrypoints: ["ping"],
      interactions: { ping: { kind: "query", description: "Ping" } },
    } as const;
    const handler = createAnwaFetchHandler(
      createAnwaApp(schema).bind(
        { ping: () => reply(ok("pong")) },
        { public: ["ping"] },
      ),
    );
    const response = await handler(request("/anwa/invoke", body));
    assert.equal(response.status, 200);
    if (code) failure(await response.json(), code);
    else assert.equal(success(await response.json()), "pong");
  });
});

test("HONO RPC — real HTTP supports health, catalog, description and typed invocation", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => honoApp.fetch(request),
  });
  try {
    const client = hc<AppType>("http://127.0.0.1:" + server.port);
    assert.equal(await (await client.health.$get()).text(), "healthy");
    const catalog = await client.anwa.catalog.$get();
    assert.equal(catalog.status, 200);
    const catalogBody = await catalog.json();
    assert.ok("entrypoints" in catalogBody);
    assert.deepEqual(catalogBody.entrypoints, [
      "calculator.add",
      "calculator.divide",
    ]);
    const found = await client.anwa.interactions[":ref"].$get({
      param: { ref: "calculator.add" },
    });
    assert.equal(found.status, 200);
    const description = await found.json();
    assert.ok("description" in description);
    assert.equal(description.description.ref, "calculator.add");
    const response = await client.anwa.invoke.$post({
      json: { ref: "calculator.add", input: { a: 20, b: 22 } },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok("outcome" in body);
    assert.equal(success(body), 42);
  } finally {
    server.stop(true);
  }
});
