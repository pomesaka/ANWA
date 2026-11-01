import { readFileSync } from "node:fs";
import { AnwaApp, fail, ok, thing } from "../../src/anwa.mjs";
const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8"));

export const calculatorRef = thing("Calculator", "main");

export function createCalculator() {
  return new AnwaApp(schema).bind("Calculator", {
    actions: {
      add: async ({ input }) => ok(input.a + input.b),
      divide: async ({ input }) => input.b === 0
        ? fail("DIVIDE_BY_ZERO", "Cannot divide by zero", {
            retry: { mode: "after-input-change" }
          })
        : ok(input.a / input.b)
    }
  });
}
