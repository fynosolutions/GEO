import './config.js';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export type ApifyResult={status:string;actor:string|null;run_id:string|null;dataset_id:string|null;collected_at:string;note:string;items:unknown[];truncated:boolean;target:unknown;review_themes?:{value:string|null;sample_size:number;quotes:string[]}};
type Context={name:string;address:string;website_url:string;listing_url:string;city?:string};
type Entry={actor:string|null;input?:unknown;reason?:string};
export function branchMismatch(items:unknown[],target:{name:string;address:string}):boolean{
 if(items.length!==1||!items[0]||typeof items[0]!=='object')return false;
 const record=items[0] as any;
 const name=record.name||record.title||record.restaurant?.name;
 const address=record.addressText||record.address||record.location?.address||record.restaurant?.location?.address;
 if(typeof name!=='string'||!address)return false;
 // NFKC folds full-width forms; keep Han and other Unicode letters instead of deleting them.
 const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const tokens=target.name.normalize('NFKC').toLowerCase().match(/\p{Script=Han}+|[\p{L}\p{N}]+/gu)||[];
 const words=/\p{Script=Han}/u.test(target.name)?tokens:tokens.slice(0,2);
 const street=target.address.normalize('NFKC').match(/^\s*(\d+\w*)\s+([a-z-]+)/i);
 const observedName=normalize(name),observedAddress=(typeof address==='string'?address:JSON.stringify(address)).normalize('NFKC').toLowerCase();
 const nameConflict=words.length>0&&!words.every(w=>observedName.includes(normalize(w)));
 // Name parsing failure must not disable the independent address conflict check.
 const addressConflict=!!street&&(!new RegExp(`\\b${street[1]}\\b`,'i').test(observedAddress)||!observedAddress.includes(street[2].toLowerCase()));
 return nameConflict||addressConflict;
}
export function expandInput(input:unknown,context:Context):unknown {
 if(typeof input==='string')return input.replace(/\{\{(name|address|website_url|listing_url|city)\}\}/g,(_,key:keyof Context)=>context[key]||'');
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
 const entry=config[platform];if(!entry){result.note='No Actor configured for this platform.';return result;}
 if(!entry.actor){result.note=entry.reason||'No verified Actor configured.';return result;}
 const actor=entry.actor?.replace('/','~');
 if(!actor||!/^[a-zA-Z0-9_-]+(?:~[a-zA-Z0-9_-]+)?$/.test(actor)){result.status='error';result.note='Invalid Actor ID.';return result;}
 result.actor=entry.actor;
 if(JSON.stringify(entry.input).includes('{{listing_url}}')&&!target.listing_url){result.note='No branch listing URL discovered; Actor not started.';return result;}
 const timeout=AbortSignal.timeout(240000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const api=async(path:string,method='GET',body?:unknown,cleanup=false)=>{
  const response=await transport(`https://api.apify.com/v2/${path}`,{method,headers:{Authorization:`Bearer ${process.env.APIFY_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:cleanup?AbortSignal.timeout(10000):combined});
  if(!response.ok)throw new Error(`Apify HTTP ${response.status}; check token, Actor access, credit and input schema.`);
  return response.json();
 };
 let completed=false;
 try{
  combined.throwIfAborted();
  const budget=Number(process.env.APIFY_MAX_CHARGE_USD||0.5);
  if(!Number.isFinite(budget)||budget<=0)throw new Error('Invalid APIFY_MAX_CHARGE_USD.');
  const parts=target.address?.split(',')||[];
  const context={...target,city:target.city||(parts.length>=3?parts[parts.length-2].trim():'')};
  const started=await api(`acts/${actor}/runs?timeout=180&maxTotalChargeUsd=${budget}`,'POST',expandInput(entry.input,context));
  result.run_id=started.data.id;let run=started.data;
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
  result.status=result.items.length?'unverified':'empty';
  result.note='All returned dataset fields preserved with original JSON types. Provider data is not verbatim website evidence. Branch identity needs review; nothing was copied into verified website fields.';
  if(branchMismatch(result.items,target)){result.status='location_mismatch';result.note='Returned name/address conflict with the target branch. Raw items retained for diagnostics; excluded from comparison fields.';}
 }catch(error){result.status=signal?.aborted?'cancelled':'error';result.note=error instanceof Error&&error.message.startsWith('Apify HTTP')||error instanceof Error&&error.message.startsWith('Actor ended')?error.message:'Apify collection failed or timed out. Check configuration, network, credit and Actor logs.';}
 finally{if(result.run_id&&!completed)await api(`actor-runs/${encodeURIComponent(result.run_id)}/abort`,'POST',undefined,true).catch(()=>{result.note+=' Remote abort could not be confirmed; inspect Apify Console.';});}
 result.collected_at=new Date().toISOString();return result;
}
