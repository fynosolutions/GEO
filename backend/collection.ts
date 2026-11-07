import './config.js';
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { collectApify, type ApifyResult } from './apify.js';
import { readWithBrowser, matchesDomains, isListingCandidate } from './browser.js';
import {conciseError,preferredFailure} from './errors.js';

export const domains: Record<string,string[]> = {
 google_maps:['google.com','maps.google.com'], yelp:['yelp.com'], tripadvisor:['tripadvisor.com'],
 opentable:['opentable.com'], doordash:['doordash.com'], uber_eats:['ubereats.com'], grubhub:['grubhub.com'], facebook:['facebook.com'],
 resy:['resy.com'], instagram:['instagram.com'],
};
export const platformGroups={
 listings:['google_maps','yelp','tripadvisor','opentable','doordash','uber_eats','grubhub','facebook'],
 profiles:['resy','instagram'],
};
const commonFields=['platform','found','matched','url','name','address','phone','hours'];
export const fieldGroups={
 listings:[...commonFields,'rating_raw','rating','review_count','price_level','fetched_at','error'],
 profiles:[...commonFields,'followers','posts','price_level','fetched_at','error'],
};
export const fieldsForPlatform=(platform:string)=>fieldGroups[platformGroups.profiles.includes(platform)?'profiles':'listings'];
export type SourceValue=string|number|boolean|null|SourceValue[]|{[key:string]:SourceValue};
export type Listing = {
 platform:string; found:boolean; matched:boolean; url:string|null; name:string|null; address:SourceValue; phone:SourceValue;
 hours:SourceValue; rating_raw?:SourceValue; rating?:SourceValue; review_count?:SourceValue; followers?:SourceValue; posts?:SourceValue; price_level:SourceValue; fetched_at:string; error:string|null;
};
const pick=(...values:any[])=>values.find(v=>v!==undefined&&v!==null)??null;
export function emptyListing(platform:string,error:string|null=null):Listing {
 return {platform,found:false,matched:false,url:null,name:null,address:null,phone:null,hours:null,
  ...(platformGroups.profiles.includes(platform)?{followers:null,posts:null}:{rating_raw:null,rating:null,review_count:null}),
  price_level:null,fetched_at:new Date().toISOString(),error:error?conciseError(error):null};
}
// Only select source fields. Do not reformat, trim, coerce, aggregate or backfill values.
export function mapItem(platform:string,item:any):Listing {
 const r=item?.restaurant||item||{},loc=r.location||{},aggregate=r.aggregateRating||{};
 const result=emptyListing(platform);
 result.name=pick(r.name,r.title,r.storeName,r.store_name,r.restaurantName,platform==='instagram'?r.fullName:null);
 result.address=pick(r.addressText,r.formattedAddress,r.address,loc.address,platform==='instagram'?r.businessAddress:null,platform==='resy'?r.address1:null);
 result.phone=pick(r.phone,r.phone_formatted,r.phone_number,r.telephone,r.phoneNumber,r.contact?.phone,platform==='instagram'?r.businessPhoneNumber:null);
 result.url=pick(r.url,r.webUrl,r.directUrl,r.link,r.detailUrl,r.businessUrl,r.storeUrl,r.store_url,r.pageUrl,r.facebookUrl,platform==='resy'?r.resyUrl:null);
 result.hours=pick(r.openingHoursSpecification,r.openingHours,r.opening_hours,r.operationHours,r.hours,r.business_hours,r.businessHours,r.availableHours);
 const rawRating=pick(r.totalScore,r.rating,r.aggregatedRating,r.stars,r.averageRating,r.aggregateRating,platform==='facebook'?r.ratingOverall:null);
 if(platformGroups.profiles.includes(platform)){
  result.followers=pick(r.followersCount,r.followers_count,r.followers);
  result.posts=pick(r.postsCount,r.posts_count,typeof r.posts==='number'?r.posts:null);
  if(platform==='instagram'&&typeof r.biography==='string'){
   // Only extract identity evidence actually present in the profile, never SERP snippets.
   result.phone=pick(result.phone,r.biography.match(/(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/)?.[0]);
   result.address=pick(result.address,r.biography.match(/\b\d{1,6}\s+[^\n,]{1,70}\b(?:Street|St|Avenue|Ave|Road|Rd|Broadway|Blvd|Boulevard|Lane|Ln|Drive|Dr)\b[^\n]*/i)?.[0]);
  }
 }else{
  result.rating=pick(r.totalScore,r.rating,r.aggregatedRating,r.stars,r.averageRating,aggregate.ratingValue,platform==='facebook'?r.ratingOverall:null);
  if(platform==='facebook'&&typeof result.rating==='string'&&/^\s*Not yet rated\b/i.test(result.rating))result.rating=0;
  result.review_count=pick(r.reviewsCount,r.reviews_count,r.reviewCount,r.review_count,aggregate.reviewCount,aggregate.ratingCount,r.rating?.count,r.numReviews,r.num_ratings,r.numberOfReviews,r.ratingCount);
  if(rawRating!==null||result.review_count!==null){
   if(rawRating&&typeof rawRating==='object'&&!Array.isArray(rawRating)){
    const hasCount=['count','reviewCount','ratingCount','review_count','reviewsCount'].some(key=>Object.hasOwn(rawRating,key));
    result.rating_raw=hasCount?rawRating:{...rawRating,count:result.review_count??null};
   }else result.rating_raw={average:rawRating,count:result.review_count??null};
  }
 }
 result.price_level=pick(r.priceLevel,r.price_level,r.priceRange,r.price_range,r.priceRangeWithCurrency,r.priceRating,r.price);
 result.found=typeof result.name==='string'&&!!result.name.trim();return result;
}
// Private comparison text is never written back into the source-valued output.
export function addressText(value:any):string {
 if(typeof value==='string'){
  if(value.trim().startsWith('{'))try{return addressText(JSON.parse(value));}catch{}
  return value;
 }
 if(!value||typeof value!=='object')return '';
 return value.formatted||value.display_address||[value.streetAddress||value.street||value.addressLine1||value.street_address,value.addressLocality||value.city||value.city_name,value.addressRegion||value.state||value.regionCode,value.postalCode||value.zip].filter(v=>typeof v==='string').join(', ');
}
const normalized=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\bavenue\b/g,'ave').replace(/[^\p{L}\p{N}]/gu,'');
export type Identity={name:string;address:SourceValue;phone?:SourceValue};
function nameMatches(a:string,b:string):boolean{
 const x=normalized(a),y=normalized(b);if(!x||!y)return false;
 if(x.includes(y)||y.includes(x))return true;
 const brandA=normalized(a.split(/[([]/)[0]),brandB=normalized(b.split(/[([]/)[0]);
 if(brandA.length>=4&&y.includes(brandA)||brandB.length>=4&&x.includes(brandB))return true;
 const words=(v:string):string[]=>v.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 const left=words(a),right=words(b);const common=left.filter(w=>right.includes(w));
 return common.length>=2&&common.length/Math.min(left.length,right.length)>=0.6;
}
export function inputWebsite(input:CollectionInput):string|null{
 const value=input.name?.trim()||'';
 try{if(!/^(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}(?:\/|$))/i.test(value))return null;const u=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return u.hostname.replace(/^www\./,'').toLowerCase();}catch{return null;}
}
function identityEvidence(record:Listing,target:Identity) {
 const targetAddress=addressText(target.address),recordAddress=addressText(record.address);
 const address=normalized(targetAddress);
 const observedAddress=normalized(recordAddress);
 const nameMatch=nameMatches(record.name||'',target.name);
 const completeStreet=(v:string)=>/\d/.test(v)&&/\p{L}/u.test(v);
 const streetKey=(v:string)=>normalized(v.split(/[\n,]/)[0].replace(/\beast\b/gi,'e').replace(/\bwest\b/gi,'w').replace(/\bnorth\b/gi,'n').replace(/\bsouth\b/gi,'s'));
 const zip=(v:string)=>v.match(/\b\d{5}(?:-\d{4})?\b/)?.[0].slice(0,5);
 const zipConflict=!!zip(targetAddress)&&!!zip(recordAddress)&&zip(targetAddress)!==zip(recordAddress);
 const addressMatch=!zipConflict&&completeStreet(address)&&completeStreet(observedAddress)&&(observedAddress.includes(address)||address.includes(observedAddress)||streetKey(targetAddress)===streetKey(recordAddress));
 const phone=(v:any)=>String(v).replace(/\D/g,'').slice(-10);
 const phoneMatch=!!target.phone&&!!record.phone&&phone(target.phone).length===10&&phone(target.phone)===phone(record.phone);
 // Reject an explicit street-number conflict even if name and phone happen to match.
 const street=(v:string)=>v.match(/^\s*(\d+[a-z]?)\b/i)?.[1];
 const streetConflict=!!(targetAddress&&recordAddress&&street(targetAddress)&&street(recordAddress)&&street(targetAddress)!==street(recordAddress));
 const facts={name:nameMatch,address:addressMatch,phone:phoneMatch};
 return {facts,streetConflict,count:Object.values(facts).filter(Boolean).length};
}
export function matchesIdentity(record:Listing,target:Identity):boolean {
 const evidence=identityEvidence(record,target);
 return !evidence.streetConflict&&evidence.count>=2;
}
const noPublicListing='No matching public listing was found.';
function unmatchedReason(records:Listing[],target:Identity):string{
 if(!records.length)return noPublicListing;
 const ranked=records.map(record=>({record,...identityEvidence(record,target)})).sort((a,b)=>b.count-a.count);
 const best=ranked[0];
 if(!best.count)return noPublicListing;
 const matched=Object.entries(best.facts).filter(([,value])=>value).map(([key])=>key);
 const missing=(['name','address','phone'] as const).filter(key=>!best.record[key]||key==='address'&&!addressText(best.record.address));
 const different=(['name','address','phone'] as const).filter(key=>!missing.includes(key)&&!best.facts[key]);
 if(best.streetConflict)return 'matched:false; the candidate has a conflicting street number.';
 if(best.count>=2)return 'matched:false; no valid platform listing URL was returned.';
 const details=[...(missing.length?[`missing: ${missing.join(', ')}`]:[]),...(different.length?[`different: ${different.join(', ')}`]:[])];
 return `Candidate found but matched:false; only ${matched.join(', ')} matches${details.length?` (${details.join('; ')})`:''}.`;
}
export function mapApify(platform:string,result:ApifyResult,target:Identity):Listing {
 if(!['unverified','success'].includes(result.status))return {...emptyListing(platform,result.status==='empty'?noPublicListing:result.note||'Platform collection did not complete.'),fetched_at:result.collected_at};
 if(result.items.length&&result.items.every((v:any)=>v?.demo===true))return {...emptyListing(platform,'Actor returned demo data instead of live results.'),fetched_at:result.collected_at};
 if(result.items.length&&result.items.every((v:any)=>v&&typeof v==='object'&&v.error)){
  const detail=result.items.map((v:any)=>String(v.errorDescription||v.error)).join(' ');
  const reason=/private|login|log in|sign in/i.test(detail)?'The public listing is private or requires login.':/blocked|captcha|403/i.test(detail)?'Platform access was blocked.':/timeout|timed out/i.test(detail)?'The platform request timed out.':'Actor could not retrieve the public listing.';
  return {...emptyListing(platform,reason),fetched_at:result.collected_at};
 }
 const cateringOnly=platform==='grubhub'&&!/\bcatering\b/i.test(target.name);
 const observed=result.items.filter((v:any)=>v&&typeof v==='object'&&!v.error).map((v:any)=>{
  const mapped=mapItem(platform,v);const requested=(result.target as any)?.listing_url;
  if(platform==='doordash'&&!mapped.url&&requested&&v.restaurant?.id){
   try{const id=new URL(requested).pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1];if(id===String(v.restaurant.id))mapped.url=requested;}catch{}
  }
  return mapped;
 });
 const candidates=observed.filter(v=>!(cateringOnly&&/\bcatering\b/i.test((v.name||'')+' '+(v.url||'')))&&matchesIdentity(v,target)&&v.url&&matchesDomains(v.url,domains[platform])&&isListingCandidate(v.url,platform));
 if(candidates.length!==1)return {...emptyListing(platform,candidates.length?'matched:false; multiple listings match the target.':unmatchedReason(observed,target)),fetched_at:result.collected_at};
 return {...candidates[0],matched:true,fetched_at:result.collected_at};
}
export function resolveGoogle(result:ApifyResult,input:CollectionInput):Listing {
 if(!['unverified','success'].includes(result.status))return emptyListing('google_maps',result.note||'Google identity resolution failed.');
 const website=inputWebsite(input);
 const candidates=result.items.filter((v:any)=>{
  if(!v||typeof v!=='object'||v.error||input.place_id&&v.placeId!==input.place_id&&v.place_id!==input.place_id)return false;
  if(website){try{return new URL(/^https?:/i.test(v.website)?v.website:`https://${v.website}`).hostname.replace(/^www\./,'').toLowerCase()===website;}catch{return false;}}
  return true;
 }).map(v=>mapItem('google_maps',v)).filter(v=>v.name&&v.address&&v.url&&matchesDomains(v.url,domains.google_maps)&&(!input.name||website||nameMatches(v.name!,input.name))&&(!input.address||matchesIdentity(v,{name:v.name!,address:input.address})));
 return candidates.length===1?{...candidates[0],matched:true,fetched_at:result.collected_at}:emptyListing('google_maps',candidates.length?'Ambiguous Google identity; supply a full branch address or place ID.':'Google could not resolve a unique restaurant name and address.');
}
export function safeName(value:string):string {
 const clean=Array.from(value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')).slice(0,100).join('').replace(/[. ]+$/g,'')||'merchant';
 return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)?`_${clean}`:clean;
}
async function json(path:string,value:unknown){const tmp=`${path}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,path);}
export type CollectionInput={name?:string;place_id?:string;address?:string;platforms?:string[]};
export function selectedPlatforms(value:unknown=undefined):string[]{
 if(value===undefined)return Object.keys(domains);
 if(!Array.isArray(value)||value.length===0||value.some(k=>typeof k!=='string'||!Object.hasOwn(domains,k)))throw Error('Select at least one valid platform.');
 return Object.keys(domains).filter(k=>value.includes(k));
}
type Dependencies={apify?:typeof collectApify;browser?:typeof readWithBrowser;outputDirectory?:string};
// Ignore tracking parameters and URL spelling variants when counting Yelp candidates.
function yelpCandidateKey(value:string):string|null{
 try{const url=new URL(value);if(!matchesDomains(value,domains.yelp)||!isListingCandidate(value,'yelp'))return null;return url.pathname.replace(/\/+$/,'').toLowerCase();}catch{return null;}
}
async function collectYelpCandidates(apify:typeof collectApify,target:Parameters<typeof collectApify>[1],urls:string[],identity:Identity,signal?:AbortSignal){
 const attempts:ApifyResult[]=[],visited=new Set<string>(),failureReasons=new Set<string>();const queue=[...urls];let searched=false;
 let best=emptyListing('yelp',noPublicListing);
 const run=async(listing_url:string)=>{
  signal?.throwIfAborted();
  // Search can return the mobile alias of the same observed Yelp business URL.
  const listing=new URL(listing_url);if(listing.hostname==='m.yelp.com')listing.hostname='www.yelp.com';listing_url=listing.href;
  let raw:ApifyResult;
  try{raw=await apify('yelp',{...target,listing_url},signal);}catch(e){signal?.throwIfAborted();raw={status:'error',actor:null,run_id:null,dataset_id:null,collected_at:new Date().toISOString(),note:e instanceof Error?e.message:'Yelp collection failed.',items:[],truncated:false,target:{...target,listing_url}};}
  attempts.push(raw);return raw;
 };
 while(visited.size<3){
  signal?.throwIfAborted();
  let url=queue.shift();
  if(url){const candidate=new URL(url);if(candidate.hostname==='m.yelp.com'){candidate.hostname='www.yelp.com';url=candidate.href;}}
  if(url){
   const key=yelpCandidateKey(url);if(!key||visited.has(key))continue;
   visited.add(key);best=mapApify('yelp',await run(url),identity);if(best.matched)break;
   if(best.error)failureReasons.add(best.error);
  }else if(!searched){
   searched=true;
   // This Yelp Actor rewrites search URLs to yelp.co.uk; use Apify SERP for discovery.
   const queries=[`site:yelp.com/biz/ "${target.name}" "${target.address.split(',')[0]}" ${target.address}`,
    ...(identity.phone?[`site:yelp.com/biz/ "${target.name}" "${String(identity.phone).replace(/\D/g,'').slice(-10).replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3')}" ${target.address}`]:[])].join('\n');
   const raw=await apify('_discovery',{...target,listing_url:'',queries},signal);attempts.push(raw);
   for(const page of raw.items as any[])for(const entry of page.organicResults||[]){const url=entry.url||entry.link;if(typeof url==='string'&&yelpCandidateKey(url))queue.push(url);}
   if(raw.status==='error'&&raw.note)failureReasons.add(raw.note);
   if(!queue.length&&raw.status==='error')best=emptyListing('yelp',raw.note);
  }else break;
 }
 if(!best.matched)best={...best,error:preferredFailure(failureReasons,best.error||noPublicListing)};
 return {best,attempts};
}
export async function collectRestaurant(input:CollectionInput,signal?:AbortSignal,onResult?:(r:Listing)=>Promise<void>,dependencies:Dependencies={}) {
 if(!input.name?.trim()&&!input.place_id?.trim())throw Error('Provide a restaurant name or Google place ID.');
 if(input.name?.trim()&&input.place_id?.trim())throw Error('Provide either a restaurant name or place ID, not both.');
 const selected=selectedPlatforms(input.platforms);
 const apify=dependencies.apify||collectApify;
 const label=input.name?.trim()||input.place_id!;
 const directory=resolve(process.env.COLLECTION_DATA_DIR||'.local/collections',randomUUID());
 await mkdir(directory,{recursive:true});
 const providerData:Record<string,unknown>={};
 const target={name:input.name?.trim()||'',address:input.address?.trim()||'',phone:null as SourceValue,website_url:'',listing_url:input.place_id?`https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(input.place_id)}&query=restaurant`:'',place_id:input.place_id};
 let google:ApifyResult;
 try{google=await apify('google_maps',target,signal);}catch(e){google={status:'error',actor:null,run_id:null,dataset_id:null,collected_at:new Date().toISOString(),note:e instanceof Error?e.message:'Google failed.',items:[],truncated:false,target};}
 providerData.google_maps=google;
 const g=resolveGoogle(google,input);
 if(g.found){target.name=g.name!;target.address=addressText(g.address);target.phone=g.phone;const seed=google.items.find((v:any)=>mapItem('google_maps',v).url===g.url) as any;target.website_url=typeof seed?.website==='string'?seed.website:'';}
 // A place-ID-only run cannot honestly name the requested output until Google resolves it.
 if((!input.name||inputWebsite(input))&&!g.found){await json(join(directory,'providers.json'),providerData);throw Error(g.error||'Could not resolve restaurant name from Google place ID.');}
 const out=resolve(dependencies.outputDirectory||process.env.OUTPUT_DIR||'out');await mkdir(out,{recursive:true});
 const filename=`${safeName(target.name||input.name!.trim())}.json`,output_file=join(out,filename);
 const records=selected.map(k=>emptyListing(k,'Collection has not completed.'));
 const persist=()=>json(output_file,records);
 const accept=async(r:Listing)=>{
  if(!r.found&&!r.error)r.error=noPublicListing;
  if(r.error)r.error=conciseError(r.error);
  if(r.found){
   const missing=fieldsForPlatform(r.platform).filter(k=>!['platform','found','matched','fetched_at','error','hours','rating_raw'].includes(k)&&(r as any)[k]===null);
   if(r.hours===null)missing.push('hours');
   if(missing.length)r.error=`Unavailable public fields: ${missing.join(', ')}.`;
  }
  records[records.findIndex(v=>v.platform===r.platform)]=r;await persist();await onResult?.(r);
 };
 await persist();
 // Browser is temporarily disabled, regardless of the saved environment setting.
 // Apify SERP is used for URLs only; snippets never populate exported business fields.
 const links:Record<string,string[]>={};
 const platforms=selected.filter(k=>k!=='google_maps');
 const searchName=target.name.split(/[([]/)[0].trim()||target.name;
 if(selected.includes('google_maps'))await accept(signal?.aborted?emptyListing('google_maps','Cancelled.'):g);
 if(!g.matched){
  for(const platform of platforms)await accept(emptyListing(platform,'Collection skipped because Google could not confirm the target restaurant.'));
  await json(join(directory,'providers.json'),providerData);return {directory,records,name:target.name||label,address:target.address,website:target.website_url||null,google_record:g,output_file,filename};
 }
 if(platforms.length&&!signal?.aborted&&g.found)try{
   const queries=platforms.flatMap(k=>[
    `site:${domains[k][0]} "${searchName}" ${target.address}`,
    ...(k==='yelp'&&typeof target.phone==='string'&&target.phone.trim()?[`site:yelp.com/biz/ "${searchName}" "${target.phone}" ${target.address}`]:[]),
   ]).join('\n');
  const discovery=await apify('_discovery',{...target,queries,listing_url:''},signal);providerData.discovery=discovery;
  for(const page of discovery.items as any[])for(const entry of page.organicResults||[]){
   const url=entry.url||entry.link;
   if(typeof url!=='string')continue;
   for(const platform of platforms)if(matchesDomains(url,domains[platform])&&isListingCandidate(url,platform)){
    (links[platform]||=[]).push(url);
   }
  }
 }catch(e){providerData.discovery_error=e instanceof Error?e.message:'Apify link discovery failed.';}
 for(const platform of platforms){
  let r:Listing;
  try{
   signal?.throwIfAborted();
   const candidates=[...new Set(links[platform]||[])];
   if(platform==='yelp'){
    const {best,attempts}=await collectYelpCandidates(apify,{...target,name:searchName},candidates,target,signal);
    providerData[platform]=attempts.at(-1);providerData[`${platform}_attempts`]=attempts;r=best;
   }else{
   const contexts=candidates.length?candidates.slice(0,2):[''];
   let best=emptyListing(platform,'Apify search returned no matching branch.');
   const attempts:ApifyResult[]=[],failureReasons=new Set<string>();
   for(const listing of contexts){
    signal?.throwIfAborted();
    const raw=await apify(platform,{...target,name:searchName,listing_url:listing,search_url:`https://www.doordash.com/search/store/${encodeURIComponent(searchName)}/`},signal);
    attempts.push(raw);best=mapApify(platform,raw,target);
    if(best.found)break;
    if(best.error)failureReasons.add(best.error);
    if(!listing){
     const detailLinks=raw.items.map(v=>mapItem(platform,v)).filter(v=>nameMatches(v.name||'',target.name)&&v.url&&matchesDomains(v.url,domains[platform])&&isListingCandidate(v.url,platform)).map(v=>v.url!);
     contexts.push(...[...new Set(detailLinks)].filter(url=>!contexts.includes(url)).slice(0,2));
    }
   }
   if(!best.found&&failureReasons.size)best.error=preferredFailure(failureReasons,best.error||noPublicListing);
   providerData[platform]=attempts.at(-1);providerData[`${platform}_attempts`]=attempts;r=best;
   }
  }catch(e){r=emptyListing(platform,signal?.aborted?'Cancelled.':e instanceof Error?e.message:'Collection failed.');}
  await accept(r);await json(join(directory,'providers.json'),providerData);
 }
 await json(join(directory,'providers.json'),providerData);
 return {directory,records,name:target.name||label,address:target.address,website:target.website_url||null,google_record:g,output_file,filename};
}

// Expose only provider items that still match the already verified platform listing.
export async function readVerifiedMenuProviders(directory:string,records:Listing[]):Promise<Record<string,ApifyResult>> {
 const providers=JSON.parse(await readFile(join(directory,'providers.json'),'utf8'));
 const result:Record<string,ApifyResult>={};
 for(const record of records){
  if(!record.matched||!record.found||!record.name||!record.address)continue;
  const raw=providers[record.platform] as ApifyResult|undefined;if(!raw||!Array.isArray(raw.items))continue;
  const items=raw.items.filter(item=>mapApify(record.platform,{...raw,items:[item]},{name:record.name!,address:record.address,phone:record.phone}).matched);
  if(items.length)result[record.platform]={...raw,items};
 }
 return result;
}
