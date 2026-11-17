import {before,after,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import supertest from 'supertest';
import type {PaymentGateway,GatewayStatus} from '../server/phonepe.js';
const temp=await mkdtemp(join(tmpdir(),'campusbite-payments-'));
process.env.DATABASE_DIR=join(temp,'pg');process.env.DATABASE_URL='';process.env.NODE_ENV='test';process.env.PAYMENT_MODE='DEMO';process.env.SESSION_SECRET='payment-integration-session-secret';
const {db,initializeDatabase,closeDatabase}=await import('../server/db.js');
const {seed}=await import('../server/seed.js');
const {createApp}=await import('../server/app.js');
const {createPaymentService}=await import('../server/payments.js');
const {reserveCheckout,expireCheckouts,releaseCheckout,collegeDay,transition}=await import('../server/domain.js');
const app=createApp(),students=[supertest.agent(app),supertest.agent(app)],staff=supertest.agent(app),admin=supertest.agent(app);
const service=createPaymentService({mode:'DEMO'});
let userIds:string[]=[],tokens:string[]=[],staffId='',staffToken='',adminToken='',slotId='',orderId='',pickupToken='',closed=false;
const providerReceipts=new Map<string,GatewayStatus>();
const gateway:PaymentGateway={async create(c){const orderId=`PG-${c.id}`;providerReceipts.set(c.id,{state:'PENDING',amount:c.total,orderId});return {orderId,url:`https://mercury.phonepe.com/transact/${c.id}`};},async status(id){return providerReceipts.get(id)!;},webhook(auth,body){if(auth!=='signed-callback')throw Error('invalid');return JSON.parse(body);}};
before(async()=>{await initializeDatabase();await seed();});
afterEach(async()=>{if(closed)return;for(const c of await db.checkout.findMany({where:{state:'PENDING'}}))await db.$transaction(tx=>releaseCheckout(tx,c,'FAILED'));});
after(async()=>{if(!closed)await closeDatabase();await rm(temp,{recursive:true,force:true});});
async function login(agent:ReturnType<typeof supertest.agent>,email:string){const s=await agent.get('/api/session');const r=await agent.post('/api/auth/login').set('x-csrf-token',s.body.csrf).send({email,password:'CampusBite123!'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function slot(id=randomUUID(),capacity=15){await db.canteenSettings.update({where:{id:'main'},data:{openMinute:0,closeMinute:1440,open:true,cutoffMinutes:0}});const startsAt=new Date(Date.now()+40*60000),endsAt=new Date(Date.now()+55*60000);await db.pickupSlot.create({data:{id,startsAt,endsAt,capacity}});return id;}
function input(id='food-1',slot=slotId){return {items:[{id,quantity:1,unitPrice:id==='food-2'?6500:6000}],slotId:slot,note:'Prepaid integration test',idempotencyKey:randomUUID()};}
test('sessions, student role enforcement, CSRF, and admin restrictions',async()=>{
  for(const [i,email] of ['student@campusbite.edu','riya@campusbite.edu'].entries()){const r=await login(students[i],email);userIds[i]=r.user.id;tokens[i]=r.csrf;}
  const st=await login(staff,'staff@campusbite.edu');staffId=st.user.id;staffToken=st.csrf;
  adminToken=(await login(admin,'admin@campusbite.edu')).csrf;
  assert.equal((await students[0].get('/api/admin/payments')).status,403);
  assert.equal((await students[0].post('/api/payments/checkouts').send({})).status,403);
  assert.equal((await students[0].patch('/api/profile').set('x-csrf-token',tokens[0]).set('Origin','https://evil.example').send({})).status,403);
  const agent=supertest.agent(app),s=await agent.get('/api/session');const r=await agent.post('/api/auth/register').set('x-csrf-token',s.body.csrf).send({email:'new@college.edu',name:'New Student',rollNumber:'N1',password:'LongPassword123!',role:'ADMIN'});assert.equal(r.body.user.role,'STUDENT');
  slotId=await slot();
});
test('30-item menu, required canteen items, favorites, and demo disclosure',async()=>{
  const r=await students[0].get('/api/menu');assert.equal(r.status,200);assert.equal(r.body.items.length,30);
  for(const name of ['Chole bhature','White-sauce pasta','Schezwan fried rice','Paneer paratha','Pyaaz paratha','Mango shake'])assert.ok(r.body.items.some((i:any)=>i.name===name));
  assert.ok(!r.body.items.some((i:any)=>/thali/i.test(i.name)));
  const cfg=await students[0].get('/api/payments/config');assert.equal(cfg.body.mode,'DEMO');assert.equal(cfg.body.requiresPrepayment,true);assert.match(cfg.body.message,/No real money/);
  await students[0].post('/api/favorites/food-1').set('x-csrf-token',tokens[0]).expect(200);assert.deepEqual((await students[0].get('/api/favorites')).body,['food-1']);
});
test('legacy unpaid order creation and manual paid marking are blocked',async()=>{
  await students[0].post('/api/orders').set('x-csrf-token',tokens[0]).send(input()).expect(409);
  await staff.post('/api/orders/arbitrary/payment').set('x-csrf-token',staffToken).send({}).expect(410);
  assert.equal(await db.order.count(),0);
});
test('checkout reserves inventory but creates no food order',async()=>{
  const before=await db.order.count();const payload=input();
  const r=await students[0].post('/api/payments/checkouts').set('x-csrf-token',tokens[0]).send({...payload,method:'PhonePe',paid:true,status:'PAID'});
  assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.state,'PENDING');assert.equal(r.body.mode,'DEMO');assert.equal(r.body.total,6000);assert.equal(r.body.orderId,null);assert.equal(await db.order.count(),before);
  const listing=await staff.get('/api/orders');assert.equal(listing.body.total,0);
  const retry=await students[0].post('/api/payments/checkouts').set('x-csrf-token',tokens[0]).send({...payload,method:'PhonePe'});assert.equal(retry.body.id,r.body.id);
  await students[0].post('/api/payments/checkouts').set('x-csrf-token',tokens[0]).send({...payload,note:'Different payload'}).expect(409);
});
test('failed payment releases stock/capacity exactly once and never creates an order',async()=>{
  const day=collegeDay().day;const before=await db.dailyStock.findUniqueOrThrow({where:{day_menuItemId:{day,menuItemId:'food-1'}}});const beforeSlot=await db.pickupSlot.findUniqueOrThrow({where:{id:slotId}});
  const checkout=await service.start(userIds[0],input(),'http://localhost:5173');
  await service.demo(checkout.id,userIds[0],'failure');await service.demo(checkout.id,userIds[0],'failure');
  assert.equal(await db.order.count(),0);assert.equal((await db.dailyStock.findUniqueOrThrow({where:{day_menuItemId:{day,menuItemId:'food-1'}}})).remaining,before.remaining);assert.equal((await db.pickupSlot.findUniqueOrThrow({where:{id:slotId}})).reserved,beforeSlot.reserved);
});
test('expiry releases holds, blocks stale success, and leaves no unpaid kitchen order',async()=>{
  const c=await service.start(userIds[0],input(),'http://localhost:5173');await db.checkout.update({where:{id:c.id},data:{expiresAt:new Date(Date.now()-1000)}});await expireCheckouts();await expireCheckouts();
  assert.equal((await db.checkout.findUniqueOrThrow({where:{id:c.id}})).state,'EXPIRED');await assert.rejects(()=>service.demo(c.id,userIds[0],'success'));assert.equal(await db.order.count(),0);
});
test('another student cannot view, complete or fail a payment session',async()=>{
  const c=await service.start(userIds[0],input(),'http://localhost:5173');
  await students[1].get(`/api/payments/checkouts/${c.id}`).expect(404);
  await students[1].post(`/api/payments/checkouts/${c.id}/demo`).set('x-csrf-token',tokens[1]).send({result:'success'}).expect(404);
  await students[1].post(`/api/payments/checkouts/${c.id}/demo`).set('x-csrf-token',tokens[1]).send({result:'failure'}).expect(404);
});
test('successful demo payment creates exactly one labelled paid order under concurrent retries',async()=>{
  const c=await service.start(userIds[0],input(),'http://localhost:5173');const results=await Promise.all([service.demo(c.id,userIds[0],'success'),service.demo(c.id,userIds[0],'success')]);assert.equal(results[0].orderId,results[1].orderId);
  orderId=results[0].orderId!;const order=await db.order.findUniqueOrThrow({where:{id:orderId},include:{payment:true}});pickupToken=order.pickupToken;assert.equal(order.status,'PLACED');assert.equal(order.payment?.status,'PAID');assert.equal(order.payment?.mode,'DEMO');assert.equal(order.payment?.method,'DEMO_UPI');assert.equal(await db.paymentEvent.count(),1);
  const board=await staff.get('/api/orders');assert.equal(board.body.total,1);assert.equal(board.body.orders[0].pickupToken,undefined);
  await students[1].get('/api/orders/'+orderId).expect(404);
});
test('paid order moves through kitchen and pickup code is single-use',async()=>{
  await staff.patch(`/api/orders/${orderId}/status`).set('x-csrf-token',staffToken).send({status:'READY'}).expect(409);
  for(const status of ['ACCEPTED','PREPARING','READY'])await staff.patch(`/api/orders/${orderId}/status`).set('x-csrf-token',staffToken).send({status}).expect(200);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffToken).send({token:'wrong'}).expect(400);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffToken).send({token:pickupToken}).expect(200);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffToken).send({token:pickupToken}).expect(409);
});
test('last-portion and slot-capacity contention cannot oversell',async()=>{
  const day=collegeDay().day;await db.dailyStock.update({where:{day_menuItemId:{day,menuItemId:'food-2'}},data:{remaining:1}});
  const outcomes=await Promise.allSettled(userIds.map(id=>reserveCheckout(id,input('food-2'),'DEMO')));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  for(const c of await db.checkout.findMany({where:{state:'PENDING'}}))await db.$transaction(tx=>releaseCheckout(tx,c,'FAILED'));
  const limited=await slot(randomUUID(),1);const slots=await Promise.allSettled(userIds.map(id=>reserveCheckout(id,input('food-1',limited),'DEMO')));assert.equal(slots.filter(r=>r.status==='fulfilled').length,1);
});
test('price tampering, duplicate item lines and closed canteen are rejected',async()=>{
  await assert.rejects(()=>service.start(userIds[0],{...input(),items:[{id:'food-1',quantity:1,unitPrice:1}]},'http://localhost:5173'));
  await assert.rejects(()=>reserveCheckout(userIds[0],{...input(),items:[{id:'food-1',quantity:1,unitPrice:6000},{id:'food-1',quantity:1,unitPrice:6000}]},'DEMO'));
  await db.canteenSettings.update({where:{id:'main'},data:{open:false}});await assert.rejects(()=>reserveCheckout(userIds[0],input(),'DEMO'));await db.canteenSettings.update({where:{id:'main'},data:{open:true}});
});
test('live mode without merchant credentials fails closed; demo endpoint is disabled in live mode',async()=>{
  const before=await db.checkout.count();const live=createPaymentService({mode:'LIVE',gateway:null});assert.equal(live.config().enabled,false);await assert.rejects(()=>live.start(userIds[0],input(),'https://canteen.example'));assert.equal(await db.checkout.count(),before);
  const c=await service.start(userIds[0],input(),'http://localhost:5173');await assert.rejects(()=>live.demo(c.id,userIds[0],'success'));
});
test('live redirect or forged client success does not confirm payment; server gateway status must match',async()=>{
  const live=createPaymentService({mode:'LIVE',gateway});const c=await live.start(userIds[0],input(),'https://canteen.example');assert.equal((await live.reconcile(c.id,userIds[0])).state,'PENDING');
  const saved=await db.checkout.findUniqueOrThrow({where:{id:c.id}});providerReceipts.set(c.id,{state:'COMPLETED',amount:1,orderId:saved.gatewayOrderId!,transactionId:'bad-amount'});await assert.rejects(()=>live.reconcile(c.id,userIds[0]));
  providerReceipts.set(c.id,{state:'COMPLETED',amount:c.total,orderId:'wrong-provider-order',transactionId:'wrong-order'});await assert.rejects(()=>live.reconcile(c.id,userIds[0]));
  providerReceipts.set(c.id,{state:'COMPLETED',amount:c.total,orderId:saved.gatewayOrderId!,transactionId:'verified-live-fixture'});const result=await live.reconcile(c.id,userIds[0]);assert.equal(result.state,'COMPLETED');assert.equal((await live.reconcile(c.id,userIds[0])).orderId,result.orderId);
  const paid=await db.payment.findUniqueOrThrow({where:{orderId:result.orderId!}});assert.equal(paid.mode,'LIVE');assert.equal(paid.reference,'verified-live-fixture');
});
test('webhook authentication is mandatory; duplicate genuine callbacks create one order',async()=>{
  const live=createPaymentService({mode:'LIVE',gateway});const c=await live.start(userIds[0],input(),'https://canteen.example');const saved=await db.checkout.findUniqueOrThrow({where:{id:c.id}});const payload=JSON.stringify({merchantOrderId:c.id,orderId:saved.gatewayOrderId});
  await assert.rejects(()=>live.webhook('forged',payload));providerReceipts.set(c.id,{state:'COMPLETED',amount:c.total,orderId:saved.gatewayOrderId!,transactionId:'webhook-fixture'});
  await live.webhook('signed-callback',payload);await live.webhook('signed-callback',payload);assert.equal(await db.order.count({where:{checkout:{is:{id:c.id}}}}),1);
  await supertest(app).post('/api/payments/phonepe/webhook').send({state:'COMPLETED'}).expect(403);
});
test('captured payment after expiry is held for refund review, never an unreserved food order',async()=>{
  const live=createPaymentService({mode:'LIVE',gateway});const c=await live.start(userIds[0],input(),'https://canteen.example');const saved=await db.checkout.findUniqueOrThrow({where:{id:c.id}});await db.checkout.update({where:{id:c.id},data:{expiresAt:new Date(Date.now()-1000)}});await expireCheckouts();
  providerReceipts.set(c.id,{state:'COMPLETED',amount:c.total,orderId:saved.gatewayOrderId!,transactionId:'late-capture-fixture'});const result=await live.reconcile(c.id,userIds[0]);assert.equal(result.state,'REFUND_PENDING');assert.equal(result.orderId,null);assert.equal((await admin.get('/api/admin/payments')).body.refunds.length,1);
});
test('unpaid historical orders cannot enter preparation even through direct staff calls',async()=>{
  const source=await db.order.findUniqueOrThrow({where:{id:orderId}});const legacy=await db.order.create({data:{number:'LEGACY-UNPAID',userId:source.userId,slotId:source.slotId,total:6000,pickupToken:randomUUID(),tokenExpiresAt:source.tokenExpiresAt,idempotencyKey:randomUUID(),requestHash:'fixture',payment:{create:{amount:6000}}}});
  await assert.rejects(()=>transition(legacy.id,{id:staffId,role:'STAFF'},'ACCEPTED'));const board=await staff.get('/api/orders');assert.ok(!board.body.orders.some((o:any)=>o.id===legacy.id));
});
test('demo totals are disclosed separately and live mode cannot fulfill demo orders',async()=>{
  const report=await admin.get('/api/admin/analytics');assert.equal(report.body.demo,true);assert.equal(report.body.revenue,6000);
  const c=await service.start(userIds[0],input(),'http://localhost:5173');const result=await service.demo(c.id,userIds[0],'success');
  process.env.PAYMENT_MODE='LIVE';
  try{await assert.rejects(()=>transition(result.orderId!,{id:staffId,role:'STAFF'},'ACCEPTED'),/cannot be fulfilled in live-payment mode/);}finally{process.env.PAYMENT_MODE='DEMO';}
  await students[0].post('/api/payments/checkouts').set('x-csrf-token',tokens[0]).send({...input(),items:[{id:'food-1',quantity:10,unitPrice:6000},{id:'food-2',quantity:1,unitPrice:6500}]}).expect(400);
});
test('paid records and sessions survive a fresh database process',async()=>{
  const count=await db.order.count();await closeDatabase();closed=true;
  const child=spawnSync(process.execPath,['--import','tsx','tests/reopen-database.ts'],{env:{...process.env,EXPECTED_ORDERS:String(count)},encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stdout+child.stderr);assert.match(child.stdout,/persistence verified/);
});
