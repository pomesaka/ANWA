import { createCalculator } from "./calculator/index.ts";
import { createOrders } from "./orders/index.ts";
import { createReports } from "./reports/index.ts";

const print = (label: string, data: unknown): void => {
  console.log("\n" + label + "\n" + JSON.stringify(data, null, 2));
};

const calculator = createCalculator();
print("Calculator", calculator.catalog());
print("Discover calculator.divide", calculator.discover("calculator.divide"));
print("Add", await calculator.interact("calculator.add", { a: 2, b: 3 }));

const orders = createOrders();
print(
  "Cancel pending",
  await orders.interact("order.cancel", {
    orderId: "pending",
    reason: "Changed my mind",
  }),
);
print(
  "Already shipped",
  await orders.interact("order.cancel", {
    orderId: "shipped",
    reason: "Changed my mind",
  }),
);

const reports = createReports();
const start = await reports.interact("report.generate", { topic: "ANWA" });
print("Report accepted", start);
if (start.outcome.kind === "accepted") {
  for await (const event of reports.observe("execution.updates", {
    executionId: start.outcome.execution.id,
  }))
    print("Report event", event);
}
