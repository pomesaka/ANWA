// Compile-time Hono RPC checks. Included in bun check, not bun test.
// The ANWA Fetch binding stays runtime-authoritative, while the chained
// Hono router exposes the manifest-derived JSON request shape to hc().
import { hc, type InferRequestType, type InferResponseType } from "hono/client";
import type { AppType } from "../demo/http/hono.ts";

const client = hc<AppType>("https://example.test");
void client.health.$get;
void client.anwa.catalog.$get;
void client.anwa.interactions[":ref"].$get;
void client.anwa.invoke.$post;

type Assert<T extends true> = T;
type NotAny<T> = 0 extends 1 & T ? false : true;
type NotUnknown<T> = unknown extends T ? false : true;

type InvokeInput = InferRequestType<typeof client.anwa.invoke.$post>["json"];
type CatalogOutput = InferResponseType<typeof client.anwa.catalog.$get>;
type DiscoveryOutput = InferResponseType<typeof client.anwa.interactions[":ref"].$get>;
type InvokeOutput = InferResponseType<typeof client.anwa.invoke.$post>;

export type CheckTypedInput = Assert<NotAny<InvokeInput>>;
export type CheckTypedCatalog = Assert<NotUnknown<CatalogOutput>>;
export type CheckTypedDiscovery = Assert<NotUnknown<DiscoveryOutput>>;
export type CheckTypedInvoke = Assert<NotUnknown<InvokeOutput>>;

const goodInput: InvokeInput = {
  ref: "calculator.add",
  input: { a: 2, b: 3 },
};
void goodInput;

// @ts-expect-error The ANWA manifest declares numeric calculator inputs.
const invalidInput: InvokeInput = { ref: "calculator.add", input: { a: "bad", b: 3 } };
void invalidInput;

// @ts-expect-error InteractionRefs are limited to calculator.add/divide.
const unknownRef: InvokeInput = { ref: "calculator.missing", input: { a: 1, b: 2 } };
void unknownRef;

// @ts-expect-error Input is required for calculator.add.
const missingInput: InvokeInput = { ref: "calculator.add" };
void missingInput;

// @ts-expect-error Hono RPC must not expose a made-up route.
void client.anwa.unknown.$get;

const descriptorRequest = client.anwa.interactions[":ref"].$get({
  param: { ref: "calculator.add" },
});
void descriptorRequest;
