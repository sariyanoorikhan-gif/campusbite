export type User={id:string;name:string;email:string;rollNumber:string;role:'STUDENT'|'STAFF'|'ADMIN'};
export type Food={id:string;name:string;description:string;ingredients:string;allergens:string;image:string;price:number;vegetarian:boolean;prepMinutes:number;available:boolean;remaining:number;categoryId:string};
export type Settings={id:string;name:string;timezone:string;openMinute:number;closeMinute:number;slotMinutes:number;slotCapacity:number;cutoffMinutes:number;noShowMinutes:number;open:boolean;announcement:string};
export type Slot={id:string;startsAt:string;endsAt:string;capacity:number;reserved:number};
export type Order={id:string;number:string;userId:string;status:string;total:number;note:string;pickupToken?:string;createdAt:string;tokenExpiresAt:string;slot:Slot;items:{menuItemId:string;name:string;unitPrice:number;quantity:number}[];payment:{status:string;method:string;mode:string;reference?:string};history:{status:string;createdAt:string;reason:string}[];user?:{name:string;rollNumber:string}};
let csrf='';
export function setCsrf(value:string){csrf=value;}
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
  const res=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(method!=='GET'?{'x-csrf-token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await res.json();if(!res.ok)throw new Error(json.error||'Request failed.');return json;
}
export const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100);
export const time=(date:string,timezone='Asia/Kolkata')=>new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit',timeZone:timezone}).format(new Date(date));
export const dateLabel=(date:string,timezone='Asia/Kolkata')=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:timezone}).format(new Date(date));
export const label=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export const fallbackImage='/food-fallback.svg';
