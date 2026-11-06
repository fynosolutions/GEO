import {validMenuCandidate,canonicalPlatform,summarizePlatforms,menuUrlKey,orderingProvider,yelpMenuUrl} from './sources.js';
import {structuredMenu} from './providers.js';
import type {ApifyResult} from '../apify.js';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {collectApify,matchesIdentity,type Listing} from '../public.js';
import {readDocument,type Document} from './extract.js';
import {freshness,channelsOutOfSync,extractDate} from './dates.js';
import {compareHours} from './hours.js';
export {extractDate,dateRange,freshness,channelsOutOfSync} from './dates.js';
export {compareHours,parseDay} from './hours.js';
export const channels=['official_html','official_file','google_menu','yelp_menu','delivery_menu','reservation_menu','social_menu'] as const;
export type MenuSource={channel:typeof channels[number];url:string;platform:string;menu_id?:string;identity_verified:boolean;upload_date?:string;menu_media?:boolean;discovered_from?:string};
export type MenuAuditInput={store_id:string;name:string;address:string;website?:string|null;website_verified?:boolean;websites?:Array<{url:string;verified:boolean}>;records:Listing[];sources?:MenuSource[];provider_results?:Record<string,ApifyResult>};
export async function collectMenuAudit(input:MenuAuditInput,options:{root?:string;signal?:AbortSignal;discover?:boolean;platforms?:string[];mode?:'links'|'full';onProgress?:(message:string)=>void;runProvider?:typeof collectApify;read?:(url:string,signal?:AbortSignal)=>Promise<Document>}={}){
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.store_id))throw Error('Invalid store ID.');
 const mode=options.mode??'full',read=options.read??((url:string,signal?:AbortSignal)=>readDocument(url,signal,mode==='full')),run_id=randomUUID(),directory=join(options.root??'out/details',input.store_id,run_id);
 const fetched_at=new Date().toISOString();
 const candidates:MenuSource[]=[...(input.sources??[])];
 if(!options.platforms||options.platforms.includes('official')){
  const sites=[...(input.websites??[]),...(input.website?[{url:input.website,verified:input.website_verified===true}]:[])];
  for(const site of sites)if(!candidates.some(c=>c.platform==='official'&&menuUrlKey(c.url)===menuUrlKey(site.url)))candidates.push({channel:'official_html',url:site.url,platform:'official',identity_verified:site.verified});
 }
 const group=(p:string):MenuSource['channel']|null=>p==='google_maps'?'google_menu':p==='yelp'?'yelp_menu':['doordash','uber_eats','grubhub'].includes(p)?'delivery_menu':['opentable','resy'].includes(p)?'reservation_menu':['facebook','instagram'].includes(p)?'social_menu':null;
 for(const r of input.records){if(options.platforms&&!options.platforms.includes(r.platform))continue;const channel=group(r.platform);if(channel&&r.matched&&r.found&&r.url)candidates.push({channel,url:r.url,platform:r.platform,identity_verified:true});}
 for(const source of [...candidates]){const menu=canonicalPlatform(source.platform)==='yelp'?yelpMenuUrl(source.url):null;if(menu)candidates.unshift({...source,url:menu,discovered_from:source.url});}
 const menus:any[]=[],prices:any[]=[],attempts:any[]=[],seen=new Set<string>(),officialHours:Listing[]=[];
 const providerConfirmed=new Set<string>();
 const runProvider=options.runProvider??collectApify;
 for(const record of input.records){
  if(!['uber_eats','doordash','grubhub'].includes(record.platform)||!record.matched||!record.found||!record.url||options.platforms&&!options.platforms.includes(record.platform))continue;
  let evidence=input.provider_results?.[record.platform];
  let parsed=evidence?structuredMenu(record.platform,evidence,record,mode==='full'):null;
  if(!parsed&&process.env.APIFY_MENU_ACTORS_ENABLED==='true'){
   evidence=await runProvider('_menu_'+record.platform,{name:input.name,address:input.address,website_url:input.website??'',listing_url:record.url},options.signal);
   parsed=structuredMenu(record.platform,evidence,record,mode==='full');
   if(!parsed)attempts.push({channel:'delivery_menu',platform:record.platform,url:record.url,status:'error',error:`Menu Actor ${evidence.status}; no verified structured menu returned. ${evidence.note}`,fetched_at:evidence.collected_at,actor:evidence.actor,actor_run_id:evidence.run_id});
  }
  if(parsed){providerConfirmed.add(record.platform);menus.push(parsed.menu);prices.push(...parsed.prices.map(p=>({...p,channel:parsed.menu.channel,menu_id:parsed.menu.menu_id,url:record.url,fetched_at:parsed.menu.fetched_at})));attempts.push({channel:'delivery_menu',platform:record.platform,url:record.url,status:'found',error:null,fetched_at:parsed.menu.fetched_at,actor:parsed.menu.actor,actor_run_id:parsed.menu.actor_run_id});}
 }
 if(options.discover){
  if(!options.platforms&&!input.website&&!input.websites?.length){
   const discovery=await runProvider('_discovery',{name:input.name,address:input.address,website_url:'',listing_url:'',queries:`"${input.name}" "${input.address.split(',')[0]}" official restaurant menu`},options.signal);
   const urls:string[]=[];
   for(const item of discovery.items as any[])for(const entry of item.organicResults??[])try{const u=new URL(entry.url||entry.link);if(['http:','https:'].includes(u.protocol)&&!/(google|yelp|tripadvisor|opentable|resy|doordash|ubereats|grubhub|facebook|instagram)\.com$/i.test(u.hostname))urls.push(u.href);}catch{}
   candidates.push(...urls.slice(0,2).map(url=>({channel:'official_html' as const,url,platform:'official',identity_verified:false})));
   if(!urls.length)for(const channel of ['official_html','official_file'] as const)attempts.push({channel,platform:'official',url:null,status:['success','empty','unverified'].includes(discovery.status)?'unverified':'error',error:discovery.status==='error'?discovery.note:'Official website discovery returned no verified menu source.',fetched_at});
  }
  const domains:Record<string,MenuSource['channel']>={'google.com':'google_menu','yelp.com':'yelp_menu','doordash.com':'delivery_menu','ubereats.com':'delivery_menu','grubhub.com':'delivery_menu','opentable.com':'reservation_menu','resy.com':'reservation_menu','facebook.com':'social_menu','instagram.com':'social_menu'};
  const platformForDomain:Record<string,string>={'google.com':'google_maps','yelp.com':'yelp','doordash.com':'doordash','ubereats.com':'uber_eats','grubhub.com':'grubhub','opentable.com':'opentable','resy.com':'resy','facebook.com':'facebook','instagram.com':'instagram'};
  for(const [domain,channel] of Object.entries(domains)){
   if(providerConfirmed.has(platformForDomain[domain])||options.platforms&&!options.platforms.includes(platformForDomain[domain]))continue;
   const alias=input.records.find(r=>r.platform===platformForDomain[domain]&&r.matched&&r.name)?.name||input.name.split(/[([]/)[0].trim();
   options.onProgress?.(`Menu discovery: ${domain}`);
   const queries=`site:${domain} "${alias}" "${input.address.split(',')[0]}" menu`;
   const result=await runProvider('_discovery',{name:input.name,address:input.address,website_url:input.website??'',listing_url:'',queries},options.signal);
   const urls:string[]=[];
   for(const item of result.items as any[])for(const entry of item.organicResults??[])try{const u=new URL(entry.url||entry.link);if((u.hostname===domain||u.hostname.endsWith('.'+domain))&&validMenuCandidate(u.href,platformForDomain[domain]))urls.push(u.href);}catch{}
   for(const url of urls.slice(0,2)){const menu=domain==='yelp.com'?yelpMenuUrl(url):null;if(menu)candidates.push({channel,url:menu,platform:domain,identity_verified:false,discovered_from:url});candidates.push({channel,url,platform:domain,identity_verified:false});}
   if(!urls.length)attempts.push({channel,url:null,platform:domain,status:['empty','unverified','success'].includes(result.status)?'unverified':'error',error:['empty','unverified','success'].includes(result.status)?'No eligible menu URL discovered; platform-wide absence is unverified.':`Menu discovery ${result.status}: ${result.note}`,provider_status:result.status,fetched_at:result.collected_at});
  }
 }

 const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 // The source queue is bounded; only same-site menu links inherit confirmed identity.
 let documentsRead=0;const completed=new Set<string>(),documents=new Map<string,Promise<Document>>();
 for(let index=0;index<candidates.length;index++){
  options.signal?.throwIfAborted();const source=candidates[index];if(!validMenuCandidate(source.url,canonicalPlatform(source.platform))&&!(source.menu_media&&source.identity_verified)){attempts.push({...source,status:'not_checked',fetched_at:new Date().toISOString(),error:'Candidate is not an eligible restaurant menu source.'});seen.add(source.channel+'|'+menuUrlKey(source.url));continue;}if(providerConfirmed.has(source.platform))continue;if(options.platforms&&!options.platforms.includes(canonicalPlatform(source.platform)))continue;if(!channels.includes(source.channel))throw Error('Invalid source channel.');
  const key=source.channel+'|'+menuUrlKey(source.url);if(seen.has(key))continue;if(documentsRead>=30)break;seen.add(key);documentsRead++;
  try{
   options.onProgress?.(`Menu resource: ${source.platform} / ${source.channel}`);
   const documentKey=menuUrlKey(source.url);let reading=documents.get(documentKey);if(!reading){reading=read(documentKey,options.signal);documents.set(documentKey,reading);}
   const doc=structuredClone(await reading);
   const resultKey=source.channel+'|'+menuUrlKey(doc.url);if(completed.has(resultKey))continue;
   if(source.menu_media&&doc.format==='html')throw Error('Menu media reference returned HTML instead of an image or PDF.');
   if(doc.date.date_source==='unknown'&&!doc.date.date_text&&source.upload_date)doc.date=extractDate(doc.text,null,source.upload_date);
   const sameHost=new URL(doc.url).hostname===new URL(source.url).hostname;
   const linkedYelp=input.records.some(r=>{
    if(r.platform!=='yelp'||!r.matched||!r.url)return false;
    try{const known=new URL(r.url),candidate=new URL(doc.url);return /(^|\.)yelp\.com$/i.test(known.hostname)&&/(^|\.)yelp\.com$/i.test(candidate.hostname)&&known.pathname.startsWith('/biz/')&&/^\/(menu|biz_photos)\//.test(candidate.pathname)&&known.pathname.slice(5).replace(/\/$/,'')===candidate.pathname.replace(/^\/(menu|biz_photos)\//,'').replace(/\/$/,'');}catch{return false;}
   });
   const matchedIdentity=(doc.identities??[]).find(identity=>matchesIdentity({...input.records[0],name:identity.name,address:identity.address,phone:identity.phone},{name:input.name,address:input.address}));
   const verified=(source.identity_verified&&sameHost)||linkedYelp||!!matchedIdentity||(normalized(doc.text).includes(normalized(input.name))&&normalized(doc.text).includes(normalized(input.address)));
   if(source.platform==='official'&&(doc.identities?.length??0)>0&&!matchedIdentity){attempts.push({...source,status:'unverified',fetched_at:doc.fetched_at,error:'Official structured identities do not match this branch.'});continue;}
   const targetStreet=normalized(input.address.split(',')[0].replace(/\bstreet\b/gi,'st'));
   const targetPhone=input.records.find(r=>r.platform==='google_maps'&&r.matched)?.phone;
   const digits=doc.text.replace(/\D/g,'');
   const phoneMatched=typeof targetPhone==='string'&&targetPhone.replace(/\D/g,'').length>=10&&digits.includes(targetPhone.replace(/\D/g,'').slice(-10));
   const orderingIdentity=!!orderingProvider(doc.url)&&normalized(doc.text.replace(/\bstreet\b/gi,'st')).includes(targetStreet)&&phoneMatched;
   if(!verified&&!orderingIdentity){attempts.push({...source,status:'unverified',fetched_at:doc.fetched_at,error:'Menu source branch identity could not be confirmed.'});continue;}
   completed.add(resultKey); // Unverified redirects must not suppress a later verified source.
   if(source.platform==='official'&&(matchedIdentity?.hours||doc.hours)&&!officialHours.length){const baseline=input.records.find(r=>r.platform==='google_maps');if(baseline)officialHours.push({...baseline,platform:'official',found:true,matched:true,url:doc.url,hours:matchedIdentity?.hours||doc.hours,fetched_at:doc.fetched_at,error:null});}
   for(const media of doc.menuMedia??[])candidates.push({channel:source.platform==='official'?'official_file':source.channel,url:media.url,platform:source.platform,identity_verified:true,menu_media:true,upload_date:media.upload_date??undefined});
   const menuLike=doc.format!=='html'||doc.menuEvidence===true||(doc.menuEvidence===undefined&&/\bmenu\b/i.test(new URL(doc.url).pathname)&&/menu|appetizer|entree|dessert|菜单/i.test(doc.text));
   attempts.push({...source,url:doc.url,status:menuLike?'found':'unverified',fetched_at:doc.fetched_at,error:menuLike?null:'No menu extracted from this resource; dynamic content or other menu sources may exist.'});
   if(menuLike){
    const menuIdentity=new URL(menuUrlKey(doc.url));
    const menu_id=source.menu_id??`${source.platform}:${menuIdentity.pathname}${orderingProvider(doc.url)?menuIdentity.search+menuIdentity.hash:''}`;
    menus.push({channel:source.channel,url:doc.url,...(source.discovered_from?{discovered_from:source.discovered_from}:{}),format:doc.format,menu_date:doc.date.menu_date,date_source:doc.date.date_source,fetched_at:doc.fetched_at,menu_id,platform:source.platform,date_text:doc.date.date_text,...freshness(doc.date.menu_date,doc.fetched_at),sha256:doc.sha256,extraction:doc.extraction,item_count:mode==='full'?doc.prices.length:null,items_collected:mode==='full',items:mode==='full'?doc.prices.map(p=>({name:p.name,category:p.category??null,variant:p.variant,price:p.price,currency:p.currency,url:doc.url,fetched_at:doc.fetched_at})):[]});
    if(mode==='full')prices.push(...doc.prices.map(p=>({...p,channel:source.channel,menu_id,url:doc.url,fetched_at:doc.fetched_at})));
   }
   for(const url of [...new Map(doc.links.filter(url=>menuUrlKey(url)!==menuUrlKey(doc.url)).map(url=>[menuUrlKey(url),url])).values()].slice(0,10)){
    const same=new URL(url).hostname===new URL(doc.url).hostname;
    const externalOrdering=source.platform==='official'&&!!orderingProvider(url);
    if((!same&&!externalOrdering)||!validMenuCandidate(url,canonicalPlatform(source.platform)))continue;
    candidates.push({channel:source.platform==='official'&&/\.(pdf|png|jpe?g|webp)(?:\?|$)/i.test(url)?'official_file':source.channel,platform:source.platform,url,identity_verified:same,discovered_from:doc.url,menu_id:undefined});
   }
  }catch(e){attempts.push({...source,status:'error',error:e instanceof Error?e.message:'Menu collection failed.',fetched_at:new Date().toISOString()});}
 }
 const pending=new Set<string>();
 for(const candidate of candidates){const key=candidate.channel+'|'+menuUrlKey(candidate.url);if(!providerConfirmed.has(candidate.platform)&&!seen.has(key)&&!pending.has(key)){pending.add(key);attempts.push({...candidate,status:'not_checked',fetched_at,error:'Per-run document limit reached.'});}}
 if(attempts.some(a=>a.channel==='official_html'&&['found','not_found','unverified'].includes(a.status))&&!candidates.some(c=>c.channel==='official_file'))attempts.push({channel:'official_file',platform:'official',url:input.website??input.websites?.[0]?.url??null,status:'unverified',error:'No menu file link discovered; absence is unverified.',fetched_at});
 const coverage=channels.map(channel=>{
  const entries=attempts.filter(a=>a.channel===channel),found=entries.some(a=>a.status==='found');
  const incomplete=entries.some(a=>['error','unverified','not_checked'].includes(a.status));
  return {channel,found,status:incomplete?'incomplete':found?'found':entries.length?'not_found':'not_checked',attempts:entries,fetched_at};
 });
 const hours=compareHours([...input.records,...officialHours]);
 // Only exact same menu identifiers can establish comparability across channels without guessing.
 const sync=channelsOutOfSync(menus);
 const perPlatform=summarizePlatforms(options.platforms??[...new Set(attempts.map(a=>canonicalPlatform(a.platform)))],attempts,menus,p=>Boolean(group(p))||p==='official');
 const scopeComplete=options.platforms?perPlatform.every(p=>p.status==='found'||p.status==='not_found'):coverage.every(c=>c.status==='found'||c.status==='not_found');
 const summary={platform_results:perPlatform,store_id:input.store_id,name:input.name,address:input.address,run_id,fetched_at,mode,selected_platforms:options.platforms??[...new Set(['official',...input.records.map(r=>r.platform),'resy','instagram'])],unsupported_platforms:(options.platforms??input.records.map(r=>r.platform)).filter(p=>p!=='official'&&!group(p)),coverage_complete:scopeComplete,channels_out_of_sync:sync,notes:['Price extraction requires source verification; OCR is not a claim of human validation.','Cross-channel date differences describe source dates, not price validity or identical menu contents.']};
 await mkdir(directory,{recursive:true});
 for(const [name,value] of Object.entries({channels:coverage,menus,prices,hours,summary})){const path=join(directory,name+'.json'),tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,path);}
 return {directory,menus,prices,hours,coverage,summary};
}
