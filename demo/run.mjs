import { createCalculator } from "./calculator/index.mjs";
import { createOrders, orderRef } from "./orders/index.mjs";
import { createReports, reportServiceRef } from "./reports/index.mjs";
import { interaction } from "../src/anwa.mjs";

const print = (label, value) => console.log("\n" + label + "\n" + JSON.stringify(value, null, 2));
const calc = createCalculator();
print("Calculator catalog", calc.catalog());
print("Calculator discovery", await calc.discover(calc.catalog().entrypoints[0]));
print("Calculator add", await calc.interact(interaction(calc.catalog().entrypoints[0], "action", "add"), { a: 2, b: 3 }));
const orders = createOrders();
print("Order cancellation", await orders.interact(interaction(orderRef("pending"), "action", "cancel"), { reason: "Changed mind" }));
print("Shipped order (domain failure)", await orders.interact(interaction(orderRef("shipped"), "action", "cancel"), { reason: "Changed mind" }));
const reports = createReports();
const started = await reports.interact(interaction(reportServiceRef, "action", "generate"), { topic: "ANWA" });
print("Report accepted", started);
for await (const event of reports.observe(interaction(started.outcome.execution, "event", "updates"))) {
  print("Report event", event);
}
