/** Executable examples demonstrate domain semantics, not just route presence. */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { createCalculator } from "../demo/calculator/index.ts";
import { createOrders } from "../demo/orders/index.ts";
import { createReports } from "../demo/reports/index.ts";
import { success, failure, execution } from "./support/outcome.ts";
const alice = { caller: { subject: "alice" } } as const;

describe("CALCULATOR — arithmetic and input contracts", () => {
  test.each([
    {
      name: "addition returns sum",
      ref: "calculator.add",
      input: { a: 2, b: 3 },
      expected: { ok: true, value: 5 },
    },
    {
      name: "division returns quotient",
      ref: "calculator.divide",
      input: { a: 12, b: 3 },
      expected: { ok: true, value: 4 },
    },
    {
      name: "division by zero returns declared failure",
      ref: "calculator.divide",
      input: { a: 1, b: 0 },
      expected: {
        ok: false,
        error: {
          code: "DIVIDE_BY_ZERO",
          message: "Cannot divide by zero",
          effects: "none",
        },
      },
    },
  ])("$name", async ({ ref, input, expected }) => {
    assert.deepEqual(await createCalculator().follow({ ref, input }), {
      outcome: { kind: "settled", result: expected },
      context: { next: [] },
    });
  });
  test.each([
    { name: "string operand", input: { a: "bad", b: 3 } },
    { name: "missing operand", input: { a: 2 } },
    { name: "extra property", input: { a: 2, b: 3, caller: "alice" } },
    { name: "explicit null", input: null },
  ])("$name is invalid input", async ({ input }) => {
    const result = await createCalculator().follow({
      ref: "calculator.add",
      input,
    });
    failure(result, "INVALID_INPUT");
    assert.deepEqual(result.context.next, []);
  });
});

describe("ORDERS — cancellation is a state transition, not a retry instruction", () => {
  test("pending order is cancelled and next.get confirms the persisted state", async () => {
    const app = createOrders();
    const response = await app.interact(
      "order.cancel",
      { orderId: "pending", reason: "Changed mind" },
      alice,
    );
    assert.deepEqual(success(response), { status: "cancelled" });
    assert.deepEqual(response.context.next, [
      {
        ref: "order.get",
        input: { orderId: "pending" },
        guidance: { level: "recommended" },
      },
    ]);
    assert.deepEqual(
      success(await app.follow(response.context.next[0], alice)),
      { id: "pending", status: "cancelled" },
    );
    failure(
      await app.interact(
        "order.cancel",
        { orderId: "pending", reason: "Changed mind" },
        alice,
      ),
      "ALREADY_CANCELLED",
    );
  });
  test("shipped order remains shipped and offers tracking instead of cancellation retry", async () => {
    const app = createOrders();
    const response = await app.interact(
      "order.cancel",
      { orderId: "shipped", reason: "Changed mind" },
      alice,
    );
    failure(response, "ORDER_ALREADY_SHIPPED");
    assert.deepEqual(response.context.next, [
      {
        ref: "order.get",
        input: { orderId: "shipped" },
        guidance: { level: "available" },
      },
      {
        ref: "shipment.track",
        input: { shipmentId: "shipped-ship" },
        guidance: { level: "recommended" },
      },
    ]);
    assert.equal(
      success(await app.follow(response.context.next[1], alice)),
      "delivered",
    );
    assert.deepEqual(
      success(await app.follow(response.context.next[0], alice)),
      { id: "shipped", status: "shipped" },
    );
  });
});

describe("REPORTS — accepted work, pending result and completed stream", () => {
  test("pending result advertises retry; completion yields the final artifact", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = createReports({ wait: () => pending });
    const started = await app.interact("report.generate", { topic: "ANWA" });
    const executionId = execution(started);
    const waiting = await app.interact("execution.result", { executionId });
    failure(waiting, "NOT_READY");
    assert.deepEqual(waiting.context.next[0], {
      ref: "execution.result",
      input: { executionId },
      guidance: { kind: "retry", level: "recommended" },
      when: { after: "PT0.05S" },
    });
    release();
    const events: any[] = [];
    for await (const event of app.observe("execution.updates", { executionId }))
      events.push(event);
    assert.deepEqual(
      events.map((event) => [event.sequence, event.type]),
      [
        [1, "state.changed"],
        [2, "artifact.delta"],
        [3, "artifact.delta"],
        [4, "settled"],
      ],
    );
    const expected = "Report: ANWA\nSummary: generated in two parts.\n";
    assert.equal(success(events[3].response), expected);
    assert.equal(
      success(await app.interact("execution.result", { executionId })),
      expected,
    );
  });
  test.each(["execution.status", "execution.result"] as const)(
    "%s rejects unknown execution handles",
    async (ref) => {
      failure(
        await createReports().interact(ref, { executionId: "missing" }),
        "NOT_FOUND",
      );
    },
  );
});
