import './config.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { collectRestaurant, type Listing, type CollectionInput, domains } from './collection.js';
export const outputFields=['platform','found','url','name','address','phone','hours','rating','review_count','price_level','fetched_at','error'];
export const platforms=Object.fromEntries(Object.entries(domains).map(([key,value])=>[key,[key,value]]));
export type Job={id:string;created_at:string;status:string;input:CollectionInput;records:Listing[];output_file?:string;filename?:string;merchant:{name:string;address:string}|null;error:string|null};
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
export async function startJob(input:CollectionInput):Promise<Job>{
 const job:Job={id:randomUUID(),input,records:[],created_at:new Date().toISOString(),status:'running',merchant:null,error:null};
 const controller=new AbortController();controls.set(job.id,{controller,job});
 try{await saveJob(job);}catch(e){controls.delete(job.id);throw e;}
 void (async()=>{try{
  const result=await collectRestaurant(job.input,controller.signal,async r=>{job.records.push(r);await saveJob(job);});
  job.output_file=result.output_file;job.filename=result.filename;job.merchant={name:result.name,address:result.address};job.status=controller.signal.aborted?'cancelled':result.records.some(r=>r.error)?'partial':'completed';
 }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=e instanceof Error?e.message:'Collection failed.';}
 finally{try{await saveJob(job);}finally{controls.delete(job.id);}}})().catch(()=>console.error('Could not persist audit.'));
 return job;
}
