// Compile-time regression checks. This module is included in bun check, not bun test.
import { AnwaApp, fail, ok, reply } from "../src/anwa.ts";
import type {
  BindingsFor,
  GuardsFor,
  InputOf,
  OutputOf,
  ErrorCodes,
} from "../src/contracts.ts";
import { schema as orders } from "../demo/orders/contract.generated.ts";
import { schema as calculator } from "../demo/calculator/contract.generated.ts";
import type { InteractionDefinition } from "../src/schema-tools.ts";

type Cancel = (typeof orders)["interactions"]["order.cancel"];
type CancelInput = InputOf<Cancel>;
type CancelOutput = OutputOf<Cancel>;
type CancelError = ErrorCodes<Cancel>;
type GuardedHandler = BindingsFor<typeof orders>["order.cancel"];
type CancelReturn = Awaited<ReturnType<GuardedHandler["run"]>>;
type CancelGuard = GuardsFor<typeof orders>["canCancel"];
type GuardInput = Parameters<CancelGuard>[0]["input"];
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type CheckInput = Assert<
  CancelInput extends { orderId: string; reason: string } ? true : false
>;
export type CheckOutput = Assert<
  CancelOutput extends { status: string } ? true : false
>;
export type CheckErrors = Assert<
  Equal<
    CancelError,
    | "ORDER_ALREADY_SHIPPED"
    | "NOT_FOUND"
    | "ALREADY_CANCELLED"
    | "ORDER_STATE_CHANGED"
    | "AUTH_REQUIRED"
    | "PERMISSION_DENIED"
  >
>;
export type CheckGuardInput = Assert<Equal<GuardInput, CancelInput>>;

const validInput: CancelInput = { orderId: "123", reason: "test" };
void validInput;

// @ts-expect-error orderId comes from schema and must be a string
const badInput: CancelInput = { orderId: 123, reason: "test" };
void badInput;

// @ts-expect-error output.status comes from schema and must be a string
const badOutput: CancelReturn = reply(ok({ status: 123 }));
void badOutput;

// @ts-expect-error SECRET is not one of order.cancel's declared domain errors
const undeclaredError: CancelReturn = reply(fail("SECRET"));
void undeclaredError;

const app = new AnwaApp(calculator);
// @ts-expect-error the generated type requires both a and b to be numeric
void app.interact("calculator.add", { a: 1, b: "oops" });

// @ts-expect-error there is no calculator.unknown InteractionRef
void app.interact("calculator.unknown", { a: 1, b: 2 });

// @ts-expect-error schema-driven bind requires the calculator.divide handler
void app.bind({
  "calculator.add": async ({ input }) => reply(ok(input.a + input.b)),
});

const explicitPureAction: InteractionDefinition = {
  kind: "action",
  description: "A side-effect-free action",
  hasSideEffects: false,
  idempotent: true,
};
void explicitPureAction;

// @ts-expect-error Actions must declare both effect and idempotency booleans
const missingActionFlags: InteractionDefinition = {
  kind: "action",
  description: "Should be rejected at compile time",
};
void missingActionFlags;
