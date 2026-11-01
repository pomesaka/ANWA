#!/usr/bin/env node
// ANWA 0.2 Interaction-first author tools (experimental).
import {readFileSync,writeFileSync} from "node:fs";
import {validateManifest,generateTypes} from "../src/schema-v02.mjs";
const [command,...args]=process.argv.slice(2);
if(!["validate","generate","inspect"].includes(command)||!args.length){
 console.error("Usage: node tools/anwa.mjs validate|generate|inspect <anwa.json> [output.d.ts]");
 process.exit(2);
}
const load=path=>JSON.parse(readFileSync(path,"utf8"));
try{
 if(command==="validate"){
  let problems=0;
  for(const path of args){
   const diagnostics=validateManifest(load(path));
   if(!diagnostics.length)console.log("VALID "+path);
   else for(const d of diagnostics){
    console.error("INVALID "+path+" "+d.path+": "+d.message);problems++;
   }
  }
  if(problems)process.exitCode=1;
 }else{
  const manifest=load(args[0]),issues=validateManifest(manifest);
  if(issues.length)throw Error(issues.map(x=>x.path+": "+x.message).join("\n"));
  if(command==="generate"){
   const text=generateTypes(manifest);
   if(args[1]){writeFileSync(args[1],text,"utf8");console.log("GENERATED "+args[1]);}
   else process.stdout.write(text);
  }else{
   const out=["# ANWA "+manifest.anwa+" — Interactions",""];
   for(const [ref,op] of Object.entries(manifest.interactions)){
    out.push("## "+ref+" ("+op.kind+")","",op.description,"");
    if(op.subjectType)out.push("- Optional subject metadata: "+op.subjectType);
    for(const [label,schema] of [["Input",op.input],["Output",op.output]]){
     if(!schema)continue;
     out.push("- "+label+": "+schema.type);
     for(const [field,def] of Object.entries(schema.properties??{}))
      out.push("  - "+field+": "+def.type+(schema.required?.includes(field)?" (required)":"")+
       (def.description?" — "+def.description:""));
    }
    if(op.guard)out.push("- Guard: "+op.guard);
    for(const [code,meaning] of Object.entries(op.errors??{}))
     out.push("- Error "+code+": "+meaning);
    out.push("");
   }
   process.stdout.write(out.join("\n")+"\n");
  }
 }
}catch(e){console.error("ANWA tooling error: "+e.message);process.exitCode=1;}
