import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { AppError, fail, dailyData, settings, collegeDay, minuteInstant, checkoutSchema, transition, includeOrder } from './domain.js';
import {createPaymentService} from './payments.js';

declare module 'express-session' { interface SessionData { userId:string; csrf:string; } }
const publicUser={id:true,name:true,email:true,rollNumber:true,role:true};
class DatabaseSessionStore extends session.Store {
  get(id:string,cb:(e:unknown,s?:session.SessionData|null)=>void) {
    db.session.findUnique({where:{id}}).then(row=>cb(null,row && row.expiresAt>new Date()?row.data as unknown as session.SessionData:null)).catch(cb);
  }
  set(id:string,data:session.SessionData,cb?:(e?:unknown)=>void) {
    const expiresAt=new Date(data.cookie.expires || Date.now()+86400000);
    db.session.upsert({where:{id},update:{data:JSON.parse(JSON.stringify(data)),expiresAt},create:{id,data:JSON.parse(JSON.stringify(data)),expiresAt}}).then(()=>cb?.()).catch(e=>cb?.(e));
  }
  destroy(id:string,cb?:(e?:unknown)=>void) { db.session.deleteMany({where:{id}}).then(()=>cb?.()).catch(e=>cb?.(e)); }
  touch(id:string,data:session.SessionData,cb?:(e?:unknown)=>void) { this.set(id,data,cb); }
}
const safeOrder=(order:any,staff=false)=>({...order,pickupToken:staff||order.payment?.status!=='PAID'?undefined:order.pickupToken});
export function createApp(paymentOptions:Parameters<typeof createPaymentService>[0]={}) {
  const payments=createPaymentService(paymentOptions);
  const app=express(); app.disable('x-powered-by');
  if(process.env.NODE_ENV==='production') app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:process.env.NODE_ENV==='production'?{directives:{defaultSrc:["'self'"],imgSrc:["'self'",'https://images.unsplash.com','data:'],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"],connectSrc:["'self'"],fontSrc:["'self'"],upgradeInsecureRequests:null}}:false}));
  app.post('/api/payments/phonepe/webhook',rateLimit({windowMs:60000,limit:120}),express.raw({type:'application/json',limit:'100kb'}),async(req,res)=>{if(!Buffer.isBuffer(req.body))fail(400,'JSON callback body required.');res.json(await payments.webhook(req.get('authorization')||'',req.body.toString('utf8')));});
  app.use(express.json({limit:'100kb'}));
  const secret=process.env.SESSION_SECRET;
  if(process.env.NODE_ENV==='production' && (!secret || secret.length<32)) throw new Error('Set a SESSION_SECRET of at least 32 characters.');
  app.use(session({name:'campusbite.sid',secret:secret || randomBytes(32).toString('hex'),store:new DatabaseSessionStore(),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:86400000}}));
  app.use('/api',rateLimit({windowMs:60000,limit:500,standardHeaders:true,legacyHeaders:false}));
  app.use('/api',(req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const origin=req.get('origin');
    const allowed=process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 5173}`;
    const origins=[allowed,process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`,process.env.VERCEL_PROJECT_PRODUCTION_URL&&`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean);
    if(origin && !origins.includes(origin)) return res.status(403).json({error:'Request origin is not allowed.'});
    if(!req.session.csrf || req.get('x-csrf-token')!==req.session.csrf) return res.status(403).json({error:'Your session expired. Refresh and try again.'});
    next();
  });
  const auth:express.RequestHandler=async(req,res,next)=>{
    const user=req.session.userId?await db.user.findUnique({where:{id:req.session.userId},select:publicUser}):null;
    if(!user) return res.status(401).json({error:'Please sign in to continue.'}); res.locals.user=user;next();
  };
  const staff:express.RequestHandler=(req,res,next)=>['STAFF','ADMIN'].includes(res.locals.user.role)?next():res.status(403).json({error:'Staff access required.'});
  const admin:express.RequestHandler=(req,res,next)=>res.locals.user.role==='ADMIN'?next():res.status(403).json({error:'Admin access required.'});
  app.get('/api/health',async(req,res)=>{await db.$queryRaw`SELECT 1`;res.json({ok:true,database:process.env.DATABASE_URL?'PostgreSQL':'embedded PostgreSQL',payments:payments.config().mode,prepaymentRequired:true});});
  app.get('/api/session',async(req,res)=>{
    req.session.csrf ||= randomBytes(24).toString('hex');
    const user=req.session.userId?await db.user.findUnique({where:{id:req.session.userId},select:publicUser}):null;
    res.json({user,csrf:req.session.csrf});
  });
  const authLimit=rateLimit({windowMs:15*60000,limit:30,message:{error:'Too many login attempts. Try again later.'}});
  const loginSchema=z.object({email:z.email().transform(v=>v.toLowerCase().trim()),password:z.string().min(1).max(128)});
  async function signedIn(req:express.Request,userId:string) {
    await new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.userId=userId;req.session.csrf=randomBytes(24).toString('hex');
    await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
    return {user:await db.user.findUnique({where:{id:userId},select:publicUser}),csrf:req.session.csrf};
  }
  app.post('/api/auth/login',authLimit,async(req,res)=>{
    const data=loginSchema.parse(req.body),user=await db.user.findUnique({where:{email:data.email}});
    if(!user || !await compare(data.password,user.password)) fail(401,'Email or password is incorrect.');
    res.json(await signedIn(req,user.id));
  });
  app.post('/api/auth/register',authLimit,async(req,res)=>{
    const data=loginSchema.extend({password:z.string().min(10).max(128),name:z.string().trim().min(2).max(80),rollNumber:z.string().trim().min(2).max(40)}).parse(req.body);
    if(await db.user.findUnique({where:{email:data.email}})) fail(409,'An account already exists for this email.');
    const user=await db.user.create({data:{...data,password:await hash(data.password,12),role:'STUDENT'}});
    res.status(201).json(await signedIn(req,user.id));
  });
  app.post('/api/auth/logout',auth,async(req,res)=>{await new Promise<void>((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));res.clearCookie('campusbite.sid');res.json({ok:true});});
  app.patch('/api/profile',auth,async(req,res)=>{const data=z.object({name:z.string().trim().min(2).max(80),rollNumber:z.string().trim().min(2).max(40)}).parse(req.body);res.json(await db.user.update({where:{id:res.locals.user.id},data,select:publicUser}));});
  app.get('/api/menu',async(req,res)=>{
    const {s,day}=await dailyData();
    const items=await db.menuItem.findMany({where:{archived:false},include:{category:true,stock:{where:{day}}},orderBy:{id:'asc'}});
    const {minute}=collegeDay(new Date(),s.timezone);
    res.json({items:items.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).map(({stock,...f})=>({...f,remaining:stock[0]?.remaining||0})),categories:await db.category.findMany({where:{items:{some:{archived:false}}}}),settings:{...s,open:s.open&&minute>=s.openMinute&&minute<s.closeMinute},demo:true});
  });
  app.get('/api/slots',async(req,res)=>{const {s,day}=await dailyData();const slots=await db.pickupSlot.findMany({where:{id:{startsWith:day},startsAt:{gt:new Date(Date.now()+s.cutoffMinutes*60000)}},orderBy:{startsAt:'asc'}});res.json(s.open?slots:[]);});
  app.get('/api/favorites',auth,async(req,res)=>res.json((await db.favorite.findMany({where:{userId:res.locals.user.id}})).map(f=>f.menuItemId)));
  app.post('/api/favorites/:id',auth,async(req,res)=>{
    const key={userId:res.locals.user.id,menuItemId:String(req.params.id)};
    if(!await db.menuItem.findUnique({where:{id:key.menuItemId}})) fail(404,'Food not found.');
    const existing=await db.favorite.findUnique({where:{userId_menuItemId:key}});
    if(existing) await db.favorite.delete({where:{userId_menuItemId:key}});else await db.favorite.create({data:key});res.json({favorite:!existing});
  });
  app.get('/api/orders',auth,async(req,res)=>{
    const page=z.coerce.number().int().min(1).max(10000).parse(req.query.page||1),isStaff=res.locals.user.role!=='STUDENT';
    const where=isStaff?{payment:{is:{status:'PAID',mode:payments.config().mode}}}:{userId:res.locals.user.id};
    const [orders,total]=await Promise.all([db.order.findMany({where,include:{...includeOrder,user:{select:{name:true,rollNumber:true}}},orderBy:{createdAt:'desc'},skip:(page-1)*30,take:30}),db.order.count({where})]);
    res.json({orders:orders.map(o=>safeOrder(o,isStaff)),total,page});
  });
  app.get('/api/orders/:id',auth,async(req,res)=>{const order=await db.order.findUnique({where:{id:String(req.params.id)},include:includeOrder});if(!order || (res.locals.user.role==='STUDENT' && order.userId!==res.locals.user.id)) fail(404,'Order not found.');res.json(safeOrder(order,res.locals.user.role!=='STUDENT'));});
  app.post('/api/orders',auth,async(req,res)=>{fail(409,'Payment is required first. Use the secure payment checkout; unpaid food orders cannot be placed.');});
  app.get('/api/payments/config',(req,res)=>res.json(payments.config()));
  app.post('/api/payments/checkouts',auth,rateLimit({windowMs:60000,limit:12}),async(req,res)=>{
    if(res.locals.user.role!=='STUDENT')fail(403,'Use a student account to order food.');
    const method=z.enum(['PhonePe','Google Pay','Other UPI']).parse(req.body.method||'PhonePe');
    const origin=process.env.APP_ORIGIN||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:`http://localhost:${process.env.PORT||5173}`);
    res.status(201).json(await payments.start(res.locals.user.id,checkoutSchema.parse(req.body),origin,method));
  });
  app.get('/api/payments/checkouts/:id',auth,async(req,res)=>res.json(await payments.view(String(req.params.id),res.locals.user.id)));
  app.post('/api/payments/checkouts/:id/verify',auth,rateLimit({windowMs:60000,limit:30}),async(req,res)=>res.json(await payments.reconcile(String(req.params.id),res.locals.user.id)));
  app.post('/api/payments/checkouts/:id/demo',auth,async(req,res)=>{const {result}=z.object({result:z.enum(['success','failure'])}).parse(req.body);res.json(await payments.demo(String(req.params.id),res.locals.user.id,result));});
  app.patch('/api/orders/:id/status',auth,async(req,res)=>{const {status,reason}=z.object({status:z.enum(['ACCEPTED','PREPARING','READY','CANCELLED','REJECTED','NO_SHOW']),reason:z.string().max(200).default('')}).parse(req.body);res.json(safeOrder(await transition(String(req.params.id),res.locals.user,status,reason),res.locals.user.role!=='STUDENT'));});
  app.post('/api/orders/:id/payment',auth,staff,async(req,res)=>{
    fail(410,'Counter payment marking is disabled. Payments must be confirmed by the payment gateway.');
  });
  app.post('/api/orders/:id/collect',auth,staff,rateLimit({windowMs:60000,limit:15,message:{error:'Too many pickup attempts. Wait a minute.'}}),async(req,res)=>{
    const {token}=z.object({token:z.string().min(1).max(128)}).parse(req.body);
    res.json(safeOrder(await transition(String(req.params.id),res.locals.user,'COLLECTED','',token),true));
  });
  app.get('/api/notifications',auth,async(req,res)=>res.json(await db.notification.findMany({where:{userId:res.locals.user.id},orderBy:{createdAt:'desc'},take:50})));
  app.patch('/api/notifications/read',auth,async(req,res)=>{await db.notification.updateMany({where:{userId:res.locals.user.id},data:{read:true}});res.json({ok:true});});
  const foodSchema=z.object({name:z.string().min(2).max(80),description:z.string().max(250),ingredients:z.string().max(250),allergens:z.string().max(200),price:z.number().int().min(100).max(100000),image:z.url().refine(v=>new URL(v).hostname==='images.unsplash.com','Use an images.unsplash.com URL.'),vegetarian:z.boolean(),prepMinutes:z.number().int().min(1).max(60),categoryId:z.string(),available:z.boolean().default(true)});
  app.post('/api/admin/menu',auth,admin,async(req,res)=>{const data=foodSchema.parse(req.body);res.status(201).json(await db.menuItem.create({data}));});
  app.patch('/api/admin/menu/:id',auth,staff,async(req,res)=>{
    const data=foodSchema.partial().extend({archived:z.boolean().optional(),remaining:z.number().int().min(0).max(10000).optional()}).parse(req.body);
    if(res.locals.user.role==='STAFF' && Object.keys(data).some(k=>!['available','remaining'].includes(k))) fail(403,'Only admins can edit menu details.');
    const {remaining,...food}=data,id=String(req.params.id),{day}=await dailyData();
    await db.$transaction(async tx=>{await tx.menuItem.update({where:{id},data:food});if(remaining!==undefined) await tx.dailyStock.update({where:{day_menuItemId:{day,menuItemId:id}},data:{remaining}});await tx.auditLog.create({data:{actorId:res.locals.user.id,action:'MENU_UPDATED',targetId:id}});});res.json({ok:true});
  });
  app.get('/api/admin/settings',auth,staff,async(req,res)=>res.json(await settings()));
  app.get('/api/admin/payments',auth,admin,async(req,res)=>res.json({config:payments.config(),refunds:await db.checkout.findMany({where:{state:'REFUND_PENDING'},select:{id:true,total:true,mode:true,gatewayOrderId:true,gatewayTransactionId:true,createdAt:true},take:50,orderBy:{createdAt:'desc'}})}));
  app.patch('/api/admin/settings',auth,admin,async(req,res)=>{
    const data=z.object({name:z.string().min(2).max(80),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),openMinute:z.number().int().min(0).max(1439),closeMinute:z.number().int().min(1).max(1440),slotMinutes:z.number().int().min(5).max(60),slotCapacity:z.number().int().min(1).max(200),cutoffMinutes:z.number().int().min(0).max(120),noShowMinutes:z.number().int().min(15).max(240),open:z.boolean(),announcement:z.string().max(200)}).refine(v=>v.closeMinute>v.openMinute,'Closing time must be after opening time.').parse(req.body);
    const old=await settings();
    const active=await db.order.count({where:{status:{in:['PLACED','ACCEPTED','PREPARING','READY']}}})+await db.checkout.count({where:{state:'PENDING'}});
    if(active && ['timezone','openMinute','closeMinute','slotMinutes','slotCapacity'].some(k=>(data as any)[k]!==(old as any)[k])) fail(409,'Finish active orders before changing the pickup schedule.');
    await db.$transaction(async tx=>{await tx.canteenSettings.update({where:{id:'main'},data});await tx.pickupSlot.deleteMany({where:{reserved:0,orders:{none:{}}}});await tx.auditLog.create({data:{actorId:res.locals.user.id,action:'SETTINGS_UPDATED',targetId:'main'}});});res.json({ok:true});
  });
  app.get('/api/admin/users',auth,admin,async(req,res)=>res.json(await db.user.findMany({select:publicUser,take:100,orderBy:{createdAt:'desc'}})));
  app.post('/api/admin/staff',auth,admin,async(req,res)=>{const data=loginSchema.extend({name:z.string().min(2).max(80),password:z.string().min(10).max(128)}).parse(req.body);res.status(201).json(await db.user.create({data:{...data,password:await hash(data.password,12),rollNumber:'STAFF',role:'STAFF'},select:publicUser}));});
  app.get('/api/admin/audit',auth,admin,async(req,res)=>res.json(await db.auditLog.findMany({take:100,orderBy:{createdAt:'desc'}})));
  app.get('/api/admin/analytics',auth,admin,async(req,res)=>{
    const s=await settings(),today=collegeDay(new Date(),s.timezone).day;
    const from=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from||today),to=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to||today);
    // Filter by college-local business day rather than server timezone.
    if(to<from || Date.parse(to)-Date.parse(from)>366*86400000) fail(400,'Choose a valid date range of at most 366 days.');
    const nextDay=new Date(Date.parse(`${to}T00:00:00Z`)+86400000).toISOString().slice(0,10);
    const reportingMode=payments.config().mode;
    const orders=await db.order.findMany({where:{payment:{is:{mode:reportingMode==='DEMO'?'DEMO':'LIVE'}},createdAt:{gte:minuteInstant(from,0,s.timezone),lt:minuteInstant(nextDay,0,s.timezone)}},include:{items:true,payment:true,slot:true}});
    const dishes:Record<string,number>={},sales:Record<string,number>={},slots:Record<string,number>={};let revenue=0,unpaid=0;
    for(const o of orders) { if(!['CANCELLED','REJECTED'].includes(o.status)&&o.payment?.status==='PENDING') unpaid+=o.total;if(o.status==='COLLECTED'){revenue+=o.total;const day=collegeDay(o.createdAt,s.timezone).day;sales[day]=(sales[day]||0)+o.total;slots[o.slotId]=(slots[o.slotId]||0)+o.total;for(const i of o.items)dishes[i.name]=(dishes[i.name]||0)+i.quantity;} }
    const result={demo:reportingMode==='DEMO',total:orders.length,revenue,unpaid,pending:orders.filter(o=>['PLACED','ACCEPTED','PREPARING','READY'].includes(o.status)).length,topDishes:Object.entries(dishes).map(([name,quantity])=>({name,quantity})).sort((a,b)=>b.quantity-a.quantity).slice(0,8),sales:Object.entries(sales).map(([day,total])=>({day,total:total/100})),slots};
    if(req.query.format==='csv') {res.type('text/csv').attachment('campusbite-sales.csv').send((reportingMode==='DEMO'?'Day,DEMO collected total INR\n':'Day,Collected sales INR\n')+result.sales.map(s=>`${s.day},${s.total}`).join('\n'));return;}res.json(result);
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  app.use((error:any,req:express.Request,res:express.Response,next:express.NextFunction)=>{
    if(error instanceof z.ZodError) return res.status(400).json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});
    if(error instanceof AppError) return res.status(error.status).json({error:error.message});
    if(error.code==='P2002') return res.status(409).json({error:'This record already exists. Refresh and try again.'});
    if(error.code==='P2025') return res.status(404).json({error:'Record not found.'});
    if(error instanceof SyntaxError) return res.status(400).json({error:'Invalid JSON request.'});
    console.error('Request failed:',error.code || error.name);res.status(500).json({error:'Something went wrong. Please try again.'});
  });
  return app;
}

