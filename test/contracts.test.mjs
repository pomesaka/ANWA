import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {AnwaApp,fail,ok} from "../src/anwa-v02.mjs";
import {validateManifest,generateTypes} from "../src/schema-v02.mjs";
const fixture=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
const manifests=[
 fixture("../demo/calculator/anwa.json"),
 fixture("../demo/orders/anwa.json"),
 fixture("../demo/reports/anwa.json")
];
const simple=(errors={EXPECTED_FAILURE:"Expected failure"},guard)=>({
 anwa:"0.2",entrypoints:["test.run"],interactions:{
 "test.run":{kind:"action",description:"Test a domain operation",errors,
  ...(guard?{guard}:{})}
 }
});
test("All interaction-first manifests validate",()=>{
 for(const m of manifests)assert.deepEqual(validateManifest(m),[]);
});
test("Thing metadata is optional; entrypoints must name Interactions",()=>{
 assert.equal(manifests[0].things,undefined);
 const bad=structuredClone(manifests[0]);
 bad.entrypoints=[{type:"Calculator",id:"main"}];
 assert.ok(validateManifest(bad).some(x=>x.path.includes("entrypoints")));
 assert.throws(()=>new AnwaApp(bad),/schema invalid/);
});
test("Schema validates first-class refs, optional metadata links and payloads",()=>{
 const bad=structuredClone(manifests[1]);
 bad.interactions["order.cancel"].subjectType="UnknownThing";
 bad.interactions["order.get"].input.properties.orderId.pattern="x";
 const issues=validateManifest(bad).map(x=>x.path);
 assert.ok(issues.some(x=>x.includes("subjectType")));
 assert.ok(issues.some(x=>x.includes("pattern")));
});
test("Type generation is based on Interaction refs, not Thing nesting",()=>{
 const types=generateTypes(manifests[1]);
 assert.match(types,/OrderCancelInput/);
 assert.match(types,/OrderCancelHandler/);
 assert.match(types,/"ORDER_ALREADY_SHIPPED"/);
 assert.match(types,/"UNEXPECTED_ERROR"/);
 assert.match(types,/ShipmentTrackHandler/);
});
test("Binding rejects missing and unknown Interactions",()=>{
 const app=new AnwaApp(manifests[0]);
 assert.throws(()=>app.bind({"calculator.add":async()=>ok(1)}),/Unbound interaction/);
 assert.throws(()=>app.bind({"calculator.add":async()=>ok(1),"calculator.divide":async()=>ok(1),
 "unknown":async()=>ok(1)}),/Unknown or invalid/);
});
test("Guard and handlers preserve declared failures",async()=>{
 const app=new AnwaApp(simple(undefined,"check")).bind({"test.run":async()=>ok(null)},{
  guards:{check:async()=>({allowed:false,error:{code:"EXPECTED_FAILURE",effects:"none"}})}
 });
 const r=await app.interact("test.run");
 assert.equal(r.outcome.result.error.code,"EXPECTED_FAILURE");
 assert.deepEqual(r.context,{next:[]});
});
test("Undeclared errors and unexpected exceptions map to opaque failure",async()=>{
 const app=new AnwaApp(simple()).bind({"test.run":async()=>fail("SECRET","secret")});
 const r=await app.interact("test.run");
 assert.deepEqual(r.outcome.result.error,{
  code:"UNEXPECTED_ERROR",message:"Unexpected application failure",effects:"unknown"
 });
});
test("A context retry is a next candidate with same InteractionRef",async()=>{
 const app=new AnwaApp(simple()).bind({"test.run":async()=>fail("EXPECTED_FAILURE")},{
  context:({ref,outcome})=>({next:outcome?.result?.ok===false?[{
   ref,guidance:{kind:"retry",level:"recommended"},when:{after:"PT30S"}
  }]:[]})
 });
 const r=await app.interact("test.run");
 assert.equal(r.context.next[0].ref,"test.run");
 assert.equal(r.context.next[0].when.after,"PT30S");
 assert.equal(Object.hasOwn(r.outcome.result.error,"retry"),false);
});
test("Context input can bind a dynamic execution ID without an Execution Thing",async()=>{
 const app=new AnwaApp(manifests[2]).bind({
  "report.generate":async()=>({kind:"accepted",execution:{id:"42"}}),
  "execution.status":async()=>ok("accepted"),
  "execution.result":async()=>fail("NOT_READY"),
  "execution.updates":()=>({async *[Symbol.asyncIterator](){}})
 },{
  context:({ref,outcome})=>({next:ref==="report.generate"&&outcome?.kind==="accepted"?[
   {ref:"execution.status",input:{executionId:outcome.execution.id},guidance:{level:"available"}}
  ]:[]})
 });
 const r=await app.interact("report.generate",{topic:"ANWA"});
 assert.equal(r.context.next[0].ref,"execution.status");
 assert.deepEqual(r.context.next[0].input,{executionId:"42"});
});
test("Context rejects unknown refs, wrong retry targets and invalid bound input",async()=>{
 const bad=[
  {next:[{ref:"missing"}]},
  {next:[{ref:"other.action",guidance:{kind:"retry"}}]},
  {next:[{ref:"test.run",when:{after:"tomorrow"}}]},
  {next:[{ref:"test.run",input:{unexpected:123}}]},
  {links:[],affordances:[]}
 ];
 const manifest=simple();
 manifest.interactions["other.action"]={kind:"action",description:"Other action"};
 manifest.interactions["test.run"].input={type:"object",properties:{id:{type:"string"}},required:["id"],additionalProperties:false};
 for(const entry of bad){
  const app=new AnwaApp(manifest).bind({
   "test.run":async()=>ok(null),"other.action":async()=>ok(null)
  },{context:()=>entry});
  const r=await app.interact("test.run",{id:"known"});
  assert.equal(r.outcome.result.error.code,"UNEXPECTED_ERROR");
  assert.deepEqual(r.context,{next:[]});
 }
});
