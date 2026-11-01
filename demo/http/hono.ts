// Run with Bun from repository root: bun demo/http/hono.ts
// This is an example of attaching the framework-independent Fetch adapter to
// an existing Hono router, not a separate ANWA web server.
import { Hono } from "hono";
import { createCalculator } from "../calculator/index.ts";
import { createAnwaFetchHandler } from "../../src/http/fetch.ts";

const app = new Hono();
app.get("/health", (c) => c.text("healthy"));

const anwa = createAnwaFetchHandler(createCalculator());
app.all("/anwa/*", (c) => anwa(c.req.raw));

export default app;

if (import.meta.main) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? "3000"),
    fetch: (request) => app.fetch(request),
  });
  console.log("Hono/ANWA listening on http://127.0.0.1:" + server.port);
}
