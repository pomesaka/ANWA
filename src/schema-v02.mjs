// Experimental ANWA 0.2 interaction-first schema tools.
// Payload schemas intentionally use a restricted JSON Schema subset.
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const validId=/^[A-Za-z_$][\w$]*(?:[.-][A-Za-z_$][\w$]*)*$/;
const types=new Set(["object","array","string","number","integer","boolean","null"]);
const keys=new Set(["type","description","enum","properties","required","items","additionalProperties"]);
const reserved=new Set(["INVALID_INPUT","UNEXPECTED_ERROR"]);
export function validateManifest(m){
 const errors=[],bad=(path,message)=>errors.push({path,message});
 const nonempty=(s,p)=>{if(typeof s!=="string"||!s.trim())bad(p,"Nonempty string required");};
 const checkKeys=(x,allowed,p)=>{for(const k of Object.keys(x))if(!allowed.includes(k))bad(p+"."+k,"Unknown field");};
 function data(s,p){
  if(!object(s)){bad(p,"Expected payload schema");return;}
  for(const k of Object.keys(s))if(!keys.has(k))bad(p+"."+k,"Unsupported keyword");
  if(!types.has(s.type))bad(p+".type","Unknown type");
  if(s.description!==undefined)nonempty(s.description,p+".description");
  if(s.enum!==undefined&&(!Array.isArray(s.enum)||!s.enum.length))bad(p+".enum","Expected nonempty values");
  if(s.type==="object"){
   if(s.properties!==undefined&&!object(s.properties))bad(p+".properties","Expected map");
   for(const [k,v] of Object.entries(object(s.properties)?s.properties:{}))data(v,p+".properties."+k);
   if(s.required!==undefined){
    if(!Array.isArray(s.required)||s.required.some(k=>typeof k!=="string"))bad(p+".required","Expected string array");
    else for(const k of s.required)if(!has(s.properties??{},k))bad(p+".required","Undeclared required property "+k);
   }
   if(s.additionalProperties!==undefined&&s.additionalProperties!==false)bad(p+".additionalProperties","Only false supported");
  }else if(s.properties!==undefined||s.required!==undefined||s.additionalProperties!==undefined)
   bad(p,"Object-only schema keywords");
  if(s.type==="array"){if(!s.items)bad(p+".items","Required");else data(s.items,p+".items");}
  else if(s.items!==undefined)bad(p+".items","Only for arrays");
 }
 if(!object(m))return[{path:"$",message:"Expected manifest object"}];
 checkKeys(m,["anwa","entrypoints","interactions","things"],"$");
 if(m.anwa!=="0.2")bad("$.anwa","Expected 0.2");
 if(!object(m.interactions)||!Object.keys(m.interactions).length)bad("$.interactions","Expected nonempty map");
 if(m.things!==undefined&&!object(m.things))bad("$.things","Expected optional metadata map");
 for(const [name,t] of Object.entries(object(m.things)?m.things:{})){
  const p="$.things."+name;
  if(!validId.test(name))bad(p,"Invalid Thing identifier");
  if(!object(t)){bad(p,"Expected metadata object");continue;}
  checkKeys(t,["title","description","semanticTypes"],p);
  nonempty(t.title,p+".title");nonempty(t.description,p+".description");
 }
 for(const [name,op] of Object.entries(object(m.interactions)?m.interactions:{})){
  const p="$.interactions."+name;
  if(!validId.test(name))bad(p,"Invalid InteractionRef");
  if(!object(op)){bad(p,"Expected definition");continue;}
  checkKeys(op,["kind","description","semanticTypes","subjectType","input","output","errors","guard","hasSideEffects","idempotent"],p);
  if(!["query","action","event"].includes(op.kind))bad(p+".kind","Expected query, action or event");
  nonempty(op.description,p+".description");
  if(op.subjectType!==undefined&&!has(m.things??{},op.subjectType))bad(p+".subjectType","Unknown optional Thing type");
  if(op.semanticTypes!==undefined&&(!Array.isArray(op.semanticTypes)||!op.semanticTypes.length||
    op.semanticTypes.some(x=>typeof x!=="string"||!/^(https?:\/\/|urn:)[^\s]+$/.test(x))))
    bad(p+".semanticTypes","Expected URI/URN array");
  for(const k of ["hasSideEffects","idempotent"])if(op[k]!==undefined&&(op.kind!=="action"||typeof op[k]!=="boolean"))
    bad(p+"."+k,"Action-only optional boolean");
  if(op.guard!==undefined&&(op.kind!=="action"||typeof op.guard!=="string"||!op.guard))
    bad(p+".guard","Action-only named guard");
  for(const k of ["input","output"])if(op[k]!==undefined)data(op[k],p+"."+k);
  if(op.errors!==undefined){
   if(!object(op.errors))bad(p+".errors","Expected error map");
   else for(const [k,v] of Object.entries(op.errors)){
    if(!/^[A-Z][A-Z0-9_]*$/.test(k)||reserved.has(k))bad(p+".errors."+k,"Invalid or reserved code");
    nonempty(v,p+".errors."+k);
   }
  }
 }
 if(!Array.isArray(m.entrypoints)||!m.entrypoints.length)bad("$.entrypoints","Expected nonempty InteractionRef list");
 else m.entrypoints.forEach((ref,i)=>{if(typeof ref!=="string"||!has(m.interactions??{},ref))
   bad("$.entrypoints["+i+"]","Undeclared InteractionRef");});
 return errors;
}
function tsType(s){
 if(!s)return "undefined";
 if(s.enum)return s.enum.map(x=>JSON.stringify(x)).join(" | ");
 switch(s.type){
  case "string":return "string";
  case "number":case "integer":return "number";
  case "boolean":return "boolean";
  case "null":return "null";
  case "array":return "Array<"+tsType(s.items)+">";
  case "object":{
   const req=new Set(s.required??[]),fields=Object.entries(s.properties??{});
   return fields.length?"{ "+fields.map(([k,v])=>JSON.stringify(k)+(req.has(k)?": ":"?: ")+tsType(v)+";").join(" ")+" }":"Record<string, unknown>";
  }
  default:return "unknown";
 }
}
export function generateTypes(m){
 const issues=validateManifest(m);
 if(issues.length)throw Error(issues.map(x=>x.path+": "+x.message).join("\n"));
 const out=[
  "// AUTO-GENERATED ANWA 0.2 contracts",
  'export type InteractionRef = string;',
  'export type ExecutionRef = { id: string };',
  'export type Result<T, E extends string> = {ok:true;value:T}|{ok:false;error:{code:E;message?:string;effects?:"none"|"occurred"|"unknown"}};',
  'export type Accepted = {kind:"accepted";execution:ExecutionRef};',
  'export type Handler<Input,Output,E extends string> = (args:{ref:InteractionRef;input:Input;app:unknown}) => Result<Output,E>|Accepted|Promise<Result<Output,E>|Accepted>;',
  ""
 ];
 for(const [ref,op] of Object.entries(m.interactions)){
  const name=ref.split(/[._:-]/).map(x=>x[0].toUpperCase()+x.slice(1)).join("");
  out.push("export type "+name+"Input = "+tsType(op.input)+";");
  out.push("export type "+name+"Output = "+(op.output?tsType(op.output):"null")+";");
  out.push("export type "+name+"ErrorCode = "+[...Object.keys(op.errors??{}),"INVALID_INPUT","UNEXPECTED_ERROR"].map(x=>JSON.stringify(x)).join(" | ")+";");
  if(op.kind==="event")out.push("export type "+name+"Observation = AsyncIterable<unknown>;");
  else out.push("export type "+name+"Handler = Handler<"+name+"Input,"+name+"Output,"+name+"ErrorCode>;");
  out.push("");
 }
 return out.join("\n")+"\n";
}
