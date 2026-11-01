import { validateManifest } from "./schema-v02.mjs";
/** ANWA 0.2 experimental in-process Interaction-first adapter; not production ready. */
export const ok=(value=null)=>({ok:true,value});
export const fail=(code,message,extra={})=>({
  ok:false,error:{code,...(message?{message}:{}),...extra}
});
export const accepted=id=>({kind:"accepted",execution:{id:String(id)}});
export const emptyContext=()=>({next:[]});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const levels=new Set(["required","recommended","available"]);
const duration=/^P(?=.*\d)(?:\d+D)?(?:T(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/;
const unexpected=()=>fail("UNEXPECTED_ERROR","Unexpected application failure",{effects:"unknown"});

function checkPayload(s,value,path="$"){
  if(!s)return null;
  if(s.enum&&!s.enum.some(x=>Object.is(x,value)))return path+" is not in the enum";
  const type=s.type;
  const valid=type==="object"?value!==null&&typeof value==="object"&&!Array.isArray(value)
    :type==="array"?Array.isArray(value)
    :type==="integer"?Number.isInteger(value)
    :type==="number"?typeof value==="number"&&Number.isFinite(value)
    :type==="null"?value===null:typeof value===type;
  if(!valid)return path+" must be "+type;
  if(type==="object"){
    for(const k of s.required??[])if(!own(value,k))return path+"."+k+" is required";
    for(const [k,v] of Object.entries(value)){
      const schema=s.properties?.[k];
      if(!schema){if(s.additionalProperties===false)return path+"."+k+" is not allowed";}
      else {const error=checkPayload(schema,v,path+"."+k);if(error)return error;}
    }
  }
  if(type==="array")for(let i=0;i<value.length;i++){
    const error=checkPayload(s.items,value[i],path+"["+i+"]");if(error)return error;
  }
  return null;
}
const refValid=ref=>typeof ref==="string"&&ref.length>0;
const contextKeys=new Set(["ref","input","guidance","when","applicability"]);

export class AnwaApp {
  constructor(manifest){
    const issues=validateManifest(manifest);
    if(issues.length)throw Error("ANWA 0.2 schema invalid:\n"+issues.map(d=>d.path+": "+d.message).join("\n"));
    this.schema=manifest;
    this.handlers=new Map();
    this.guards={};
    this.context=()=>emptyContext();
  }
  bind(handlers,{guards={},context=()=>emptyContext()}={}){
    if(!handlers||typeof handlers!=="object"||Array.isArray(handlers))throw Error("Expected handler map");
    for(const [ref,op] of Object.entries(this.schema.interactions)){
      if(typeof handlers[ref]!=="function")throw Error("Unbound interaction: "+ref);
      if(op.guard&&typeof guards[op.guard]!=="function")throw Error("Missing Guard: "+op.guard);
    }
    for(const [ref,handler] of Object.entries(handlers)){
      if(!own(this.schema.interactions,ref)||typeof handler!=="function")
        throw Error("Unknown or invalid interaction binding: "+ref);
    }
    if(typeof context!=="function")throw Error("Context resolver must be a function");
    this.handlers=new Map(Object.entries(handlers));
    this.guards=guards;
    this.context=context;
    return this;
  }
  #resolve(ref){
    if(!refValid(ref)||!own(this.schema.interactions,ref)||!this.handlers.has(ref))
      throw Error("Unknown or unbound InteractionRef");
    return {ref,spec:this.schema.interactions[ref],handler:this.handlers.get(ref)};
  }
  catalog(){
    return {
      anwa:this.schema.anwa,
      entrypoints:[...this.schema.entrypoints],
      interactions:Object.entries(this.schema.interactions).map(([ref,spec])=>({
        ref,kind:spec.kind,description:spec.description
      })),
      ...(this.schema.things?{things:this.schema.things}:{})
    };
  }
  describe(ref){
    const {spec}=this.#resolve(ref);
    return {ref,...spec};
  }
  async discover(ref){
    this.#resolve(ref);
    const raw=await this.context({phase:"discovery",ref,app:this});
    return {description:this.describe(ref),context:this.#context(raw)};
  }
  #declaredError(spec,error){
    if(typeof error?.code!=="string"||error.code==="INVALID_INPUT"||
       error.code==="UNEXPECTED_ERROR"||own(error,"retry")||
       !own(spec.errors??{},error.code))
      throw Error("Undeclared domain error");
  }
  async assess(ref,input){
    const {spec}=this.#resolve(ref);
    if(!spec.guard)return {allowed:true};
    const guard=this.guards[spec.guard];
    const decision=await guard({ref,input,app:this});
    if(typeof decision?.allowed!=="boolean"||
       (!decision.allowed&&!decision.error?.code))
      throw Error("Invalid Guard decision");
    if(!decision.allowed)this.#declaredError(spec,decision.error);
    return decision;
  }
  #context(raw,source){
    const context=raw??emptyContext();
    if(!context||typeof context!=="object"||Array.isArray(context)||
       Object.keys(context).some(k=>k!=="next")||!Array.isArray(context.next))
      throw Error("Context must contain only next array");
    for(const candidate of context.next){
      if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||
         Object.keys(candidate).some(k=>!contextKeys.has(k)))throw Error("Invalid next candidate");
      const {ref,spec}=this.#resolve(candidate.ref);
      if(own(candidate,"input")){
        if(!spec.input||checkPayload(spec.input,candidate.input))throw Error("Invalid next input");
      }
      if(candidate.guidance!==undefined){
        const g=candidate.guidance;
        if(!g||typeof g!=="object"||Array.isArray(g)||
          Object.keys(g).some(k=>!["kind","level"].includes(k))||
          (g.kind!==undefined&&g.kind!=="retry")||
          (g.level!==undefined&&!levels.has(g.level))||
          !Object.keys(g).length)throw Error("Invalid next guidance");
        if(g.kind==="retry"&&ref!==source)throw Error("Retry must reference current Interaction");
      }
      if(candidate.when!==undefined){
        const w=candidate.when;
        if(!w||typeof w!=="object"||Array.isArray(w)||
           Object.keys(w).length!==1||typeof w.after!=="string"||
           !duration.test(w.after))throw Error("Invalid next timing");
      }
      if(candidate.applicability!==undefined){
        const a=candidate.applicability;
        if(!a||typeof a!=="object"||Array.isArray(a)||
          Object.keys(a).some(k=>!["state","reason"].includes(k))||
          !["available","blocked","unknown"].includes(a.state)||
          (a.reason!==undefined&&typeof a.reason!=="string"))
          throw Error("Invalid next applicability");
      }
    }
    return context;
  }
  async interact(ref,input){
    const {spec,handler}=this.#resolve(ref);
    if(spec.kind==="event")throw Error("Use observe for event interactions");
    const bad=spec.input?checkPayload(spec.input,input):
      input!==undefined?"Interaction does not accept input":null;
    let outcome;
    if(bad)outcome={kind:"settled",result:fail("INVALID_INPUT",bad)};
    else try{
      const decision=spec.kind==="action"?await this.assess(ref,input):{allowed:true};
      if(!decision.allowed)outcome={kind:"settled",result:{ok:false,error:decision.error}};
      else {
        const result=await handler({ref,input,app:this});
        if(result?.kind==="accepted"){
          if(typeof result.execution?.id!=="string"||!result.execution.id)throw Error("Invalid ExecutionRef");
          outcome={kind:"accepted",execution:result.execution};
        }else if(typeof result?.ok==="boolean"&&(result.ok?own(result,"value"):!!result.error?.code)){
          if(result.ok&&spec.output){
            const issue=checkPayload(spec.output,result.value);
            if(issue)throw Error("Output contract violation");
          }
          if(!result.ok)this.#declaredError(spec,result.error);
          outcome={kind:"settled",result};
        }else throw Error("Invalid Result");
      }
    }catch{outcome={kind:"settled",result:unexpected()};}
    try{
      const raw=await this.context({phase:"result",ref,input,outcome,app:this});
      return {outcome,context:this.#context(raw,ref)};
    }catch{
      return {outcome:{kind:"settled",result:unexpected()},context:emptyContext()};
    }
  }
  observe(ref,input,options={}){
    const {spec,handler}=this.#resolve(ref);
    if(spec.kind!=="event")throw Error("observe requires event");
    const bad=spec.input?checkPayload(spec.input,input):
      input!==undefined?"Event does not accept input":null;
    if(bad)throw Error("Invalid event input: "+bad);
    const events=handler({ref,input,app:this,...options});
    if(!events?.[Symbol.asyncIterator])throw Error("Event must return AsyncIterable");
    return events;
  }
}
