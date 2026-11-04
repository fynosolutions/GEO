import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {collectApify,type Listing} from '../public.js';
import {readDocument,type Document} from './extract.js';
import {freshness,channelsOutOfSync,extractDate} from './dates.js';
import {compareHours} from './hours.js';
export {extractDate,dateRange,freshness,channelsOutOfSync} from './dates.js';
export {compareHours,parseDay} from './hours.js';
export const channels=['official_html','official_file','google_menu','yelp_menu','delivery_menu','reservation_menu','social_menu'] as const;
export type MenuSource={channel:typeof channels[number];url:string;platform:string;menu_id?:string;identity_verified:boolean;upload_date?:string};
export type MenuAuditInput={store_id:string;name:string;address:string;website?:string|null;records:Listing[];sources?:MenuSource[]};
export async function collectMenuAudit(input:MenuAuditInput,options:{root?:string;signal?:AbortSignal;discover?:boolean;platforms?:string[];mode?:'links'|'full';read?:(url:string,signal?:AbortSignal)=>Promise<Document>}={}){
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.store_id))throw Error('Invalid store ID.');
 const mode=options.mode??'full',read=options.read??((url:string,signal?:AbortSignal)=>readDocument(url,signal,mode==='full')),run_id=randomUUID(),directory=join(options.root??'out/details',input.store_id,run_id);
 const fetched_at=new Date().toISOString();
 const candidates:MenuSource[]=[...(input.sources??[])];
 if(input.website&&!options.platforms)candidates.push({channel:'official_html',url:input.website,platform:'official',identity_verified:false});
 const group=(p:string):MenuSource['channel']|null=>p==='google_maps'?'google_menu':p==='yelp'?'yelp_menu':['doordash','uber_eats','grubhub'].includes(p)?'delivery_menu':p==='opentable'?'reservation_menu':p==='facebook'?'social_menu':null;
 for(const r of input.records){if(options.platforms&&!options.platforms.includes(r.platform))continue;const channel=group(r.platform);if(channel&&r.matched&&r.found&&r.url)candidates.push({channel,url:r.url,platform:r.platform,identity_verified:true});}
 const menus:any[]=[],prices:any[]=[],attempts:any[]=[],seen=new Set<string>();
 if(options.discover){
  const domains:Record<string,MenuSource['channel']>={'google.com':'google_menu','yelp.com':'yelp_menu','doordash.com':'delivery_menu','ubereats.com':'delivery_menu','grubhub.com':'delivery_menu','opentable.com':'reservation_menu','resy.com':'reservation_menu','facebook.com':'social_menu','instagram.com':'social_menu'};
  const platformForDomain:Record<string,string>={'google.com':'google_maps','yelp.com':'yelp','doordash.com':'doordash','ubereats.com':'uber_eats','grubhub.com':'grubhub','opentable.com':'opentable','resy.com':'resy','facebook.com':'facebook','instagram.com':'instagram'};
  for(const [domain,channel] of Object.entries(domains)){
   if(options.platforms&&!options.platforms.includes(platformForDomain[domain]))continue;
   const alias=input.records.find(r=>r.platform===platformForDomain[domain]&&r.matched&&r.name)?.name||input.name.split(/[([]/)[0].trim();
   const queries=`site:${domain} "${alias}" "${input.address.split(',')[0]}" menu`;
   const result=await collectApify('_discovery',{name:input.name,address:input.address,website_url:input.website??'',listing_url:'',queries},options.signal);
   const urls:string[]=[];
   for(const item of result.items as any[])for(const entry of item.organicResults??[])try{const u=new URL(entry.url||entry.link);if(u.hostname===domain||u.hostname.endsWith('.'+domain))urls.push(u.href);}catch{}
   candidates.push(...urls.slice(0,2).map(url=>({channel,url,platform:domain,identity_verified:false})));
   if(!urls.length)attempts.push({channel,url:null,platform:domain,status:['empty','unverified','success'].includes(result.status)?'not_found':'error',error:['empty','unverified','success'].includes(result.status)?null:`Menu discovery ${result.status}: ${result.note}`,provider_status:result.status,fetched_at:result.collected_at});
  }
 }

 const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 // The source queue is bounded; only same-site menu links inherit confirmed identity.
 for(let index=0;index<candidates.length&&index<30;index++){
  options.signal?.throwIfAborted();const source=candidates[index];if(options.platforms&&!options.platforms.includes(source.platform)&&!options.platforms.some(p=>source.platform===({google_maps:'google.com',yelp:'yelp.com',doordash:'doordash.com',uber_eats:'ubereats.com',grubhub:'grubhub.com',opentable:'opentable.com',facebook:'facebook.com'} as Record<string,string>)[p]))continue;if(!channels.includes(source.channel))throw Error('Invalid source channel.');
  const key=source.channel+'|'+source.url;if(seen.has(key))continue;seen.add(key);
  try{
   const doc=await read(source.url,options.signal);
   if(doc.date.date_source==='unknown'&&!doc.date.date_text&&source.upload_date)doc.date=extractDate(doc.text,null,source.upload_date);
   const sameHost=new URL(doc.url).hostname===new URL(source.url).hostname;
   const linkedYelp=input.records.some(r=>{
    if(r.platform!=='yelp'||!r.matched||!r.url)return false;
    try{const known=new URL(r.url),candidate=new URL(doc.url);return /(^|\.)yelp\.com$/i.test(known.hostname)&&/(^|\.)yelp\.com$/i.test(candidate.hostname)&&known.pathname.startsWith('/biz/')&&candidate.pathname.startsWith('/menu/')&&known.pathname.slice(5).replace(/\/$/,'')===candidate.pathname.slice(6).replace(/\/$/,'');}catch{return false;}
   });
   const verified=(source.identity_verified&&sameHost)||linkedYelp||(normalized(doc.text).includes(normalized(input.name))&&normalized(doc.text).includes(normalized(input.address)));
   if(!verified){attempts.push({...source,status:'unverified',fetched_at:doc.fetched_at,error:'Menu source branch identity could not be confirmed.'});continue;}
   const menuLike=doc.format!=='html'||doc.menuEvidence===true||(/menu|dinner|lunch|brunch/i.test(new URL(doc.url).pathname)&&/menu|appetizer|entree|dessert|菜单/i.test(doc.text));
   attempts.push({...source,url:doc.url,status:menuLike?'found':'not_found',fetched_at:doc.fetched_at,error:null});
   if(menuLike){
    const menu_id=source.menu_id??`${source.platform}:${new URL(doc.url).pathname}`;
    menus.push({channel:source.channel,url:doc.url,format:doc.format,menu_date:doc.date.menu_date,date_source:doc.date.date_source,fetched_at:doc.fetched_at,menu_id,platform:source.platform,date_text:doc.date.date_text,...freshness(doc.date.menu_date,doc.fetched_at),sha256:doc.sha256,extraction:doc.extraction});
    if(mode==='full')prices.push(...doc.prices.map(p=>({...p,channel:source.channel,menu_id,url:doc.url,fetched_at:doc.fetched_at})));
   }
   for(const url of doc.links.slice(0,10)){
    const same=new URL(url).hostname===new URL(doc.url).hostname;
    if(!same)continue;
    candidates.push({channel:source.platform==='official'&&/\.(pdf|png|jpe?g|webp)(?:\?|$)/i.test(url)?'official_file':source.channel,platform:source.platform,url,identity_verified:same,menu_id:undefined});
   }
  }catch(e){attempts.push({...source,status:'error',error:e instanceof Error?e.message:'Menu collection failed.',fetched_at:new Date().toISOString()});}
 }
 for(const candidate of candidates)if(!seen.has(candidate.channel+'|'+candidate.url))attempts.push({...candidate,status:'not_checked',fetched_at,error:'Per-run document limit reached.'});
 if(attempts.some(a=>a.channel==='official_html'&&['found','not_found'].includes(a.status))&&!candidates.some(c=>c.channel==='official_file'))attempts.push({channel:'official_file',url:input.website,status:'not_found',error:null,fetched_at});
 const coverage=channels.map(channel=>{
  const entries=attempts.filter(a=>a.channel===channel),found=entries.some(a=>a.status==='found');
  return {channel,found,status:found?'found':entries.some(a=>a.status==='error'||a.status==='unverified'||a.status==='not_checked')?'incomplete':entries.length?'not_found':'not_checked',attempts:entries,fetched_at};
 });
 const hours=compareHours(input.records);
 // Only exact same menu identifiers can establish comparability across channels without guessing.
 const sync=channelsOutOfSync(menus);
 const summary={store_id:input.store_id,name:input.name,address:input.address,run_id,fetched_at,mode,selected_platforms:options.platforms??null,unsupported_platforms:(options.platforms??[]).filter(p=>!group(p)),coverage_complete:coverage.filter(c=>!options.platforms||options.platforms.some(p=>group(p)===c.channel)).every(c=>c.status==='found'||c.status==='not_found')&&!(options.platforms??[]).some(p=>!group(p)),channels_out_of_sync:sync,notes:['Price extraction requires source verification; OCR is not a claim of human validation.','Cross-channel date differences describe source dates, not price validity or identical menu contents.']};
 await mkdir(directory,{recursive:true});
 for(const [name,value] of Object.entries({channels:coverage,menus,prices,hours,summary})){const path=join(directory,name+'.json'),tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,path);}
 return {directory,menus,prices,hours,coverage,summary};
}
