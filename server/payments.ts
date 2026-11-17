import {db} from './db.js';
import {randomBytes} from 'node:crypto';
import {checkoutSchema,fail,includeOrder,settings,releaseCheckout,reserveCheckout,type CheckoutLine} from './domain.js';
import {phonePeGateway,type PaymentGateway,type GatewayStatus} from './phonepe.js';
import type {z} from 'zod';

export function createPaymentService(options:{mode?:string;gateway?:PaymentGateway|null}={}){
  const mode=options.mode||process.env.PAYMENT_MODE||'DISABLED';
  const gateway=options.gateway===undefined?(mode==='LIVE'||mode==='SANDBOX'?phonePeGateway():null):options.gateway;
  const configured=mode==='DEMO'||(['LIVE','SANDBOX'].includes(mode)&&!!gateway);
  async function own(id:string,userId:string){const checkout=await db.checkout.findUnique({where:{id}});if(!checkout||checkout.userId!==userId)fail(404,'Payment session not found.');return checkout;}
  async function complete(id:string,receipt:GatewayStatus,expectedMode:string){
    const canteen=await settings();
    return db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${id} FOR UPDATE`;
      const checkout=await tx.checkout.findUnique({where:{id},include:{slot:true}});
      if(!checkout)fail(404,'Payment session not found.');
      if(checkout.mode!==expectedMode)fail(409,'Payment environment does not match this checkout.');
      if(receipt.state!=='COMPLETED'||receipt.amount!==checkout.total||receipt.orderId!==checkout.gatewayOrderId||!receipt.transactionId)fail(409,'Payment could not be verified. No food order has been created.');
      if(checkout.state==='COMPLETED')return checkout;
      if(checkout.state==='REFUND_PENDING')return checkout;
      if(checkout.state!=='PENDING'||checkout.expiresAt<=new Date()){
        if(checkout.state==='PENDING')await releaseCheckout(tx,checkout);
        // Preserve the financial reference even if stock was already released. Never create an unreserved order.
        return tx.checkout.update({where:{id},data:{state:'REFUND_PENDING',gatewayTransactionId:receipt.transactionId}});
      }
      const lines=checkout.items as CheckoutLine[];
      const order=await tx.order.create({data:{userId:checkout.userId,number:`CB-${checkout.stockDay.replaceAll('-','')}-${randomBytes(4).toString('hex').toUpperCase()}`,slotId:checkout.slotId,total:checkout.total,note:checkout.note,pickupToken:randomBytes(16).toString('hex'),tokenExpiresAt:new Date(checkout.slot.endsAt.getTime()+canteen.noShowMinutes*60000),idempotencyKey:checkout.idempotencyKey,requestHash:checkout.requestHash,items:{create:lines},payment:{create:{amount:checkout.total,method:checkout.mode==='DEMO'?'DEMO_UPI':'PHONEPE',mode:checkout.mode,status:'PAID',paidAt:new Date(),reference:receipt.transactionId,events:{create:{actorId:checkout.mode==='DEMO'?'DEMO_SIMULATOR':'PHONEPE_VERIFIED',status:'PAID'}}}},history:{create:{status:'PLACED',actorId:checkout.userId}}},include:includeOrder});
      const result=await tx.checkout.update({where:{id},data:{state:'COMPLETED',orderId:order.id,gatewayTransactionId:receipt.transactionId}});
      await tx.notification.create({data:{userId:checkout.userId,message:`${checkout.mode==='DEMO'?'Demo payment completed (no money charged).':'Payment verified.'} Order ${order.number} is now with the kitchen.`}});
      return result;
    },{timeout:20000});
  }
  async function view(id:string,userId:string){
    const checkout=await own(id,userId);
    if(checkout.state==='PENDING'&&checkout.expiresAt<=new Date())await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${id} FOR UPDATE`;const current=await tx.checkout.findUnique({where:{id}});if(current?.state==='PENDING')await releaseCheckout(tx,current);});
    const current=await own(id,userId);
    return {id:current.id,state:current.state,mode:current.mode,total:current.total,items:current.items,method:current.method,expiresAt:current.expiresAt,orderId:current.orderId,redirectUrl:current.state==='PENDING'?current.gatewayUrl:null};
  }
  async function reconcile(id:string,userId:string){
    const checkout=await own(id,userId);
    if(checkout.mode==='DEMO')return view(id,userId);
    if(checkout.mode!==mode||!gateway)fail(503,'The merchant payment gateway is not configured for this payment.');
    if(checkout.state!=='COMPLETED'&&checkout.gatewayOrderId){
      const receipt=await gateway.status(id);
      if(receipt.orderId!==checkout.gatewayOrderId||receipt.amount!==checkout.total)fail(409,'Gateway order or amount mismatch.');
      if(receipt.state==='COMPLETED')await complete(id,receipt,checkout.mode);
      else if(receipt.state==='FAILED')await end(id,userId,'FAILED');
    }
    return view(id,userId);
  }
  async function end(id:string,userId:string,state='FAILED'){
    await own(id,userId);
    await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${id} FOR UPDATE`;const current=await tx.checkout.findUnique({where:{id}});if(current?.state==='PENDING')await releaseCheckout(tx,current,state);});
    return view(id,userId);
  }
  return {
    config:()=>({mode,enabled:configured,provider:mode==='DEMO'?'CampusBite demo':'PhonePe',requiresPrepayment:true,message:mode==='DEMO'?'Demo payment only. No real money is charged.':configured?'Pay securely before your order reaches the kitchen.':'Online payments are not configured. Ordering is unavailable.'}),
    async start(userId:string,input:z.infer<typeof checkoutSchema>,origin:string,method='PhonePe'){
      if(!configured)fail(503,'Online payments are not configured. No food order was created.');
      const checkout=await reserveCheckout(userId,input,mode,method);
      if(checkout.mode!==mode)fail(409,'Start a new checkout in the current payment mode.');
      if(checkout.state==='PENDING'&&!checkout.gatewayOrderId){
        // Lock while linking the provider request; a repeated start cannot create two gateway sessions.
        await db.$transaction(async tx=>{
          await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${checkout.id} FOR UPDATE`;
          const current=await tx.checkout.findUniqueOrThrow({where:{id:checkout.id}});
          if(current.gatewayOrderId||current.state!=='PENDING')return;
          if(current.expiresAt<=new Date())fail(409,'Payment session expired. Start again.');
          const result=mode==='DEMO'?{url:`${origin}/payment/${current.id}`,orderId:`demo-${current.id}`} :await gateway!.create(current,origin);
          await tx.checkout.update({where:{id:current.id},data:{gatewayOrderId:result.orderId,gatewayUrl:result.url}});
        },{timeout:20000}).catch(async error=>{await end(checkout.id,userId);throw error;});
      }
      return view(checkout.id,userId);
    },
    view,reconcile,
    async demo(id:string,userId:string,result:'success'|'failure'){
      const checkout=await own(id,userId);
      if(mode!=='DEMO'||checkout.mode!=='DEMO')fail(403,'Demo payment actions are disabled outside demo mode.');
      if(result==='failure')return end(id,userId);
      if(checkout.state!=='PENDING'&&checkout.state!=='COMPLETED')fail(409,'This payment session is no longer active.');
      if(checkout.expiresAt<=new Date()){await end(id,userId,'EXPIRED');fail(409,'Payment session expired. No money was charged.');}
      await complete(id,{state:'COMPLETED',amount:checkout.total,orderId:checkout.gatewayOrderId!,transactionId:`DEMO-${checkout.id}`},'DEMO');
      return view(id,userId);
    },
    async webhook(authorization:string,body:string){
      if(!gateway||!['LIVE','SANDBOX'].includes(mode))fail(403,'Gateway callbacks are not enabled.');
      let reference:{merchantOrderId?:string;orderId:string};
      try{reference=gateway.webhook(authorization,body);}catch{fail(401,'Invalid payment callback authentication.');}
      const checkout=await db.checkout.findFirst({where:reference.merchantOrderId?{id:reference.merchantOrderId}:{gatewayOrderId:reference.orderId}});
      if(!checkout)return {ok:true};
      if(checkout.gatewayOrderId!==reference.orderId)fail(409,'Payment callback reference mismatch.');
      await reconcile(checkout.id,checkout.userId);return {ok:true};
    },
  };
}
