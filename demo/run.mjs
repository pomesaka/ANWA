import {createCalculator} from "./calculator/index.mjs";
import {createOrders} from "./orders/index.mjs";
import {createReports} from "./reports/index.mjs";
const print=(label,value)=>console.log("\n"+label+"\n"+JSON.stringify(value,null,2));
const calculator=createCalculator();
print("Calculator catalog",calculator.catalog());
print("Discover calculator.divide",await calculator.discover("calculator.divide"));
print("Add",await calculator.interact("calculator.add",{a:2,b:3}));
const orders=createOrders();
print("Order cancelled",await orders.interact("order.cancel",{orderId:"pending",reason:"Changed mind"}));
print("Shipped cannot cancel",await orders.interact("order.cancel",{orderId:"shipped",reason:"Changed mind"}));
const reports=createReports();
const accepted=await reports.interact("report.generate",{topic:"ANWA"});
print("Report accepted",accepted);
for await(const event of reports.observe("execution.updates",{executionId:accepted.outcome.execution.id}))
 print("Report update",event);
