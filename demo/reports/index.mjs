import {readFileSync} from "node:fs";
import {AnwaApp,accepted,fail,ok} from "../../src/anwa-v02.mjs";
const schema=JSON.parse(readFileSync(new URL("./anwa.json",import.meta.url),"utf8"));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function createReports(){
 const jobs=new Map();let seq=1;
 return new AnwaApp(schema).bind({
  "report.generate":async({input})=>{
   const id=String(seq++),job={status:"accepted",events:[],text:""};jobs.set(id,job);
   void (async()=>{
    await sleep(5);job.status="running";
    job.events.push({type:"state.changed",state:"running",sequence:1});
    for(const data of ["Report: "+input.topic+"\n","Summary: generated in two parts.\n"]){
     await sleep(5);job.text+=data;
     job.events.push({type:"artifact.delta",data,sequence:job.events.length+1});
    }
    job.status="completed";
    job.events.push({type:"settled",sequence:job.events.length+1,
     response:{outcome:{kind:"settled",result:ok(job.text)},context:{next:[
      {ref:"execution.result",input:{executionId:id},guidance:{level:"recommended"}}
     ]}}});
   })();
   return accepted(id);
  },
  "execution.status":async({input})=>{
   const job=jobs.get(input.executionId);return job?ok(job.status):fail("NOT_FOUND");
  },
  "execution.result":async({input})=>{
   const job=jobs.get(input.executionId);
   if(!job)return fail("NOT_FOUND");
   return job.status==="completed"?ok(job.text):fail("NOT_READY","Execution still running",{effects:"none"});
  },
  "execution.updates":({input,cursor=0})=>(async function*(){
   const job=jobs.get(input.executionId);if(!job)throw Error("Unknown execution");
   let i=cursor;
   while(true){
    while(i<job.events.length)yield job.events[i++];
    if(job.status==="completed")return;
    await sleep(2);
   }
  })()
 },{
  context:({phase,ref,input,outcome})=>{
   if(phase==="discovery")return{next:[]};
   if(ref==="report.generate"&&outcome?.kind==="accepted"){
    const executionId=outcome.execution.id;
    return{next:[
     {ref:"execution.status",input:{executionId},guidance:{level:"available"}},
     {ref:"execution.updates",input:{executionId},guidance:{level:"recommended"}}
    ]};
   }
   const executionId=input?.executionId,job=jobs.get(executionId);
   if(!ref.startsWith("execution.")||!job)return{next:[]};
   const next=[
    {ref:"execution.status",input:{executionId},guidance:{level:"available"}},
    {ref:"execution.updates",input:{executionId},guidance:{level:"available"}}
   ];
   if(job.status==="completed")next.push({ref:"execution.result",input:{executionId},guidance:{level:"recommended"}});
   else if(ref==="execution.result"&&outcome?.result?.error?.code==="NOT_READY")
    next.push({ref:"execution.result",input:{executionId},
      guidance:{kind:"retry",level:"recommended"},when:{after:"PT0.05S"}});
   return{next};
  }
 });
}
