import { readFileSync } from "node:fs";
import { AnwaApp, fail, interaction, ok, thing } from "../../src/anwa.mjs";
const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8"));

export const orderRef = id => thing("Order", id);

export function createOrders() {
  const orders = new Map([
    ["pending", { id: "pending", status: "pending", shipmentId: "pending-ship" }],
    ["shipped", { id: "shipped", status: "shipped", shipmentId: "shipped-ship" }]
  ]);
  const shipments = new Map([
    ["pending-ship", "preparing"], ["shipped-ship", "delivered"]
  ]);
  const app = new AnwaApp(schema);

  app.bind("Order", {
    guards: {
      canCancel: async ({ thing: target }) => {
        const order = orders.get(target.id);
        if (!order) return { allowed: false, error: { code: "NOT_FOUND" } };
        if (order.status === "shipped") return {
          allowed: false, error: {
            code: "ORDER_ALREADY_SHIPPED", retry: { mode: "never" }
          }
        };
        if (order.status === "cancelled") return {
          allowed: false, error: { code: "ALREADY_CANCELLED" }
        };
        return { allowed: true };
      }
    },
    properties: {
      summary: async ({ thing: target }) => {
        const item = orders.get(target.id);
        return item ? ok({ id: item.id, status: item.status }) : fail("NOT_FOUND");
      }
    },
    actions: {
      cancel: async ({ thing: target }) => {
        const order = orders.get(target.id);
        // Real applications must enforce state transitions atomically in their storage layer.
        if (!order) return fail("NOT_FOUND");
        if (order.status !== "pending") return fail("ORDER_STATE_CHANGED", "Cannot cancel now");
        order.status = "cancelled";
        return ok({ status: order.status });
      }
    },
    context: async ({ thing: target }) => {
      const order = orders.get(target.id);
      if (!order) return { links: [], affordances: [] };
      const shipment = thing("Shipment", order.shipmentId);
      const decision = await app.assess(target, "cancel");
      return {
        links: [{ rel: "shipment", target: shipment }],
        affordances: [
          { ref: interaction(target, "property", "summary") },
          {
            ref: interaction(target, "action", "cancel"),
            applicability: decision.allowed
              ? { state: "available" }
              : { state: "blocked", reason: decision.error.code }
          },
          { ref: interaction(shipment, "property", "tracking") }
        ]
      };
    }
  });

  app.bind("Shipment", {
    properties: {
      tracking: async ({ thing: target }) => shipments.has(target.id)
        ? ok(shipments.get(target.id))
        : fail("NOT_FOUND")
    }
  });
  return app;
}
