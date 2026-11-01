import { AnwaApp, fail, ok, reply } from "../../src/anwa.ts";

import { schema } from "./contract.generated.ts";

export function createCalculator(): AnwaApp<typeof schema> {
  return new AnwaApp(schema).bind({
    "calculator.add": async ({ input }) => reply(ok(input.a + input.b)),
    "calculator.divide": async ({ input }) =>
      input.b === 0
        ? reply(
            fail("DIVIDE_BY_ZERO", "Cannot divide by zero", {
              effects: "none",
            }),
          )
        : reply(ok(input.a / input.b)),
  });
}
