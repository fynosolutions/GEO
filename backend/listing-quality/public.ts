import type {Listing} from '../collection.js';
import type {ApifyResult} from '../apify.js';
export type Absence='present'|'confirmed_absent'|'not_collected'|'unsure';
export type SearchReview={url:string;reviewed:boolean;identity_checked:boolean;no_match:boolean};
export function numericRating(value:unknown):number|null{
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const obj=value as Record<string,unknown>;
  value=obj.average??obj.ratingValue??obj.averageRating??obj.value;
 }
 const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())?Number(value):NaN;
 return Number.isFinite(n)&&n>0&&n<=5?Math.round(n*10)/10:null;
}
export function qualityListing(record:Listing,raw?:ApifyResult,review?:SearchReview){
 let absence:Absence=record.found&&record.matched?'present':'not_collected';
 const candidate=/candidate|conflict|multiple|ambiguous|matched:false/i.test(record.error||'');
 if(absence!=='present'&&candidate)absence='unsure';
 let search_url:string|null=null;
 if(absence!=='present'&&!candidate&&review?.reviewed&&review.identity_checked&&review.no_match){
  const url=new URL(review.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid reviewed search URL');
  // A failed API result cannot be upgraded to proof of absence.
  if(raw&&['success','unverified','empty'].includes(raw.status)){absence='confirmed_absent';search_url=review.url;}
 }
 const result={...record,absence,search_url};
 if('rating' in record){
  result.rating=numericRating(record.rating);
  if(record.platform==='facebook'){
   const source=typeof record.rating==='string'?record.rating:(record.rating_raw as any)?.average;
   const text=typeof source==='string'&&/recommend|not yet rated/i.test(source)?source:null;
   return {...result,rating:text?null:result.rating,recommend_text:text};
  }
 }
 return result;
}
/** Initial attempt plus five retries, all observable; no retries for disabled/cancelled providers. */
export async function retryProvider(run:()=>Promise<ApifyResult>,options:{sleep?:(ms:number)=>Promise<void>;signal?:AbortSignal;onAttempt?:(result:ApifyResult,index:number)=>void|Promise<void>;reconcile?:(result:ApifyResult)=>Promise<boolean>}={}){
 const attempts:ApifyResult[]=[];
 const sleep=options.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 for(let index=0;index<6;index++){
  options.signal?.throwIfAborted();
  const result=await run();attempts.push(result);await options.onAttempt?.(result,index);
  const itemFailure=result.items.length>0&&result.items.every((v:any)=>v?.error);
  if(result.status!=='error'&&!itemFailure||result.status==='cancelled'||result.status==='skipped')break;
  // Never replay an uncertain Actor start: it may already be charging remotely.
  const uncertain=/termination could not be confirmed/i.test(result.note)||!result.run_id&&/start.*not replayed|request failed or timed out/i.test(result.note);
  if(uncertain){
   if(!await options.reconcile?.(result))throw Error('Uncertain remote Actor state; stop for reconciliation before retrying.');
   if(result.status!=='error'&&!(result.items.length>0&&result.items.every((v:any)=>v?.error)))break;
  }
  if(index<5)await sleep(3000);
 }
 return {result:attempts.at(-1)!,attempts};
}
export class RunBudget{
 reserved=0;actual=0;
 constructor(readonly limit:number,readonly perActor:number){if(!(limit>0&&perActor>0&&perActor<=limit))throw Error('Invalid batch budget');}
 reserve(cap=this.perActor){if(!(cap>0)||this.reserved+cap>this.limit+1e-9)throw Error('Batch budget exhausted; no further Actor may start.');this.reserved+=cap;}
 settle(result:ApifyResult,cap=this.perActor){if(typeof result.usage_usd==='number'&&result.usage_usd>=0){this.actual+=result.usage_usd;this.reserved+=result.usage_usd-cap;}else if(!result.run_id&&!/network|timed out|not replayed/i.test(result.note))this.reserved-=cap;}
}
