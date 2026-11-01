// AUTO-GENERATED from anwa.json; do not edit. Run bun run codegen.
import type { Manifest } from "../../src/schema-tools.ts";
export const schema = {
  "anwa": "0.2",
  "entrypoints": [
    "calculator.add",
    "calculator.divide"
  ],
  "interactions": {
    "calculator.add": {
      "kind": "action",
      "description": "Add two numbers.",
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "number",
            "description": "The first numeric operand."
          },
          "b": {
            "type": "number",
            "description": "The second numeric operand."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number",
        "description": "Sum of a and b."
      },
      "hasSideEffects": false,
      "idempotent": true
    },
    "calculator.divide": {
      "kind": "action",
      "description": "Divide a by b; division by zero is a typed domain failure.",
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "number",
            "description": "The first numeric operand."
          },
          "b": {
            "type": "number",
            "description": "The second numeric operand."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number",
        "description": "Quotient a / b."
      },
      "errors": {
        "DIVIDE_BY_ZERO": "The divisor must be nonzero."
      },
      "hasSideEffects": false,
      "idempotent": true
    }
  }
} as const satisfies Manifest;
