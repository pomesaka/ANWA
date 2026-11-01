import {
  AnwaApp,
  fail,
  ok,
  reply,
  type NextInteraction,
  type VerifiedCaller,
} from "../../src/anwa.ts";
import { schema } from "./contract.generated.ts";
import type { GuardDecision } from "../../src/contracts.ts";

interface Order {
  id: string;
  owner: string;
  status: "pending" | "shipped" | "cancelled";
  shipmentId: string;
}

/** Example domain policy; real authorization belongs to the application's data layer. */
function access(
  caller: VerifiedCaller | null,
  owner?: string,
): GuardDecision<"AUTH_REQUIRED" | "PERMISSION_DENIED"> {
  if (!caller)
    return {
      allowed: false,
      error: { code: "AUTH_REQUIRED" as const, effects: "none" as const },
    };
  if (!owner || caller.subject !== owner)
    return {
      allowed: false,
      error: { code: "PERMISSION_DENIED" as const, effects: "none" as const },
    };
  return { allowed: true } as const;
}

export function createOrders(): AnwaApp<typeof schema> {
  const orders = new Map<string, Order>([
    [
      "pending",
      {
        id: "pending",
        owner: "alice",
        status: "pending",
        shipmentId: "pending-ship",
      },
    ],
    [
      "shipped",
      {
        id: "shipped",
        owner: "alice",
        status: "shipped",
        shipmentId: "shipped-ship",
      },
    ],
  ]);
  const shipments = new Map<string, string>([
    ["pending-ship", "preparing"],
    ["shipped-ship", "delivered"],
  ]);

  return new AnwaApp(schema).bind(
    {
      "order.get": {
        run: async ({ input }) => {
          const item = orders.get(input.orderId);
          if (!item) return reply(fail("NOT_FOUND", "Order not found"));
          const next: NextInteraction[] = [];
          if (item.status === "pending")
            next.push({
              ref: "order.cancel",
              guidance: { level: "available" },
            });
          return reply(ok({ id: item.id, status: item.status }), next);
        },
        onDenied: () => [],
      },

      "order.cancel": {
        run: async ({ input }) => {
          const item = orders.get(input.orderId);
          // A real database must revalidate the required conditions atomically.
          if (!item || item.status !== "pending")
            return reply(
              fail("ORDER_STATE_CHANGED", "Order changed during cancellation"),
            );
          item.status = "cancelled";
          return reply(ok({ status: item.status }), [
            {
              ref: "order.get",
              input: { orderId: item.id },
              guidance: { level: "recommended" },
            },
          ]);
        },
        onDenied: ({ input, error }) => {
          if (error.code !== "ORDER_ALREADY_SHIPPED") return [];
          const item = orders.get(input.orderId);
          if (!item) return [];
          return [
            {
              ref: "order.get",
              input: { orderId: item.id },
              guidance: { level: "available" },
            },
            {
              ref: "shipment.track",
              input: { shipmentId: item.shipmentId },
              guidance: { level: "recommended" },
            },
          ];
        },
      },

      "shipment.track": {
        run: async ({ input }) => {
          const status = shipments.get(input.shipmentId);
          return status === undefined
            ? reply(fail("NOT_FOUND", "Shipment not found"))
            : reply(ok(status));
        },
        onDenied: () => [],
      },
    },
    {
      // Discoverability is coarse-grained because Discovery does not yet have resource input.
      // This reveals operation names to authenticated callers, not other users' order data.
      discoverable: ({ caller }) => caller !== null,
      guards: {
        canReadOrder: ({ caller, input }) =>
          access(caller, orders.get(input.orderId)?.owner),
        canCancel: ({ caller, input }) => {
          const allowed = access(caller, orders.get(input.orderId)?.owner);
          if (!allowed.allowed) return allowed;
          const item = orders.get(input.orderId);
          if (item?.status === "shipped")
            return {
              allowed: false,
              error: { code: "ORDER_ALREADY_SHIPPED", effects: "none" },
            };
          if (item?.status === "cancelled")
            return {
              allowed: false,
              error: { code: "ALREADY_CANCELLED", effects: "none" },
            };
          return { allowed: true };
        },
        canTrackShipment: ({ caller, input }) => {
          const order = [...orders.values()].find(
            (item) => item.shipmentId === input.shipmentId,
          );
          return access(caller, order?.owner);
        },
      },
    },
  );
}
