import type {ApifyResult} from '../apify.js';
export type Receipt={status:string;usage:number|null;dataset_id:string|null};
const terminal=new Set(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT']);
/** Read only. A successful HTTP request is not proof that the remote run ended. */
export async function actorReceipt(id:string,transport:typeof fetch=fetch):Promise<Receipt|null>{
 try{
  const response=await transport('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},signal:AbortSignal.timeout(20000)});
  if(!response.ok)return null;
  const {data}=await response.json();
  if(!terminal.has(data?.status))return null;
  return {status:data.status,dataset_id:typeof data.defaultDatasetId==='string'?data.defaultDatasetId:null,usage:typeof data.usageTotalUsd==='number'&&Number.isFinite(data.usageTotalUsd)&&data.usageTotalUsd>=0?data.usageTotalUsd:null};
 }catch{return null;}
}
export async function remoteEnded(result:ApifyResult,transport:typeof fetch=fetch){return !!result.run_id&&!!await actorReceipt(result.run_id,transport);}

import {RunBudget} from './public.js';
/** Keep the full cap reserved until a later read confirms a terminal run's billing. */
export class ReceiptBudget extends RunBudget{
 pending:{run_id:string;cap:number;observed_at:number}[]=[];
 settled:{run_id:string;status:string;usage:number}[]=[];
 capture(result:ApifyResult,cap:number,now=Date.now()){
  if(result.run_id)this.pending.push({run_id:result.run_id,cap,observed_at:now});
  else this.settle({...result,usage_usd:undefined},cap);
 }
 async refresh(transport:typeof fetch=fetch,now=Date.now()){
  for(const item of [...this.pending]){
   if(now-item.observed_at<120000)continue;
   const receipt=await actorReceipt(item.run_id,transport);
   if(!receipt||receipt.usage===null)continue;
   this.settle({usage_usd:receipt.usage} as ApifyResult,item.cap);
   this.settled.push({run_id:item.run_id,status:receipt.status,usage:receipt.usage});
   this.pending=this.pending.filter(v=>v!==item);
  }
 }
}

/** Wait for the already-started run; never starts another Actor while its state is unknown. */
export async function waitForRemoteEnd(result:ApifyResult,options:{transport?:typeof fetch;signal?:AbortSignal;timeoutMs?:number;sleep?:(ms:number)=>Promise<void>;now?:()=>number}={}){
 if(!result.run_id)return false;
 const now=options.now??Date.now,start=now(),sleep=options.sleep??(ms=>new Promise<void>(r=>setTimeout(r,ms)));
 do{
  if(options.signal?.aborted)return false;
  if(await actorReceipt(result.run_id,options.transport))return true;
  if(now()-start>=(options.timeoutMs??1200000))return false;
  await sleep(15000);
 }while(true);
}

/** Recover the same completed run's data before considering another paid attempt. */
export async function recoverRemoteResult(result:ApifyResult,options:Parameters<typeof waitForRemoteEnd>[1]={}){
 if(!await waitForRemoteEnd(result,options))return false;
 const transport=options.transport??fetch,receipt=await actorReceipt(result.run_id!,transport);
 if(receipt?.status!=='SUCCEEDED'||!receipt.dataset_id)return true;
 try{
  const items:unknown[]=[];let truncated=false;
  for(let offset=0;offset<10000;offset+=100){
   const response=await transport('https://api.apify.com/v2/datasets/'+encodeURIComponent(receipt.dataset_id)+'/items?format=json&offset='+offset+'&limit=100',{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},signal:options.signal??AbortSignal.timeout(20000)});
   if(!response.ok)return true;
   const page=await response.json();if(!Array.isArray(page))return true;items.push(...page);if(page.length<100)break;if(offset===9900)truncated=true;
  }
  Object.assign(result,{status:items.length?'unverified':'empty',items,truncated,dataset_id:receipt.dataset_id,collected_at:new Date().toISOString(),note:'Existing remote run ended; dataset recovered without starting another Actor.',...(receipt.usage===null?{}:{usage_usd:receipt.usage})});
 }catch{/* Terminal state is known, so a bounded retry is safe if dataset recovery fails. */}
 return true;
}
