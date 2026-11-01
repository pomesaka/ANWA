import { readFileSync } from "node:fs";
import { AnwaApp, fail, ok, reply, type Manifest, type NextInteraction } from "../../src/anwa.ts";

const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8")) as Manifest;
interface Order { id: string; status: "pending" | "shipped" | "cancelled"; shipmentId: string }

export function createOrders(): AnwaApp {
  const orders = new Map<string, Order>([
    ["pending", { id: "pending", status: "pending", shipmentId: "pending-ship" }],
    ["shipped", { id: "shipped", status: "shipped", shipmentId: "shipped-ship" }],
  ]);
  const shipments = new Map<string, string>([
    ["pending-ship", "preparing"], ["shipped-ship", "delivered"],
  ]);

  const app = new AnwaApp(schema);
  return app.bind({
    "order.get": async ({ input }) => {
      const item = orders.get(input.orderId);
      if (!item) return reply(fail("NOT_FOUND", "Order not found"));
      const next: NextInteraction[] = [];
      if (item.status === "pending") {
        // Input is omitted here because the user must provide a cancellation reason.
        next.push({ ref: "order.cancel", guidance: { level: "available" } });
      }
      return reply(ok({ id: item.id, status: item.status }), next);
    },

    "order.cancel": async ({ input }) => {
      const order = orders.get(input.orderId);
      const decision = await app.assess("order.cancel", input);
      if (!decision.allowed) {
        const next: NextInteraction[] = order ? [
          { ref: "order.get", input: { orderId: order.id }, guidance: { level: "available" } },
        ] : [];
        if (order?.status === "shipped") next.push({
          ref: "shipment.track",
          input: { shipmentId: order.shipmentId },
          guidance: { level: "recommended" },
        });
        return reply({ ok: false, error: decision.error }, next);
      }
      // Application-owned state transition; production storage must be atomic.
      if (!order || order.status !== "pending")
        return reply(fail("ORDER_STATE_CHANGED", "Order changed during cancellation"));
      order.status = "cancelled";
      return reply(ok({ status: order.status }), [
        { ref: "order.get", input: { orderId: order.id }, guidance: { level: "recommended" } },
      ]);
    },

    "shipment.track": async ({ input }) => {
      const state = shipments.get(input.shipmentId);
      return state === undefined
        ? reply(fail("NOT_FOUND", "Shipment not found"))
        : reply(ok(state));
    },
  }, {
    guards: {
      canCancel: async ({ input }) => {
        const order = orders.get(input.orderId);
        if (!order) return { allowed: false, error: { code: "NOT_FOUND", effects: "none" } };
        if (order.status === "shipped")
          return { allowed: false, error: { code: "ORDER_ALREADY_SHIPPED", effects: "none" } };
        if (order.status === "cancelled")
          return { allowed: false, error: { code: "ALREADY_CANCELLED", effects: "none" } };
        return { allowed: true };
      },
    },
  });
}
