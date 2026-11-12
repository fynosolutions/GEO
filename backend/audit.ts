import './config.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {configuredMenuSources} from './weekly/public.js';
import {collectMenuAudit} from './menu-audit/public.js';
import { collectRestaurant, readVerifiedMenuProviders, selectedPlatforms, type Listing, type CollectionInput, domains, fieldGroups } from './collection.js';
import {collectBatch,parseStoreList,type BatchInput,type BatchProgress,type BatchStore} from './batch.js';
import {conciseError} from './errors.js';
import {collectIntroductions, type IntroductionProgress} from './introduction.js';
export const outputFields=[...new Set(Object.values(fieldGroups).flat())];
export const platforms=Object.fromEntries(Object.entries(domains).map(([key,value])=>[key,[key,value]]));
export type Job={id:string;created_at:string;status:string;input:CollectionInput&{stores?:BatchStore[]};batch?:BatchProgress;introduction?:IntroductionProgress;records:Listing[];output_file?:string;filename?:string;merchant:{name:string;address:string}|null;error:string|null;menu_mode?:'links'|'full';menu_scope?:'selected'|'all_channels';menu_status?:string;menu_result?:Awaited<ReturnType<typeof collectMenuAudit>>;menu_error?:string};
const root=resolve(process.env.AUDIT_DATA_DIR||'.local/audits');
const controls=new Map<string,{controller:AbortController;job:Job}>();
const writes=new Map<string,Promise<void>>();
export async function saveJob(job:Job){
 const path=join(root,job.id);const snapshot=JSON.stringify(job,null,2);
 const task=(writes.get(job.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(path,{recursive:true});const temp=join(path,`${randomUUID()}.tmp`);await writeFile(temp,snapshot);await rename(temp,join(path,'job.json'));});
 writes.set(job.id,task);try{await task;}finally{if(writes.get(job.id)===task)writes.delete(job.id);}
}
export async function getJob(id:string):Promise<Job>{
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid audit ID');
 if(controls.has(id))return controls.get(id)!.job;
 const job:Job=JSON.parse(await readFile(join(root,id,'job.json'),'utf8'));
 if(['running','cancelling'].includes(job.status)){job.status='interrupted';job.error='Server restarted during collection.';await saveJob(job);}return job;
}
export const isBusy=()=>controls.size>0;
export async function cancelJob(id:string){const control=controls.get(id);if(!control)return getJob(id);control.job.status='cancelling';control.controller.abort();await saveJob(control.job);return control.job;}
export async function startIntroductionJob(stores: BatchStore[], platforms: Parameters<typeof collectIntroductions>[2], batch: boolean): Promise<Job> {
 const introduction: IntroductionProgress = { stores: [] };
 const job: Job = {
  id: randomUUID(), created_at: new Date().toISOString(), status: 'running',
  input: { stores, platforms }, records: [], merchant: null, error: null, introduction,
 };
 const controller = new AbortController();
 controls.set(job.id, { controller, job });
 try { await saveJob(job); } catch (error) { controls.delete(job.id); throw error; }
 void (async () => {
  try {
   await collectIntroductions(job.id, stores, platforms, introduction, controller.signal, () => saveJob(job), { batch });
   const results = introduction.stores;
   job.status = controller.signal.aborted ? 'cancelled' : results.every(store => store.status === 'failed') ? 'failed' : results.every(store => store.status === 'completed') ? 'completed' : 'partial';
  } catch (error) {
   job.status = controller.signal.aborted ? 'cancelled' : 'failed';
   job.error = conciseError(error);
  } finally {
   try { await saveJob(job); } finally { controls.delete(job.id); }
  }
 })().catch(() => console.error('Could not persist introduction audit.'));
 return job;
}
export async function startBatchJob(input:BatchInput):Promise<Job>{
 const validated={stores:parseStoreList(input.stores),platforms:selectedPlatforms(input.platforms)};
 const job:Job={id:randomUUID(),input:validated,records:[],created_at:new Date().toISOString(),status:'running',merchant:null,error:null};
 const controller=new AbortController();controls.set(job.id,{controller,job});
 try{await saveJob(job);}catch(e){controls.delete(job.id);throw e;}
 void(async()=>{
  try{
   job.batch=await collectBatch(validated,controller.signal,async progress=>{job.batch=progress;await saveJob(job);});
   job.status=controller.signal.aborted?'cancelled':job.batch.stores.every(s=>s.status==='failed')?'failed':job.batch.stores.some(s=>s.status!=='completed')?'partial':'completed';
  }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=conciseError(e);}
  finally{try{await saveJob(job);}finally{controls.delete(job.id);}}
 })().catch(()=>console.error('Could not persist batch audit.'));
 return job;
}
export async function startJob(input:CollectionInput,menuMode?:'links'|'full',menuScope:'selected'|'all_channels'='selected'):Promise<Job>{
 const job:Job={id:randomUUID(),input,records:[],created_at:new Date().toISOString(),status:'running',merchant:null,error:null,...(menuMode?{menu_mode:menuMode,menu_scope:menuScope,menu_status:'pending'}:{})};
 const controller=new AbortController();controls.set(job.id,{controller,job});
 try{await saveJob(job);}catch(e){controls.delete(job.id);throw e;}
 void (async()=>{try{
  const result=await collectRestaurant(job.input,controller.signal,async r=>{job.records.push(r);await saveJob(job);});
  job.output_file=result.output_file;job.filename=result.filename;job.merchant={name:result.name,address:result.address};job.status=controller.signal.aborted?'cancelled':result.records.some(r=>r.error)?'partial':'completed';
  const basicFailed=!result.records.some(r=>r.found)&&result.records.some(r=>r.error);
  if(basicFailed&&!controller.signal.aborted){job.status='failed';job.error=result.records.find(r=>r.error?.startsWith('Apify HTTP'))?.error||result.records.find(r=>r.error)?.error||'Basic collection failed.';if(menuMode)job.menu_status='not_started';}
  if(menuMode&&!controller.signal.aborted&&!basicFailed){
   job.status='running';job.menu_status='running';await saveJob(job);
   try{
    job.menu_result=await collectMenuAudit({store_id:job.id,name:result.name,address:result.address,website:result.website,website_verified:!!result.website,sources:await configuredMenuSources(result.google_record),records:menuScope==='all_channels'&&!result.records.some(r=>r.platform==='google_maps')?[result.google_record,...result.records]:result.records,provider_results:await readVerifiedMenuProviders(result.directory,result.records)},{signal:controller.signal,discover:true,platforms:menuScope==='all_channels'?undefined:input.platforms,mode:menuMode});
    job.menu_status=controller.signal.aborted?'cancelled':job.menu_result.summary.coverage_complete?'completed':'partial';
   }catch{job.menu_status=controller.signal.aborted?'cancelled':'failed';job.menu_error='Menu collection could not complete; basic listing data was retained.';}
   job.status=controller.signal.aborted?'cancelled':job.menu_status==='completed'&&!result.records.some(r=>r.error)?'completed':'partial';
  }
 }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=conciseError(e);}
 finally{try{await saveJob(job);}finally{controls.delete(job.id);}}})().catch(()=>console.error('Could not persist audit.'));
 return job;
}
