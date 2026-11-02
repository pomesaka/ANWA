import { test } from "bun:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { respondToFailure, type HttpFailure } from "../src/http/protocol.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const authoredDirectories = ["src", "demo", "test", "tools"];

function collectSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectSources(path)
      : entry.isFile() && entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

test("authored TypeScript code has no try/catch blocks", () => {
  // A try/finally cleanup block is not an exception handler.
  const catchBlocks = /\bcatch\s*(?:\(|\{)/;
  for (const folder of authoredDirectories) {
    for (const path of collectSources(join(repositoryRoot, folder))) {
      assert.doesNotMatch(
        readFileSync(path, "utf8"),
        catchBlocks,
        "Unexpected try/catch block in " + path,
      );
    }
  }
});

test("all tagged HTTP protocol failures map to explicit status and code", async () => {
  const failures: Array<[HttpFailure, number, string]> = [
    [
      { kind: "invalid-request", title: "Invalid JSON request" },
      400,
      "INVALID_REQUEST",
    ],
    [{ kind: "unsupported-media" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
    [{ kind: "payload-too-large" }, 413, "PAYLOAD_TOO_LARGE"],
    [{ kind: "unauthenticated" }, 401, "UNAUTHENTICATED"],
    [{ kind: "invalid-caller" }, 500, "ADAPTER_ERROR"],
    [{ kind: "not-found", title: "Interaction not found" }, 404, "NOT_FOUND"],
    [{ kind: "method-not-allowed", allow: "POST" }, 405, "METHOD_NOT_ALLOWED"],
    [{ kind: "internal" }, 500, "INTERNAL_ERROR"],
  ];
  for (const [failure, status, code] of failures) {
    const response = respondToFailure(failure);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/problem\+json/,
    );
    const body = await response.json();
    assert.deepEqual(
      { type: body.type, status: body.status, code: body.code },
      {
        type: "about:blank",
        status,
        code,
      },
    );
    if (failure.kind === "method-not-allowed")
      assert.equal(response.headers.get("allow"), "POST");
  }
});
