// AUTO-GENERATED from anwa.json; do not edit. Run bun run codegen.
import type { Manifest } from "../../src/schema-tools.ts";
export const schema = {
  anwa: "0.2",
  entrypoints: ["order.get", "order.cancel", "shipment.track"],
  interactions: {
    "order.get": {
      kind: "query",
      description: "Read the current state of an order by its ID.",
      input: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "Order identifier",
          },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Current fulfillment state of this order.",
          },
          id: {
            type: "string",
            description: "Application-assigned order identifier.",
          },
        },
        required: ["status", "id"],
      },
      errors: {
        NOT_FOUND: "The order could not be found.",
        AUTH_REQUIRED: "A verified caller is required for this interaction.",
        PERMISSION_DENIED:
          "The caller does not have permission for this resource.",
      },
      guard: "canReadOrder",
    },
    "order.cancel": {
      kind: "action",
      description: "Request cancellation of an order.",
      guard: "canCancel",
      input: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "Order identifier",
          },
          reason: {
            type: "string",
            description:
              "Human-provided explanation for requesting cancellation.",
          },
        },
        required: ["orderId", "reason"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "New order status after successful cancellation.",
          },
        },
        required: ["status"],
      },
      errors: {
        ORDER_ALREADY_SHIPPED: "Cancellation is not available after dispatch.",
        NOT_FOUND: "The order was not found.",
        ALREADY_CANCELLED: "The order has already been cancelled.",
        ORDER_STATE_CHANGED:
          "The order changed while cancellation was being attempted.",
        AUTH_REQUIRED: "A verified caller is required for this interaction.",
        PERMISSION_DENIED:
          "The caller does not have permission for this resource.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "shipment.track": {
      kind: "query",
      description: "Read current shipment tracking state by shipment ID.",
      input: {
        type: "object",
        properties: {
          shipmentId: {
            type: "string",
            description: "Shipment identifier",
          },
        },
        required: ["shipmentId"],
        additionalProperties: false,
      },
      output: {
        type: "string",
        description: "Current tracking state.",
      },
      errors: {
        NOT_FOUND: "The shipment could not be found.",
        AUTH_REQUIRED: "A verified caller is required for this interaction.",
        PERMISSION_DENIED:
          "The caller does not have permission for this resource.",
      },
      guard: "canTrackShipment",
    },
  },
} as const satisfies Manifest;
