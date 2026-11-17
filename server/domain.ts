import { db } from './db.js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export class AppError extends Error { constructor(public status:number,message:string) { super(message); } }
export function fail(status:number,message:string):never { throw new AppError(status,message); }
export const includeOrder = {items:true,slot:true,payment:true,history:{orderBy:{createdAt:'asc' as const}}};
export async function settings() { return db.canteenSettings.upsert({where:{id:'main'},update:{},create:{id:'main'}}); }
export function collegeDay(date=new Date(),timezone='Asia/Kolkata') {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(n:string)=>p.find(v=>v.type===n)!.value;
  return {day:`${get('year')}-${get('month')}-${get('day')}`,minute:Number(get('hour'))*60+Number(get('minute'))};
}
export function minuteInstant(day:string,minute:number,timezone:string) {
  // Resolve the configured IANA timezone offset, including DST for the chosen day.
  const nominal = Date.parse(`${day}T00:00:00Z`)+minute*60000;
  let result=nominal;
  for(let i=0;i<3;i++) {
    const local=collegeDay(new Date(result),timezone);
    const rendered=Date.parse(`${local.day}T00:00:00Z`)+local.minute*60000;
    result+=nominal-rendered;
  }
  return new Date(result);
}
export async function dailyData() {
  await expireCheckouts();
  const s=await settings(), {day}=collegeDay(new Date(),s.timezone);
  const foods=await db.menuItem.findMany({where:{archived:false}});
  await db.dailyStock.createMany({data:foods.map(f=>({day,menuItemId:f.id,remaining:40})),skipDuplicates:true});
  const slots=[];
  for(let minute=s.openMinute;minute+s.slotMinutes<=s.closeMinute;minute+=s.slotMinutes) {
    slots.push({id:`${day}-${minute}`,startsAt:minuteInstant(day,minute,s.timezone),endsAt:minuteInstant(day,minute+s.slotMinutes,s.timezone),capacity:s.slotCapacity});
  }
  await db.pickupSlot.createMany({data:slots,skipDuplicates:true});
  return {s,day};
}
export const checkoutSchema=z.object({items:z.array(z.object({id:z.string(),quantity:z.number().int().min(1).max(10),unitPrice:z.number().int().positive()})).min(1).max(30),slotId:z.string(),note:z.string().max(200).default(''),idempotencyKey:z.string().uuid()}).refine(v=>v.items.reduce((n,i)=>n+i.quantity,0)<=10,'A checkout can reserve at most 10 food items.');
export type CheckoutLine={menuItemId:string;name:string;unitPrice:number;quantity:number};
export async function releaseCheckout(tx:any,checkout:any,state='EXPIRED') {
  if(checkout.state!=='PENDING')return;
  for(const item of checkout.items as CheckoutLine[])await tx.dailyStock.update({where:{day_menuItemId:{day:checkout.stockDay,menuItemId:item.menuItemId}},data:{remaining:{increment:item.quantity}}});
  await tx.pickupSlot.update({where:{id:checkout.slotId},data:{reserved:{decrement:1}}});
  await tx.checkout.update({where:{id:checkout.id},data:{state}});
}
export async function expireCheckouts() {
  const expired=await db.checkout.findMany({where:{state:'PENDING',expiresAt:{lte:new Date()}},select:{id:true},take:30});
  for(const {id} of expired)await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${id} FOR UPDATE`;
    const checkout=await tx.checkout.findUnique({where:{id}});
    if(checkout?.state==='PENDING'&&checkout.expiresAt<=new Date())await releaseCheckout(tx,checkout);
  });
}
export async function reserveCheckout(userId:string,input:z.infer<typeof checkoutSchema>,mode:string,method="UPI") {
  const {s,day}=await dailyData();
  const requestHash=createHash('sha256').update(JSON.stringify({...input,mode,method,items:[...input.items].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
  return db.$transaction(async tx=>{
    // One lock per student serializes retries; stock/slot conditional updates handle other students.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const previous=await tx.checkout.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:input.idempotencyKey}}});
    if(previous) { if(previous.requestHash!==requestHash) fail(409,'This checkout key was already used for a different order.'); return previous; }
    if(await tx.checkout.count({where:{userId,state:'PENDING'}})>=2) fail(429,'Finish or cancel your pending payment first.');
    if(!s.open) fail(409,'The canteen is currently closed.');
    if(new Set(input.items.map(i=>i.id)).size!==input.items.length) fail(400,'Duplicate food entries are not allowed.');
    const slot=await tx.pickupSlot.findUnique({where:{id:input.slotId}});
    if(!slot || collegeDay(slot.startsAt,s.timezone).day!==day || slot.startsAt.getTime()<=Date.now()+s.cutoffMinutes*60000) fail(409,'Choose an available future pickup slot.');
    const local=collegeDay(slot.startsAt,s.timezone);
    if(local.minute<s.openMinute || local.minute+s.slotMinutes>s.closeMinute) fail(409,'This pickup slot is outside opening hours.');
    const reserved=await tx.pickupSlot.updateMany({where:{id:slot.id,reserved:{lt:slot.capacity}},data:{reserved:{increment:1}}});
    if(!reserved.count) fail(409,'This pickup slot just filled up. Please choose another.');
    const lines=[]; let total=0; let maxPrep=0;
    for(const item of [...input.items].sort((a,b)=>a.id.localeCompare(b.id))) {
      const food=await tx.menuItem.findUnique({where:{id:item.id}});
      if(!food || !food.available || food.archived) fail(409,'An item is no longer available. Please review your cart.');
      if(food.price!==item.unitPrice) fail(409,`The price of ${food.name} changed. Refresh your cart and review the new total.`);
      maxPrep=Math.max(maxPrep,food.prepMinutes);
      const stock=await tx.dailyStock.updateMany({where:{day,menuItemId:item.id,remaining:{gte:item.quantity}},data:{remaining:{decrement:item.quantity}}});
      if(!stock.count) fail(409,`${food.name} has insufficient stock. Please update your cart.`);
      total+=food.price*item.quantity; lines.push({menuItemId:food.id,name:food.name,unitPrice:food.price,quantity:item.quantity});
    }
    if(slot.startsAt.getTime()<Date.now()+(maxPrep+6)*60000) fail(409,'Choose a later pickup slot to allow time for preparation.');
    const expiresAt=new Date(Math.min(Date.now()+8*60000,slot.startsAt.getTime()-Math.max(maxPrep,s.cutoffMinutes)*60000));
    if(expiresAt.getTime()<Date.now()+5*60000) fail(409,'Choose a later pickup slot to allow time for payment.');
    return tx.checkout.create({data:{userId,slotId:slot.id,stockDay:day,total,note:input.note,items:lines,mode,method,expiresAt,idempotencyKey:input.idempotencyKey,requestHash}});
  },{timeout:20000});
}
export async function transition(orderId:string,actor:{id:string,role:string},status:string,reason='',pickupToken='') {
  const s=await settings();
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order=await tx.order.findUnique({where:{id:orderId},include:includeOrder});
    if(!order || (actor.role==='STUDENT' && order.userId!==actor.id)) fail(404,'Order not found.');
    if(process.env.PAYMENT_MODE==='LIVE'&&order.payment?.mode!=='LIVE')fail(409,'Demo, sandbox and legacy orders cannot be fulfilled in live-payment mode.');
    if(actor.role==='STUDENT' && status!=='CANCELLED') fail(403,'Students can only cancel eligible orders.');
    const next:Record<string,string[]>={PLACED:['ACCEPTED','CANCELLED','REJECTED'],ACCEPTED:['PREPARING','CANCELLED','REJECTED'],PREPARING:['READY','NO_SHOW'],READY:['COLLECTED','NO_SHOW']};
    if(!next[order.status]?.includes(status)) fail(409,`Cannot change ${order.status.toLowerCase()} to ${status.toLowerCase()}.`);
    if(['ACCEPTED','PREPARING','READY','COLLECTED'].includes(status) && order.payment?.status!=='PAID') fail(409,'Payment must be verified before the kitchen can process this order.');
    if(status==='REJECTED' && !reason.trim()) fail(400,'Enter a reason for rejecting this order.');
    if(status==='NO_SHOW' && order.tokenExpiresAt.getTime()>Date.now()) fail(409,'The pickup grace period has not ended.');
    if(status==='COLLECTED') {
      if(order.payment?.status!=='PAID') fail(409,'Record payment before collection.');
      if(order.pickupToken!==pickupToken || order.tokenExpiresAt.getTime()<Date.now()) fail(400,'Invalid or expired pickup code.');
    }
    if(['CANCELLED','REJECTED'].includes(status)) {
      if(order.payment?.status==='PAID') fail(409,'A paid order requires staff refund handling before cancellation.');
      const day=collegeDay(order.createdAt,s.timezone).day;
      for(const item of order.items) await tx.dailyStock.update({where:{day_menuItemId:{day,menuItemId:item.menuItemId}},data:{remaining:{increment:item.quantity}}});
      await tx.pickupSlot.update({where:{id:order.slotId},data:{reserved:{decrement:1}}});
    }
    const result=await tx.order.update({where:{id:orderId},data:{status,history:{create:{status,actorId:actor.id,reason}}},include:includeOrder});
    await tx.notification.create({data:{userId:order.userId,message:`${order.number}: ${status.toLowerCase().replaceAll('_',' ')}${reason?` — ${reason}`:''}.`}});
    await tx.auditLog.create({data:{actorId:actor.id,action:`ORDER_${status}`,targetId:orderId}});
    return result;
  },{timeout:20000});
}


