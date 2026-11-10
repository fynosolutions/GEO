import '../config.js';
import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {collectApify,type ApifyResult} from '../apify.js';
import {actorSpec,type ReviewStore,type ReviewPlatform} from './public.js';

type Reservation={cap:number;run_id:string|null;usage_usd:number|null;state:string};
type Ledger={version:1;ceiling:number;requests:Record<string,Reservation>};
const alive=['READY','RUNNING','TIMING-OUT','ABORTING'];
export async function atomicJSON(path:string,value:unknown){const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n');await rename(tmp,path);}
async function json(path:string){try{return JSON.parse(await readFile(path,'utf8'));}catch(e:any){if(e.code==='ENOENT')return null;throw e;}}
export async function lockCache(root:string){
 await mkdir(root,{recursive:true});const path=join(root,'batch.lock');
 const handle=await open(path,'wx').catch(()=>{throw Error('Review cache is locked; inspect any previous process before removing batch.lock.');});
 await handle.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
 return async()=>{await handle.close();await unlink(path);};
}
export function chargedOrReserved(ledger:Ledger){return Object.values(ledger.requests).reduce((n,r)=>n+(r.usage_usd??r.cap),0);}
async function api(path:string,method='GET',signal?:AbortSignal){
 const r=await fetch('https://api.apify.com/v2/'+path,{method,headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},signal:signal??AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Apify '+method+' returned HTTP '+r.status+'.');return r.json();
}
async function recover(runId:string,target:any,actor:string,signal?:AbortSignal):Promise<ApifyResult>{
 const result:ApifyResult={status:'error',actor,run_id:runId,dataset_id:null,collected_at:new Date().toISOString(),note:'',items:[],truncated:false,target};
 try{
  const deadline=Date.now()+600000;let run=(await api('actor-runs/'+encodeURIComponent(runId))).data;
  while(alive.includes(run.status)){
   if(signal?.aborted||Date.now()>deadline){await api('actor-runs/'+encodeURIComponent(runId)+'/abort?gracefully=false','POST');throw Error('Existing Actor was stopped; no replacement run was started.');}
   await delay(2000,undefined,{signal});run=(await api('actor-runs/'+encodeURIComponent(runId))).data;
  }
  if(typeof run.usageTotalUsd==='number'&&Number.isFinite(run.usageTotalUsd))result.usage_usd=run.usageTotalUsd;
  result.dataset_id=run.defaultDatasetId??null;
  if(result.dataset_id){
   for(let offset=0;offset<10000;offset+=100){
    const rows=await api('datasets/'+encodeURIComponent(result.dataset_id)+'/items?format=json&offset='+offset+'&limit=100');
    if(!Array.isArray(rows))throw Error('Invalid cached Actor dataset.');result.items.push(...rows);
    if(rows.length<100)break;if(offset===9900)result.truncated=true;
   }
  }
  result.status=run.status==='SUCCEEDED'?(result.items.length?'unverified':'empty'):'error';
  result.note=run.status==='SUCCEEDED'?'Existing Actor result recovered without starting a new run.':'Actor ended with '+run.status+'; retained available dataset.';
 }catch(e){result.note=e instanceof Error?e.message:'Existing Actor recovery failed.';}
 return result;
}
export function settledUsage(platform:ReviewPlatform,meta:any,items:any[]):number|null{
 const expected=platform==='google_maps'?items.reduce((n,r)=>n+(Array.isArray(r?.reviews)?r.reviews.length:0),0):items.length;
 const charged=meta.chargedEventCounts?.[platform==='google_maps'?'review-scraped':'apify-default-dataset-item']??0;
 const prices=meta.pricingInfo?.pricingPerEvent?.actorChargeEvents;
 let minimum=0;
 for(const [event,count] of Object.entries(meta.chargedEventCounts??{})){
  if(typeof count!=='number'||count<=0)continue;
  const price=prices?.[event]?.eventPriceUsd;
  if(prices&&typeof price!=='number')return null;
  if(typeof price==='number')minimum+=price*count;
 }
 return !alive.includes(meta.status)&&charged>=expected&&typeof meta.usageTotalUsd==='number'&&Number.isFinite(meta.usageTotalUsd)&&meta.usageTotalUsd>=minimum-1e-9?meta.usageTotalUsd:null;
}
async function reconcile(root:string,ledger:Ledger){
 for(const [key,reservation] of Object.entries(ledger.requests)){
  if(!reservation.run_id)continue;
  try{
   const cached=await json(join(root,'requests',key+'.json'));
   const {data}=await api('actor-runs/'+encodeURIComponent(reservation.run_id));
   const platform=cached.spec.actor==='compass/crawler-google-places'?'google_maps':'yelp';
   reservation.usage_usd=settledUsage(platform,data,cached.result?.items??[]);
   await atomicJSON(join(root,'requests',key+'-billing.json'),{run_id:reservation.run_id,status:data.status,usage_usd:data.usageTotalUsd,chargedEventCounts:data.chargedEventCounts,settled:reservation.usage_usd!==null});
  }catch{reservation.usage_usd=null;}
 }
}
export async function cachedReviews(store:ReviewStore,platform:ReviewPlatform,limit:number,options:{root:string;budget:number;runCap:number;cacheOnly?:boolean;signal?:AbortSignal;collect?:typeof collectApify}){
 const spec=actorSpec(platform,store,limit),root=resolve(options.root),target={name:store.name,address:store.address,website_url:'',listing_url:platform==='yelp'?store.yelp_url:store.google_maps_url,place_id:platform==='google_maps'?store.place_id:undefined};
 const key=createHash('sha256').update(JSON.stringify({spec,target})).digest('hex');
 await mkdir(join(root,'requests'),{recursive:true});
 const path=join(root,'requests',key+'.json'),ledgerPath=join(root,'ledger.json');
 const ledger:Ledger=await json(ledgerPath)??{version:1,ceiling:options.budget,requests:{}};
 if(!Number.isFinite(options.budget)||options.budget<=0||options.budget>5||!Number.isFinite(options.runCap)||options.runCap<=0||options.runCap>0.5)throw Error('Review budget must be <= US$5; per-run cap must be <= US$0.50.');
 const ceiling=Math.min(ledger.ceiling,options.budget);
 if(!options.cacheOnly&&!options.collect){await reconcile(root,ledger);await atomicJSON(ledgerPath,ledger);}
 const cached=await json(path);
 if(cached?.result)return {result:cached.result as ApifyResult,cached:true,key,cost:chargedOrReserved(ledger)};
 if(options.cacheOnly)throw Error('No saved result for this exact review input; cache-only mode never starts Actors.');
 if(!process.env.APIFY_TOKEN||process.env.APIFY_ENABLED==='false')throw Error('Apify is disabled or its token is not configured.');
 if(options.signal?.aborted)throw Error('Review collection cancelled.');
 let reservation=ledger.requests[key];
 if(reservation&&!reservation.run_id)throw Error('An earlier Actor start has an uncertain outcome; inspect its saved reservation before any paid retry.');
 if(!reservation){
  if(chargedOrReserved(ledger)+options.runCap>ceiling+1e-9)throw Error('Review budget exhausted; existing results retained and no new Actor started.');
  reservation={cap:options.runCap,run_id:null,usage_usd:null,state:'reserved'};ledger.requests[key]=reservation;
  await atomicJSON(ledgerPath,ledger);await atomicJSON(path,{key,spec,target,limit,started_at:new Date().toISOString(),state:'reserved'});
 }
 const result=reservation.run_id?await recover(reservation.run_id,target,spec.actor,options.signal):await (options.collect??collectApify)(platform,target,options.signal,fetch,{
  entry:spec,timeoutMs:600000,actorTimeoutSecs:540,maxChargeUsd:reservation.cap,
  onStarted:async id=>{reservation.run_id=id;reservation.state='started';await atomicJSON(ledgerPath,ledger);await atomicJSON(path,{key,spec,target,limit,run_id:id,state:'started'});},
 });
 // If collection timed out after the start acknowledgement, recover its result; never POST a replacement.
 let final=result;
 if(result.run_id&&result.status==='error'&&!options.signal?.aborted)final=await recover(result.run_id,target,spec.actor,options.signal);
 reservation.run_id=final.run_id;reservation.state=final.status;
 if(options.collect){if(typeof final.usage_usd==='number'&&Number.isFinite(final.usage_usd)&&final.usage_usd>=0)reservation.usage_usd=final.usage_usd;}
 else {try{const {data}=await api('actor-runs/'+encodeURIComponent(final.run_id!));reservation.usage_usd=settledUsage(platform,data,final.items);}catch{reservation.usage_usd=null;}}
 // HTTP errors before acknowledgement retain their reserved cap until manually reconciled.
 await atomicJSON(path,{key,spec,target,limit,run_id:final.run_id,state:final.status,result:final});await atomicJSON(ledgerPath,ledger);
 return {result:final,cached:!!result.run_id&&result!==final,key,cost:chargedOrReserved(ledger)};
}
