import './config.js';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import {conciseError} from './errors.js';

export type ApifyResult={status:string;actor:string|null;run_id:string|null;dataset_id:string|null;collected_at:string;note:string;items:unknown[];truncated:boolean;target:unknown};
export type Context={name:string;address:string;website_url:string;listing_url:string;city?:string;place_id?:string;queries?:string;search_url?:string};
type Entry={actor:string|null;input?:unknown;reason?:string;listing_actor?:string;listing_input?:unknown};
export function expandInput(input:unknown,context:Context):unknown {
 if(typeof input==='string')return input.replace(/\{\{(name|address|website_url|listing_url|city|queries|search_url)\}\}/g,(_,key:keyof Context)=>context[key]||'');
 if(Array.isArray(input))return input.map(v=>expandInput(v,context));
 if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,expandInput(v,context)]));
 return input;
}
export async function collectApify(platform:string,target:Context,signal?:AbortSignal,transport:typeof fetch=fetch):Promise<ApifyResult> {
 const result:ApifyResult={status:'skipped',actor:null,run_id:null,dataset_id:null,collected_at:new Date().toISOString(),note:'',items:[],truncated:false,target};
 if(process.env.APIFY_ENABLED==='false'||!process.env.APIFY_TOKEN){result.note='Apify disabled or APIFY_TOKEN not configured.';return result;}
 let config:Record<string,Entry>;
 try{config=JSON.parse(await readFile(process.env.APIFY_CONFIG_FILE||'config/apify.json','utf8'));}
 catch{result.status='error';result.note='Cannot read Apify config JSON.';return result;}
 let entry=config[platform];if(!entry){result.note='No Actor configured for this platform.';return result;}
 if(target.listing_url&&entry.listing_input)entry={...entry,actor:entry.listing_actor||entry.actor,input:entry.listing_input};
 if(!entry.actor){result.note=conciseError(entry.reason||'No verified Actor configured.');return result;}
 const actor=entry.actor?.replace('/','~');
 if(!actor||!/^[a-zA-Z0-9_-]+(?:~[a-zA-Z0-9_-]+)?$/.test(actor)){result.status='error';result.note='Invalid Actor ID.';return result;}
 result.actor=entry.actor;
 if(JSON.stringify(entry.input||{}).includes('{{listing_url}}')&&!target.listing_url){result.note='No branch listing URL discovered; Actor not started.';return result;}
 const timeout=AbortSignal.timeout(240000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const api=async(path:string,method='GET',body?:unknown,cleanup=false)=>{
  const requestSignal=cleanup?AbortSignal.timeout(10000):combined;
  const attempts=method==='GET'?3:1;
  for(let attempt=0;attempt<attempts;attempt++){
   requestSignal.throwIfAborted();
   let response:Response;
   try{
    response=await transport(`https://api.apify.com/v2/${path}`,{method,headers:{Authorization:`Bearer ${process.env.APIFY_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:requestSignal});
   }catch{
    if(requestSignal.aborted)requestSignal.throwIfAborted();
    if(attempt+1<attempts){await delay(500*2**attempt,undefined,{signal:requestSignal});continue;}
    throw Error(`Apify API network failure during ${method==='POST'?'Actor start/abort':'status or dataset read'}; ${method==='POST'?'request was not replayed to avoid duplicate runs.':'read retries exhausted.'}`);
   }
   if(!response.ok){
    const transient=[429,500,502,503,504].includes(response.status);
    let kind='';try{const data=await response.json();if(typeof data.error?.type==='string'&&/^[a-z0-9-]{1,100}$/.test(data.error.type))kind=data.error.type;}catch{}
    if(transient&&attempt+1<attempts){await delay(500*2**attempt,undefined,{signal:requestSignal});continue;}
    const reason=response.status===401?'invalid or expired Token':response.status===402?'Insufficient Apify account usage':response.status===403?'Actor or resource permission denied':transient?(method==='GET'?'temporary Apify API failure; read retries exhausted':'temporary Apify API failure; Actor start was not replayed'):'request or Actor input rejected';
    throw Error(`Apify HTTP ${response.status}${kind?` (${kind})`:''}; ${reason}; Stage: ${path.startsWith('acts/')?'start':path.startsWith('datasets/')?'dataset read':'run status/abort'}.`);
   }
   try{return await response.json();}catch{
    if(requestSignal.aborted)requestSignal.throwIfAborted();
    if(attempt+1<attempts){await delay(500*2**attempt,undefined,{signal:requestSignal});continue;}
    throw Error(`Apify API unreadable response during ${method==='GET'?'status or dataset read':'Actor start/abort'}; request retries exhausted.`);
   }
  }
  throw Error('Apify API read failed.');
 };
 let completed=false,abortFailed=false,abortTask:Promise<void>|undefined;
 const abortRemote=()=>{
  if(!result.run_id||completed)return;
  abortTask??=api(`actor-runs/${encodeURIComponent(result.run_id)}/abort?gracefully=false`,'POST',undefined,true).then(()=>{}).catch(()=>{
   abortFailed=true;
  });
 };
 combined.addEventListener('abort',abortRemote,{once:true});
 try{
  combined.throwIfAborted();
  const budget=Number(process.env.APIFY_MAX_CHARGE_USD||0.5);
  if(!Number.isFinite(budget)||budget<=0)throw new Error('Invalid APIFY_MAX_CHARGE_USD.');
  const parts=target.address?.split(',')||[];
  const context={...target,city:target.city||(parts.length>=3?parts[parts.length-2].trim():'')};
  // Use the Actor's native Place ID field; Maps API search URLs can silently return an empty dataset.
  const actorInput=platform==='google_maps'&&target.place_id
   ? {...entry.input as object,placeIds:[target.place_id],startUrls:undefined,searchStringsArray:undefined}
   : platform==='google_maps'&&target.listing_url
    ? {...entry.input as object,startUrls:[{url:target.listing_url}],searchStringsArray:undefined}
    : entry.input;
  const started=await api(`acts/${actor}/runs?timeout=180&maxTotalChargeUsd=${budget}`,'POST',expandInput(actorInput,context),true);
  result.run_id=started.data.id;let run=started.data;
  if(!['READY','RUNNING','TIMING-OUT','ABORTING'].includes(run.status))completed=true;
  if(combined.aborted)abortRemote();
  combined.throwIfAborted();
  while(['READY','RUNNING','TIMING-OUT','ABORTING'].includes(run.status)){
   await delay(2000,undefined,{signal:combined});run=(await api(`actor-runs/${encodeURIComponent(result.run_id!)}`)).data;
  }
  completed=true;result.dataset_id=run.defaultDatasetId||null;
  if(run.status!=='SUCCEEDED')throw new Error(`Actor ended with ${run.status}.`);
  if(!result.dataset_id)throw new Error('Actor returned no dataset.');
  // Fetch every field; paginate records without clean/fields/omit projections.
  const max=10000;
  for(let offset=0;offset<max;offset+=100){
   const items=await api(`datasets/${encodeURIComponent(result.dataset_id)}/items?format=json&offset=${offset}&limit=100`);
   if(!Array.isArray(items))throw new Error('Invalid dataset response.');
   result.items.push(...items);if(items.length<100)break;
   if(offset+100===max)result.truncated=true;
  }
  if(!result.items.length&&/0 succeeded,\s*[1-9]\d* failed/i.test(run.statusMessage||''))throw new Error('Actor ended with all requests failed.');
  result.status=result.items.length?'unverified':'empty';
  result.note='Dataset collected; identity and field validation are performed before export.';
 }catch(error){result.status=signal?.aborted?'cancelled':'error';result.note=signal?.aborted?'Cancelled.':error instanceof Error&&error.message.startsWith('Apify ')||error instanceof Error&&error.message.startsWith('Actor ended')?conciseError(error):'Apify request failed or timed out.';}
 finally{abortRemote();await abortTask;combined.removeEventListener('abort',abortRemote);if(abortFailed)result.note=result.note.replace(/[.!?]+$/,'')+'; remote Actor termination could not be confirmed.';}
 result.collected_at=new Date().toISOString();return result;
}
