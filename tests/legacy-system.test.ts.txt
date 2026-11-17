import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { spawnSync } from 'node:child_process';
import { canteenMenu } from '../server/catalog.js';

const temp=await mkdtemp(join(tmpdir(),'campusbite-test-'));
process.env.DATABASE_DIR=join(temp,'database');process.env.DATABASE_URL='';process.env.NODE_ENV='test';
process.env.SESSION_SECRET='integration-test-secret-is-not-production';
const {db,initializeDatabase,closeDatabase}=await import('../server/db');
const {seed}=await import('../server/seed');
const {createApp}=await import('../server/app');
const {placeOrder,transition}=await import('../server/domain');
const app=createApp();
const students=[supertest.agent(app),supertest.agent(app)],staff=supertest.agent(app),admin=supertest.agent(app);
let studentIds:string[]=[],staffId='',csrf:string[]=[],staffCsrf='',adminCsrf='',slotId='',orderId='',pickupToken='',closed=false;
before(async()=>{await initializeDatabase();await seed();});
after(async()=>{if(!closed)await closeDatabase();await rm(temp,{recursive:true,force:true});});
async function login(agent:ReturnType<typeof supertest.agent>,email:string){const s=await agent.get('/api/session');const r=await agent.post('/api/auth/login').set('x-csrf-token',s.body.csrf).send({email,password:'CampusBite123!'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
test('sessions, login and role protection',async()=>{
  for(const [i,email] of ['student@campusbite.edu','riya@campusbite.edu'].entries()){const r=await login(students[i],email);csrf[i]=r.csrf;studentIds[i]=r.user.id;}
  const st=await login(staff,'staff@campusbite.edu');staffCsrf=st.csrf;staffId=st.user.id;
  const ad=await login(admin,'admin@campusbite.edu');adminCsrf=ad.csrf;
  assert.equal((await students[0].get('/api/admin/users')).status,403);
  assert.equal((await students[0].post('/api/orders/x/payment').set('x-csrf-token',csrf[0])).status,403);
  assert.equal((await staff.get('/api/admin/users')).status,403);
  assert.equal((await supertest(app).get('/api/orders')).status,401);
});
test('CSRF and foreign origins are rejected',async()=>{
  assert.equal((await students[0].patch('/api/profile').send({name:'Hacked',rollNumber:'x'})).status,403);
  assert.equal((await students[0].patch('/api/profile').set('x-csrf-token',csrf[0]).set('Origin','https://foreign.example').send({name:'Hacked',rollNumber:'x'})).status,403);
});
test('persistent menu, favorites and validated student registration',async()=>{
  const menu=await students[0].get('/api/menu');assert.equal(menu.status,200);assert.equal(menu.body.items.length,canteenMenu.length);
  for(const name of ['White-sauce pasta','Chocolate shake','Strawberry shake','Mango shake','Chole bhature','Schezwan fried rice','Aloo paratha','Paneer paratha','Pyaaz paratha'])assert.ok(menu.body.items.some((i:any)=>i.name===name),`${name} should be on the menu`);
  assert.ok(!menu.body.items.some((i:any)=>/thali|rajma chawal|chole rice bowl/i.test(i.name)));
  await students[0].post('/api/favorites/food-1').set('x-csrf-token',csrf[0]).expect(200);
  assert.deepEqual((await students[0].get('/api/favorites')).body,['food-1']);
  const agent=supertest.agent(app),s=await agent.get('/api/session');
  const r=await agent.post('/api/auth/register').set('x-csrf-token',s.body.csrf).send({name:'Test Student',email:'new@college.edu',rollNumber:'T001',password:'LongPassword123!',role:'ADMIN'});
  assert.equal(r.status,201);assert.equal(r.body.user.role,'STUDENT');
});
async function prepareSlot(id='test-slot',capacity=15){
  const s=await db.canteenSettings.findUniqueOrThrow({where:{id:'main'}});
  // Tests use a broad opening window; scheduled slots remain same-day in college time.
  await db.canteenSettings.update({where:{id:'main'},data:{openMinute:0,closeMinute:1440,cutoffMinutes:0}});
  const start=new Date(Date.now()+20*60000),end=new Date(Date.now()+35*60000);
  await db.pickupSlot.upsert({where:{id},update:{capacity,reserved:0,startsAt:start,endsAt:end},create:{id,capacity,startsAt:start,endsAt:end}});
  return id;
}
const input=(id:string,slot=slotId,quantity=1)=>({items:[{id,quantity,unitPrice:id==='food-1'?6000:6500}],slotId:slot,note:'Less spicy, please.',idempotencyKey:randomUUID()});
test('student checkout creates a persisted priced order and idempotent retry',async()=>{
  slotId=await prepareSlot();const data=input('food-1');
  const r=await students[0].post('/api/orders').set('x-csrf-token',csrf[0]).send(data);
  assert.equal(r.status,201,JSON.stringify(r.body));orderId=r.body.id;pickupToken=r.body.pickupToken;assert.equal(r.body.total,6000);assert.equal(r.body.payment.status,'PENDING');
  const retry=await students[0].post('/api/orders').set('x-csrf-token',csrf[0]).send(data);assert.equal(retry.body.id,orderId);
  assert.equal(await db.order.count({where:{idempotencyKey:data.idempotencyKey}}),1);
  const conflict=await students[0].post('/api/orders').set('x-csrf-token',csrf[0]).send({...data,note:'Changed'});assert.equal(conflict.status,409);
});
test('other students cannot read or cancel this order and staff lists omit pickup secrets',async()=>{
  assert.equal((await students[1].get(`/api/orders/${orderId}`)).status,404);
  assert.equal((await students[1].patch(`/api/orders/${orderId}/status`).set('x-csrf-token',csrf[1]).send({status:'CANCELLED'})).status,404);
  const listing=await staff.get('/api/orders');assert.ok(listing.body.orders.length);assert.equal(listing.body.orders[0].pickupToken,undefined);
});
test('complete kitchen/payment/pickup journey, guarded transitions and single-use code',async()=>{
  assert.equal((await staff.patch(`/api/orders/${orderId}/status`).set('x-csrf-token',staffCsrf).send({status:'READY'})).status,409);
  for(const status of ['ACCEPTED','PREPARING','READY'])await staff.patch(`/api/orders/${orderId}/status`).set('x-csrf-token',staffCsrf).send({status}).expect(200);
  const studentView=await students[0].get(`/api/orders/${orderId}`);assert.equal(studentView.body.status,'READY');
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffCsrf).send({token:pickupToken}).expect(409);
  await staff.post(`/api/orders/${orderId}/payment`).set('x-csrf-token',staffCsrf).send({}).expect(200);
  await staff.post(`/api/orders/${orderId}/payment`).set('x-csrf-token',staffCsrf).send({}).expect(200);
  assert.equal(await db.paymentEvent.count(),1);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffCsrf).send({token:'wrong'}).expect(400);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffCsrf).send({token:pickupToken}).expect(200);
  await staff.post(`/api/orders/${orderId}/collect`).set('x-csrf-token',staffCsrf).send({token:pickupToken}).expect(409);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).status,'COLLECTED');
});
test('last-item concurrency cannot oversell',async()=>{
  const {collegeDay}=await import('../server/domain');const day=collegeDay().day;
  await db.dailyStock.update({where:{day_menuItemId:{day,menuItemId:'food-2'}},data:{remaining:1}});
  const results=await Promise.allSettled(studentIds.map(id=>placeOrder(id,input('food-2'))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.dailyStock.findUniqueOrThrow({where:{day_menuItemId:{day,menuItemId:'food-2'}}})).remaining,0);
});
test('single-slot concurrency cannot exceed capacity',async()=>{
  const slot=await prepareSlot('one-capacity-slot',1);
  const results=await Promise.allSettled(studentIds.map(id=>placeOrder(id,input('food-1',slot))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.pickupSlot.findUniqueOrThrow({where:{id:slot}})).reserved,1);
});
test('cancellation restores stock and capacity exactly once',async()=>{
  const {collegeDay}=await import('../server/domain');const day=collegeDay().day;
  const before=await db.dailyStock.findUniqueOrThrow({where:{day_menuItemId:{day,menuItemId:'food-1'}}});
  const oldSlot=await db.pickupSlot.findUniqueOrThrow({where:{id:slotId}});
  const order=await placeOrder(studentIds[0],input('food-1'));
  await transition(order.id,{id:studentIds[0],role:'STUDENT'},'CANCELLED');
  await assert.rejects(()=>transition(order.id,{id:studentIds[0],role:'STUDENT'},'CANCELLED'));
  assert.equal((await db.dailyStock.findUniqueOrThrow({where:{day_menuItemId:{day,menuItemId:'food-1'}}})).remaining,before.remaining);
  assert.equal((await db.pickupSlot.findUniqueOrThrow({where:{id:slotId}})).reserved,oldSlot.reserved);
});
test('price changes, past slots, duplicate food entries and closed canteen rejected',async()=>{
  await assert.rejects(()=>placeOrder(studentIds[0],{...input('food-1'),items:[{id:'food-1',quantity:1,unitPrice:1}]}));
  await assert.rejects(()=>placeOrder(studentIds[0],{...input('food-1'),slotId:'invalid'}));
  await assert.rejects(()=>placeOrder(studentIds[0],{...input('food-1'),items:[{id:'food-1',quantity:1,unitPrice:6000},{id:'food-1',quantity:1,unitPrice:6000}]}));
  await db.canteenSettings.update({where:{id:'main'},data:{open:false}});await assert.rejects(()=>placeOrder(studentIds[0],input('food-1')));await db.canteenSettings.update({where:{id:'main'},data:{open:true}});
});
test('sales analytics derive from collected orders, not seeded fake figures',async()=>{
  const r=await admin.get('/api/admin/analytics');assert.equal(r.status,200);assert.equal(r.body.revenue,6000);assert.equal(r.body.topDishes[0].quantity,1);
  assert.equal((await admin.get('/api/admin/analytics?format=csv')).headers['content-type'].includes('text/csv'),true);
});
test('sessions persist in database and unsupported payment callbacks cannot mark paid',async()=>{
  assert.ok(await db.session.count()>0);
  assert.equal((await students[0].post('/api/payments/callback').set('x-csrf-token',csrf[0]).send({status:'PAID'})).status,404);
  const restored=supertest.agent(createApp());const s=await restored.get('/api/health');assert.equal(s.body.ok,true);
  assert.equal(await db.order.count({where:{id:orderId}}),1);
});
test('expired pickup and early no-show are rejected',async()=>{
  const order=await placeOrder(studentIds[0],input('food-1'));
  await transition(order.id,{id:staffId,role:'STAFF'},'ACCEPTED');
  await transition(order.id,{id:staffId,role:'STAFF'},'PREPARING');
  await assert.rejects(()=>transition(order.id,{id:staffId,role:'STAFF'},'NO_SHOW'));
  await transition(order.id,{id:staffId,role:'STAFF'},'READY');
  await db.payment.update({where:{orderId:order.id},data:{status:'PAID',paidAt:new Date()}});
  await db.order.update({where:{id:order.id},data:{tokenExpiresAt:new Date(Date.now()-60000)}});
  await assert.rejects(()=>transition(order.id,{id:staffId,role:'STAFF'},'COLLECTED','',order.pickupToken));
  await transition(order.id,{id:staffId,role:'STAFF'},'NO_SHOW');
});
test('orders and sessions survive database close and a fresh Node process',async()=>{
  const count=await db.order.count();await closeDatabase();closed=true;
  const child=spawnSync(process.execPath,['--import','tsx','tests/reopen-database.ts'],{env:{...process.env,EXPECTED_ORDERS:String(count)},encoding:'utf8',timeout:30000});
  assert.equal(child.status,0,child.stdout+child.stderr);
  assert.match(child.stdout,/persistence verified/);
});
