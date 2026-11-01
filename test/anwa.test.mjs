import test from "node:test";
import assert from "node:assert/strict";
import {createCalculator} from "../demo/calculator/index.mjs";
import {createOrders} from "../demo/orders/index.mjs";
import {createReports} from "../demo/reports/index.mjs";

test("Interaction-first catalogs and Discovery do not require a Thing",async()=>{
 const app=createCalculator();
 assert.deepEqual(app.catalog().entrypoints,["calculator.add","calculator.divide"]);
 assert.equal(Object.hasOwn(app.catalog(),"things"),false);
 const discovered=await app.discover("calculator.divide");
 assert.equal(discovered.description.ref,"calculator.divide");
 assert.equal(discovered.description.kind,"action");
 assert.deepEqual(discovered.context,{next:[]});
});
test("stateless Interaction success and declared error use Outcome + Context",async()=>{
 const app=createCalculator();
 assert.deepEqual(await app.interact("calculator.add",{a:2,b:3}),
  {outcome:{kind:"settled",result:{ok:true,value:5}},context:{next:[]}});
 const failure=await app.interact("calculator.divide",{a:1,b:0});
 assert.equal(failure.outcome.result.error.code,"DIVIDE_BY_ZERO");
 assert.deepEqual(failure.context,{next:[]});
});
test("input contract errors do not call a handler",async()=>{
 const result=await createCalculator().interact("calculator.add",{a:"bad",b:1});
 assert.equal(result.outcome.result.error.code,"INVALID_INPUT");
 assert.deepEqual(result.context,{next:[]});
});
test("Orders run entirely through Interactions without Thing metadata",async()=>{
 const app=createOrders();
 assert.equal(Object.hasOwn(app.catalog(),"things"),false);
 assert.equal(Object.hasOwn(app.describe("order.cancel"),"subjectType"),false);
 const result=await app.interact("order.cancel",{orderId:"pending",reason:"Changed mind"});
 assert.equal(result.outcome.result.value.status,"cancelled");
 assert.deepEqual(result.context.next.find(x=>x.ref==="order.get").input,{orderId:"pending"});
 const confirmed=await app.interact("order.get",{orderId:"pending"});
 assert.equal(confirmed.outcome.result.value.status,"cancelled");
});
test("Domain failure recommends another Interaction with bound input",async()=>{
 const app=createOrders();
 const failure=await app.interact("order.cancel",{orderId:"shipped",reason:"Changed mind"});
 assert.equal(failure.outcome.result.error.code,"ORDER_ALREADY_SHIPPED");
 const next=failure.context.next.find(x=>x.ref==="shipment.track");
 assert.deepEqual(next.input,{shipmentId:"shipped-ship"});
 assert.equal(next.guidance.level,"recommended");
 const tracking=await app.interact(next.ref,next.input);
 assert.equal(tracking.outcome.result.value,"delivered");
 assert.equal(failure.context.next.some(x=>x.ref==="order.cancel"),false);
});
test("Report execution works with no Execution Thing",async()=>{
 const app=createReports();
 assert.equal(Object.hasOwn(app.catalog(),"things"),false);
 const start=await app.interact("report.generate",{topic:"ANWA"});
 assert.equal(start.outcome.kind,"accepted");
 const id=start.outcome.execution.id;
 assert.equal(typeof id,"string");
 const notReady=await app.interact("execution.result",{executionId:id});
 assert.equal(notReady.outcome.result.error.code,"NOT_READY");
 const retry=notReady.context.next.find(x=>x.guidance?.kind==="retry");
 assert.equal(retry.ref,"execution.result");
 assert.deepEqual(retry.input,{executionId:id});
 assert.equal(retry.when.after,"PT0.05S");
 const events=[];
 for await(const event of app.observe("execution.updates",{executionId:id}))events.push(event);
 assert.equal(events.at(-1).type,"settled");
 assert.equal(events.at(-1).response.outcome.result.ok,true);
 assert.match((await app.interact("execution.result",{executionId:id})).outcome.result.value,/ANWA/);
});
