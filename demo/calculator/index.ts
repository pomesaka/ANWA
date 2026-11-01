import { readFileSync } from "node:fs";
import { AnwaApp, fail, ok, reply, type Manifest } from "../../src/anwa.ts";

const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8")) as Manifest;

export function createCalculator(): AnwaApp {
  return new AnwaApp(schema).bind({
    "calculator.add": async ({ input }) => reply(ok(input.a + input.b)),
    "calculator.divide": async ({ input }) =>
      input.b === 0
        ? reply(fail("DIVIDE_BY_ZERO", "Cannot divide by zero", { effects: "none" }))
        : reply(ok(input.a / input.b)),
  });
}
