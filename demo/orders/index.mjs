import { readFileSync } from "node:fs";
import { AnwaApp, fail, ok } from "../../src/anwa-v02.mjs";
const schema=JSON.parse(readFileSync(new URL("./anwa.json",import.meta.url),"utf8"));

export function createOrders(){
  const orders=new Map([
    ["pending",{id:"pending",status:"pending",shipmentId:"pending-ship"}],
    ["shipped",{id:"shipped",status:"shipped",shipmentId:"shipped-ship"}]
  ]);
  const shipments=new Map([
    ["pending-ship","preparing"],
    ["shipped-ship","delivered"]
  ]);

  return new AnwaApp(schema).bind({
    "order.get":async ({input})=>{
      const item=orders.get(input.orderId);
      return item?ok({id:item.id,status:item.status}):fail("NOT_FOUND","Order not found");
    },
    "order.cancel":async ({input})=>{
      const order=orders.get(input.orderId);
      if(!order)return fail("NOT_FOUND");
      // Illustrative in-memory state transition. Production updates must be atomic.
      if(order.status!=="pending")return fail("ORDER_STATE_CHANGED");
      order.status="cancelled";
      return ok({status:order.status});
    },
    "shipment.track":async ({input})=>{
      const state=shipments.get(input.shipmentId);
      return state!==undefined?ok(state):fail("NOT_FOUND");
    }
  },{
    guards:{
      canCancel:async ({input})=>{
        const order=orders.get(input.orderId);
        if(!order)return{allowed:false,error:{code:"NOT_FOUND",effects:"none"}};
        if(order.status==="shipped")return{allowed:false,error:{
          code:"ORDER_ALREADY_SHIPPED",effects:"none"
        }};
        if(order.status==="cancelled")return{allowed:false,error:{
          code:"ALREADY_CANCELLED",effects:"none"
        }};
        return{allowed:true};
      }
    },
    context:({phase,ref,input,outcome})=>{
      // No order-instance Thing or instance-specific Action binding is required.
      if(phase==="discovery")return{next:[]};
      if(ref==="order.cancel"||ref==="order.get"){
        const order=orders.get(input?.orderId);
        if(!order)return{next:[]};
        const next=[{
          ref:"order.get",input:{orderId:order.id},
          guidance:{level:"available"}
        }];
        if(order.status==="shipped")next.push({
          ref:"shipment.track",input:{shipmentId:order.shipmentId},
          guidance:{level:"recommended"}
        });
        if(ref==="order.get"&&order.status==="pending")next.push({
          ref:"order.cancel",guidance:{level:"available"},
          applicability:{state:"available"}
        });
        return{next};
      }
      return{next:[]};
    }
  });
}
