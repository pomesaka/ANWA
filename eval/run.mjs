#!/usr/bin/env node
/**
 * Weak-model benchmark using the OpenAI Responses API.
 * Requires an independently configured OPENAI_API_KEY, never committed.
 *
 * This script makes paid API calls when run without --dry-run.
 * Default model is GPT-4.1 nano (small, non-reasoning).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { runCase, aggregate, benchmarkCases } from "./runner.mjs";

const options={ model:process.env.ANWA_EVAL_MODEL || "gpt-4.1-nano",
  effort:process.env.ANWA_EVAL_REASONING_EFFORT || "",
  modes:(process.env.ANWA_EVAL_MODES || "raw,summary,progressive").split(","),
  repeat:parseInt(process.env.ANWA_EVAL_REPEAT || "1",10),
  maxSteps:parseInt(process.env.ANWA_EVAL_MAX_STEPS || "9",10),
  dryRun:process.argv.includes("--dry-run")
};
const usage=()=>{
  console.log([
    "ANWA weak-model evaluation",
    "  OPENAI_API_KEY=... npm run eval:weak",
    "Optional: ANWA_EVAL_MODEL=gpt-4.1-nano",
    "          ANWA_EVAL_REASONING_EFFORT=minimal (reasoning models only)",
    "          ANWA_EVAL_MODES=raw,summary,progressive",
    "          ANWA_EVAL_REPEAT=3 ANWA_EVAL_MAX_STEPS=9",
    "          npm run eval:weak -- --dry-run (no API calls)"
  ].join("\n"));
};
if(process.argv.includes("--help")){usage(); process.exit(0);}
if(!Number.isInteger(options.repeat)||options.repeat<1||options.repeat>20 ||
   !Number.isInteger(options.maxSteps)||options.maxSteps<1||options.maxSteps>20 ||
   options.modes.some(x=>!["raw","summary","progressive"].includes(x))) {
  throw new Error("Invalid evaluation options");
}
if(options.dryRun) {
  console.log(JSON.stringify({status:"DRY_RUN_ONLY", model:options.model,
    modes:options.modes,cases:benchmarkCases.map(c=>c.id),
    repeat:options.repeat,maxSteps:options.maxSteps,
    maxModelRequests:benchmarkCases.length*options.modes.length*options.repeat*options.maxSteps},null,2));
  process.exit(0);
}
if(!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. No model evaluation was run.");
  usage(); process.exit(2);
}

async function requestModel({prompt,policy}){
  const body={
    model:options.model,
    instructions:policy,
    input:prompt,
    max_output_tokens:450,
    text:{format:{type:"json_object"}},
    store:false
  };
  if(options.effort) body.reasoning={effort:options.effort};
  const http=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+process.env.OPENAI_API_KEY
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(60000)
  });
  if(!http.ok){
    // Do not print authentication headers or any API keys.
    const errorBody=await http.text();
    throw new Error("OpenAI Responses API HTTP "+http.status+
      ": "+errorBody.slice(0,200));
  }
  const payload=await http.json();
  const text = payload.output_text ||
    (payload.output ?? []).filter(x=>x.type==="message")
      .flatMap(x=>x.content ?? []).filter(x=>x.type==="output_text")
      .map(x=>x.text).join("");
  if(!text) throw new Error("Model provided no output_text");
  let action;
  try {action=JSON.parse(text);}
  catch { throw new Error("Model output was not valid JSON"); }
  return {action,usage:payload.usage ?? {}};
}

const results=[];
for(let trial=1;trial<=options.repeat;trial++){
  for(const task of benchmarkCases){
    for(const mode of options.modes){
      const result=await runCase({task,mode,decide:requestModel,maxSteps:options.maxSteps,trial});
      results.push(result);
      console.log((result.passed?"PASS":"FAIL")+" "+task.id+" ["+mode+"]"+
        " tools="+result.metrics.toolCalls+" invalid="+result.metrics.invalidCalls+
        " tokens="+(result.metrics.inputTokens+result.metrics.outputTokens)+
        (result.modelError?" error="+result.modelError:""));
    }
  }
}
const summary=aggregate(results);
await mkdir("eval/results",{recursive:true});
const path="eval/results/weak-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
await writeFile(path,JSON.stringify({
  status:"MODEL_EVALUATION_COMPLETED",
  model:options.model,
  reasoningEffort:options.effort || "not specified (non-reasoning model by default)",
  timestamp:new Date().toISOString(),
  trials:options.repeat,
  conditions:options.modes,
  maxSteps:options.maxSteps,
  summary,results
},null,2)+"\n");
console.log("\n"+JSON.stringify(summary,null,2));
console.log("Report saved: "+path);
