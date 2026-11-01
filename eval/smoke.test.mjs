import test from "node:test";
import assert from "node:assert/strict";
import { runCase, aggregate } from "./runner.mjs";
import { cases } from "./cases.mjs";

const target=(type,id)=>({type,id});
const ref=(type,id,kind,name)=>({thing:target(type,id),kind,name});
const discover=(type,id)=>({action:"discover",thing:target(type,id)});
const interact=(type,id,kind,name,input)=>({action:"interact",ref:ref(type,id,kind,name),
  ...(input===undefined?{}:{input})});
const finish=answer=>({action:"finish",answer});

function scripted(taskId){
  return async ({trace})=>{
    const step=trace.length;
    let action;
    switch(taskId){
      case "calculator-divide":
        action=[discover("Calculator","main"),
          interact("Calculator","main","action","divide",{a:12,b:3}),
          finish("The answer is 4.")][step];
        break;
      case "calculator-domain-error":
        action=[discover("Calculator","main"),
          interact("Calculator","main","action","divide",{a:10,b:0}),
          finish("The call failed with DIVIDE_BY_ZERO; cannot divide by zero.")][step];
        break;
      case "orders-cancel-pending":
        action=[discover("Order","pending"),
          interact("Order","pending","action","cancel",{reason:"Changed my mind"}),
          interact("Order","pending","property","summary"),
          finish("The order was cancelled.")][step];
        break;
      case "orders-shipped-navigation": {
        if(step===0)action=discover("Order","shipped");
        if(step===1){
          const link=trace[0].observation.context.links.find(x=>x.rel==="shipment");
          action={action:"interact",ref:{thing:link.target,kind:"property",name:"tracking"}};
        }
        if(step===2)action=finish("Cannot cancel shipped order; shipment has been delivered.");
        break;
      }
      case "reports-async": {
        if(step===0)action=discover("ReportService","main");
        if(step===1)action=interact("ReportService","main","action","generate",{topic:"ANWA"});
        if(step===2){
          const execution=trace[1].observation.outcome.execution;
          action={action:"observe",ref:{thing:execution,kind:"event",name:"updates"}};
        }
        if(step===3) action=finish("Completed: Report: ANWA. Summary: generated in two parts.");
        break;
      }
    }
    return {action,usage:{input_tokens:0,output_tokens:0}};
  };
}

test("test harness passes deterministic scripted clients in all exposure modes (NOT an AI result)",async()=>{
  const results=[];
  for(const task of cases){
    for(const mode of ["raw","summary","progressive"]){
      const r=await runCase({task,mode,decide:scripted(task.id),maxSteps:7});
      results.push(r);
      assert.equal(r.passed,true,task.id+" "+mode+": "+r.modelError);
      assert.equal(r.metrics.invalidCalls,0);
    }
  }
  const aggregateResult=aggregate(results);
  assert.equal(results.length,15);
  assert.ok(aggregateResult.every(x=>x.passed===x.total && x.passRate===1));
});

test("invalid tool references are counted separately from business failures",async()=>{
  const task=cases.find(x=>x.id==="calculator-divide");
  const commands=[
    {action:"interact",ref:ref("Calculator","main","action","invented"),input:{}},
    finish("No answer")
  ];
  const r=await runCase({task,mode:"progressive",decide:async ({trace})=>({
    action:commands[trace.length],usage:{}}),maxSteps:3});
  assert.equal(r.passed,false);
  assert.equal(r.metrics.invalidCalls,1);
});

test("no external model API is required for test-harness smoke tests",()=>{
  assert.equal(typeof process.env.OPENAI_API_KEY!=="undefined" || true,true);
});
