import { StandardCheckoutClient, StandardCheckoutPayRequest, Env } from '@phonepe-pg/pg-sdk-node';
import type {Checkout} from '../src/generated/prisma/client.js';

export type GatewayStatus={state:string;amount:number;orderId:string;transactionId?:string};
export interface PaymentGateway {
  create(checkout:Checkout,origin:string):Promise<{url:string;orderId:string}>;
  status(merchantOrderId:string):Promise<GatewayStatus>;
  webhook(authorization:string,body:string):{merchantOrderId?:string;orderId:string};
}
export function phonePeGateway():PaymentGateway|null {
  const {PHONEPE_CLIENT_ID,PHONEPE_CLIENT_SECRET,PHONEPE_CLIENT_VERSION,PHONEPE_WEBHOOK_USERNAME,PHONEPE_WEBHOOK_PASSWORD}=process.env;
  const version=Number(PHONEPE_CLIENT_VERSION);
  if(!PHONEPE_CLIENT_ID||!PHONEPE_CLIENT_SECRET||!Number.isInteger(version)||version<1||!PHONEPE_WEBHOOK_USERNAME||!PHONEPE_WEBHOOK_PASSWORD)return null;
  const env=process.env.PAYMENT_MODE==='LIVE'?Env.PRODUCTION:Env.SANDBOX;
  const client=StandardCheckoutClient.getInstance(PHONEPE_CLIENT_ID,PHONEPE_CLIENT_SECRET,version,env,false);
  return {
    async create(checkout,origin){
      const seconds=Math.floor((checkout.expiresAt.getTime()-Date.now())/1000);
      const request=StandardCheckoutPayRequest.builder().merchantOrderId(checkout.id).amount(checkout.total).redirectUrl(`${origin}/payment/${checkout.id}`).expireAfter(Math.max(300,seconds)).disablePaymentRetry(true).build();
      const result=await client.pay(request);
      const url=new URL(result.redirectUrl);
      if(url.protocol!=='https:'||!url.hostname.endsWith('.phonepe.com'))throw new Error('Unexpected gateway checkout URL');
      return {url:result.redirectUrl,orderId:result.orderId};
    },
    async status(id){const result=await client.getOrderStatus(id,true);const payment=result.paymentDetails?.find(p=>p.state==='COMPLETED'&&p.amount===result.amount);return {state:result.state,amount:result.amount,orderId:result.orderId,transactionId:payment?.transactionId};},
    webhook(authorization,body){const result=client.validateCallback(PHONEPE_WEBHOOK_USERNAME,PHONEPE_WEBHOOK_PASSWORD,authorization,body);return {merchantOrderId:result.payload.merchantOrderId,orderId:result.payload.orderId};},
  };
}
