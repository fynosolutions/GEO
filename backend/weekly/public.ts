import {menuObservations,menuChanges,type MenuObservation} from './menus.js';
export {menuObservations,menuChanges} from './menus.js';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Listing, CollectionInput } from '../public.js';

export const platforms = ['google_maps','yelp','tripadvisor','opentable','doordash','uber_eats','grubhub','facebook'];
const fields = ['platform','found','url','name','address','phone','hours','rating','review_count','price_level','fetched_at','error'];
export type Store = { id:string; name:string; address:string; place_id:string|null; website?:string|null };
export type SnapshotListing = Omit<Listing,'matched'> & {matched?:boolean};
export type Collector = (store:Store)=>Promise<Listing[]|{records:Listing[];menus?:MenuObservation[];menu_error?:string}>;
export function storesFrom(value:unknown):Store[] {
 if(!Array.isArray(value)||!value.length||value.length>20)throw Error('Configure 1–20 stores.');
 const ids=new Set<string>();
 return value.map(s=>{
  if(!s||typeof s.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id)||ids.has(s.id))throw Error('Store IDs must be unique safe lowercase slugs.');
  if(typeof s.name!=='string'||!s.name.trim()||typeof s.address!=='string'||!s.address.trim()||!(s.place_id===null||(typeof s.place_id==='string'&&s.place_id.trim())))throw Error('Each store needs name, address and place_id (string or null).');
  if(s.website!==undefined&&s.website!==null){
   if(typeof s.website!=='string'||!s.website.trim())throw Error('Website must be an HTTP(S) URL or null.');
   let url:URL;try{url=new URL(s.website);}catch{throw Error('Website must be an HTTP(S) URL or null.');}
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Website must be an HTTP(S) URL without credentials.');
  }
  ids.add(s.id);return {id:s.id,name:s.name,address:s.address,place_id:s.place_id,...(s.website!==undefined?{website:s.website}: {})};
 });
}
// Adapt website to the existing collector's website-in-name input contract.
export function collectionInputForStore(store:Store):CollectionInput {
 return store.place_id?{place_id:store.place_id,address:store.address}:{name:store.website?.trim()||store.name,address:store.address};
}
export function validateRecords(value:unknown,allowLegacy=false):SnapshotListing[] {
 if(!Array.isArray(value)||value.length!==8)throw Error('Snapshot must contain eight platforms.');
 for(const [i,r] of value.entries()) {
  const expected=allowLegacy&&!Object.hasOwn(r??{},'matched')?fields:[...fields,'matched'];
  if(!r||r.platform!==platforms[i]||Object.keys(r).sort().join()!==[...expected].sort().join()||('matched' in r&&(typeof r.matched!=='boolean'||r.found&&!r.matched))||typeof r.found!=='boolean'||!(r.error===null||typeof r.error==='string')||typeof r.fetched_at!=='string'||!Number.isFinite(Date.parse(r.fetched_at)))throw Error('Invalid snapshot contract.');
 }
 return value as SnapshotListing[];
}
export function businessDate(now:Date):string {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function previousWeek(date:string):string {
 const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-7);return d.toISOString().slice(0,10);
}
function canonical(v:unknown):string {
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(v);
}
const cell=(v:unknown)=> (typeof v==='string'?v:JSON.stringify(v)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\r\n]/g,' ');
const numeric=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^\d+(\.\d+)?$/.test(v.trim())?Number(v):null;
const failed=(r:SnapshotListing)=>!r.found&&r.error!==null;
export function compare(store:Store,current:SnapshotListing[],previous:SnapshotListing[]|null):{rows:string[];failures:string[]} {
 const rows:string[]=[],failures:string[]=[];
 const row=(p:string,f:string,a:unknown,b:unknown,n:string)=>rows.push(`| ${cell(store.name)} (${store.id}) | ${p} | ${f} | ${cell(a)} | ${cell(b)} | ${n} |`);
 for(const r of current){
  const old=previous?.find(v=>v.platform===r.platform);
  if(failed(r)){row(r.platform,'collection',old?.found??null,null,'本周未采到 / Not collected this week');if(old&&failed(old))failures.push(`${store.id} / ${r.platform}`);continue;}
  if(r.error)row(r.platform,'availability',null,r.error,'Partial listing');
  if(!old){row(r.platform,'baseline',null,r.found,'No previous-week observation');continue;}
  if(failed(old)){row(r.platform,'collection',null,r.found,'Previous week unavailable; no factual comparison');continue;}
  if(old.found!==r.found){row(r.platform,'found',old.found,r.found,'IMPORTANT: observed listing presence changed');continue;}
  if(!r.found)continue;
  for(const f of ['url','name','address','phone','hours','rating','review_count','price_level'] as const){
   if(canonical(old[f])===canonical(r[f]))continue;
   let note=['phone','address','hours'].includes(f)?'IMPORTANT: source value changed':'Source value changed';
   if(old[f]===null||r[f]===null)note='Availability changed; business change unverified';
   else if(f==='rating'||f==='review_count'){
    const a=numeric(old[f]),b=numeric(r[f]);
    note=a===null||b===null?'Percentage unavailable: incompatible or structured values':a===0?'Zero baseline; percentage undefined':Math.abs(b-a)/Math.abs(a)>0.100000000001?`IMPORTANT: >10% (${((b-a)/Math.abs(a)*100).toFixed(2)}%)`:'Change <=10%';
   }
   row(r.platform,f,old[f],r[f],note);
  }
 }
 return {rows,failures};
}
async function readOptional(path:string):Promise<any|null>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
async function atomic(path:string,value:unknown,text=false){await mkdir(join(path,'..'),{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,text?String(value):JSON.stringify(value,null,2)+'\n');await rename(tmp,path);}
export async function runWeekly(options:{stores:Store[];root:string;collect:Collector;now?:Date;runId?:string;mode?:'manual'|'scheduled';codeSha?:string;menus?:MenuObservation[]}) {
 const {stores,root,collect}=options;storesFrom(stores);
 let menus=options.menus===undefined?null:menuObservations(options.menus);
 if(menus?.some(m=>!stores.some(s=>s.id===m.store_id)))throw Error('Menu observation refers to an unconfigured store.');
 const now=options.now??new Date(),date=businessDate(now),prior=previousWeek(date),mode=options.mode??'manual';
 if(mode==='scheduled'&&new Date(date+'T12:00:00Z').getUTCDay()!==1)throw Error('Scheduled publication requires a New York Monday; use manual mode for recovery.');
 const runId=options.runId??randomUUID();if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Invalid run ID.');
 const base=mode==='manual'?join(root,'manual'):root;
 await mkdir(base,{recursive:true});
 const lock=join(base,'.weekly-lock');await mkdir(lock); // Atomic local exclusion; workflow concurrency also serializes cloud runs.
 try{
  await mkdir(join(base,'runs'),{recursive:true});
  const runDir=join(base,'runs',runId);await mkdir(runDir); // Never reuse an attempt.
  const existing=await readOptional(join(base,'weeks',date+'.json'));
  const previous=await readOptional(join(base,'weeks',prior+'.json'));
  for(const [m,d] of [[existing,date],[previous,prior]] as const){
   if(m&&(m.date!==d||m.mode!==mode||!Array.isArray(m.stores)))throw Error('Invalid weekly history manifest.');
  }
  const baselines=new Map<string,SnapshotListing[]|null>();
  // Validate all existing baselines before spending on external collection.
  for(const s of stores){
   const entry=previous?.stores?.find((v:any)=>v.id===s.id);
   if(entry&&(entry.address!==s.address||entry.place_id!==s.place_id))throw Error(`Store ${s.id} identity changed; allocate a new stable ID.`);
   const data=entry?await readOptional(join(base,'snapshots',s.id,prior+'.json')):null;
   if(entry&&!data)throw Error('History manifest refers to a missing snapshot.');
   baselines.set(s.id,data?validateRecords(data,true):null);
  }
  const oldMenus=previous?.menu_comparison==='provided'?menuObservations(await readOptional(join(base,'menus',prior+'.json'))):[];
  const rows:string[]=[],failures:string[]=[],outcomes:any[]=[];
  const snapshots=new Map<string,SnapshotListing[]>();
  for(const s of stores){
   let records:SnapshotListing[];let menu_error:string|null=null;
   try{
    const collected=await collect(s);
    records=validateRecords(Array.isArray(collected)?collected:collected.records);
    if(!Array.isArray(collected))menu_error=collected.menu_error??null;
    if(!Array.isArray(collected)&&collected.menus){
     try{
     const incoming=menuObservations(collected.menus);if(incoming.some(m=>m.store_id!==s.id))throw Error('Menu store identity mismatch.');
     menus=[...(menus??[]),...incoming];
     }catch{menu_error='Invalid menu observations; basic collection retained.';}
    }
   }catch{
    // Do not export raw exceptions: provider errors can contain credential-bearing request URLs.
    records=platforms.map(platform=>({platform,found:false,matched:false,url:null,name:null,address:null,phone:null,hours:null,rating:null,review_count:null,price_level:null,fetched_at:new Date().toISOString(),error:'Store collection failed or timed out; no verified observation available.'}));
   }
   const secret=process.env.APIFY_TOKEN;if(secret)records=JSON.parse(JSON.stringify(records).split(secret).join('[REDACTED]'));
   snapshots.set(s.id,records);await atomic(join(runDir,'snapshots',s.id+'.json'),records);
   const diff=compare(s,records,baselines.get(s.id)??null);rows.push(...diff.rows);failures.push(...diff.failures);
   outcomes.push({...s,menu_error,status:records.every(failed)?'failed':records.some(r=>failed(r)||r.error)?'partial':'completed'});
  }
  if(menus)for(const change of menuChanges(menus,oldMenus)){
   rows.push(`| ${cell(change.store_id)} | ${cell(change.channel)} | menu_date | ${cell(change.old_date)} | ${cell(change.menu_date)} | ${change.note}; previous source: ${cell(change.old_url)}; source: ${cell(change.source_url)}; provenance: ${change.date_source} |`);
  }
  const report=`# Weekly restaurant changes — ${date}\n\nMode: ${mode}. Previous calendar week: ${prior}.\nMenu-date comparison: ${menus?'provided sidecar; absent observations remain unknown':'unavailable pending issue #4 adapter'}.\n\n| Store | Platform | Field | Old | New | Note |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')||'No comparable field changes.'}\n\n## Consecutive weekly failures\n${failures.length?failures.map(v=>'- '+v).join('\n'):'None observed in adjacent weeks.'}\n`;
  const manifest={run_id:runId,date,previous_week:prior,mode,started_at:now.toISOString(),finished_at:new Date().toISOString(),code_sha:options.codeSha??null,config_hash:createHash('sha256').update(JSON.stringify(stores)).digest('hex'),stores:outcomes,menu_comparison:menus?'provided':'pending_issue_4',canonical:!existing};
  if(menus)await atomic(join(runDir,'menus.json'),menus);
  await atomic(join(runDir,'diff.md'),report,true);await atomic(join(runDir,'manifest.json'),manifest);
  if(!existing){
   if(menus)await atomic(join(base,'menus',date+'.json'),menus);
   for(const [id,data] of snapshots)await atomic(join(base,'snapshots',id,date+'.json'),data);
   await atomic(join(base,'diffs',date+'.md'),report,true);
   await atomic(join(base,'weeks',date+'.json'),manifest); // Completion marker written last.
  }
  return {runDir,manifest,report};
 }finally{const {rm}=await import('node:fs/promises');await rm(lock,{recursive:true,force:true});}
}
