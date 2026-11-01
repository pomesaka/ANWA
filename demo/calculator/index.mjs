import { readFileSync } from "node:fs";
import { AnwaApp, fail, ok } from "../../src/anwa-v02.mjs";

const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8"));

export function createCalculator() {
  return new AnwaApp(schema).bind({
    "calculator.add": async ({ input }) => ok(input.a + input.b),
    "calculator.divide": async ({ input }) => input.b === 0
      ? fail("DIVIDE_BY_ZERO", "Cannot divide by zero", { effects: "none" })
      : ok(input.a / input.b)
  });
}
