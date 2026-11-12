import './config.js';
import {writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {collectRestaurant,emptyListing,selectedPlatforms,safeName,type CollectionInput,type Listing} from './collection.js';
import {conciseError} from './errors.js';
import {createBatchOutputDirectory} from './output.js';

export type BatchStore={id:string;name?:string;address?:string;place_id?:string};
export type BatchInput={stores:BatchStore[];platforms?:string[]};
export type BatchStoreProgress={id:string;input:CollectionInput;status:string;records:Listing[];filename?:string;output_file?:string;resolved_name?:string;error:string|null};
export type BatchProgress={directory:string;output_files:Record<string,string>;total:number;completed:number;current_store_id:string|null;stores:BatchStoreProgress[]};

// Validate the entire list before starting any paid collection.
export function parseStoreList(value:unknown):BatchStore[]{
 if(typeof value==='string'){
  const text=value.replace(/^\uFEFF/,'').trim();
  if(!text)throw Error('Provide a non-empty restaurant list.');
  if(text.startsWith('[')||text.startsWith('{')){
   try{value=JSON.parse(text);}catch{throw Error('Restaurant list is not valid JSON.');}
  }else value=text.split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
   const parts=line.split('|');if(parts.length>2)throw Error(`Restaurant row ${index+1}: use name | full address.`);
   return {name:parts[0].trim(),...(parts[1]?.trim()?{address:parts[1].trim()}: {})};
  });
 }
 if(!Array.isArray(value)||!value.length||value.length>20)throw Error('Provide between 1 and 20 restaurants.');
 const ids=new Set<string>();
 return value.map((item,index)=>{
  const fail=(message:string):never=>{throw Error(`Restaurant row ${index+1}: ${message}`);};
  if(!item||typeof item!=='object'||Array.isArray(item))return fail('expected a restaurant object.');
  const text=(key:string)=>{
   if(item[key]===undefined||item[key]===null)return undefined;
   if(typeof item[key]!=='string'||!item[key].trim()||item[key].length>500)return fail(`${key} must be a non-empty string of at most 500 characters.`);
   return item[key].trim() as string;
  };
  const name=text('name'),place_id=text('place_id'),address=text('address');
  if(!!name===!!place_id)return fail('provide either name or place_id, not both.');
  const id=text('id')||`store-${String(index+1).padStart(3,'0')}`;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)||ids.has(id))return fail('id must be unique and contain only letters, numbers, hyphens or underscores (maximum 64 characters).');
  ids.add(id);return {id,...(name?{name}:{}),...(place_id?{place_id}:{}),...(address?{address}:{})};
 });
}

export async function collectBatch(input:BatchInput,signal?:AbortSignal,onProgress?:(progress:BatchProgress)=>Promise<void>,options:{collect?:typeof collectRestaurant;outputRoot?:string;dataRoot?:string}={}){
 const stores=parseStoreList(input.stores),platforms=selectedPlatforms(input.platforms);
 const directory=await createBatchOutputDirectory(options.outputRoot||join(process.env.OUTPUT_DIR||'out','information','batches'),'Collect Information');
 const dataRoot=resolve(options.dataRoot||'.local/batches',randomUUID());
 const progress:BatchProgress={directory,output_files:{},total:stores.length,completed:0,current_store_id:null,stores:stores.map(({id,...target})=>({id,input:target,status:'pending',records:platforms.map(p=>emptyListing(p,'Collection not started.')),error:null}))};
 const filenameFor=(store:BatchStoreProgress)=>{
  const base=safeName(store.resolved_name||store.input.name||store.input.place_id||store.id);
  let filename=`${base}.json`,suffix=0;
  const taken=()=>Object.entries(progress.output_files).some(([id,path])=>id!==store.id&&path.toLowerCase()===join(directory,filename).toLowerCase());
  while(taken())filename=`${base}--${store.id}${suffix++?`-${suffix}`:''}.json`;
  return filename;
 };
 // Reserve every input name before resolving Google names, so duplicate branches
 // and filenames differing only in case cannot overwrite another store.
 for(const store of progress.stores){store.filename=filenameFor(store);store.output_file=join(directory,store.filename);progress.output_files[store.id]=store.output_file;}
 const save=async()=>{
  for(const store of progress.stores){
   const filename=filenameFor(store),path=join(directory,filename),previous=store.output_file!;
   if(path!==previous)await rename(previous,path);
   store.filename=filename;store.output_file=path;progress.output_files[store.id]=path;
   const temp=path+'.'+randomUUID()+'.tmp';
   await writeFile(temp,JSON.stringify(store.records,null,2));await rename(temp,path);
  }
  await onProgress?.(progress);
 };
 await save();
 const collect=options.collect||collectRestaurant;
 for(const store of progress.stores){
  if(signal?.aborted){
   store.status='cancelled';store.error='Cancelled before this restaurant started.';
   store.records=platforms.map(p=>emptyListing(p,store.error));await save();continue;
  }
  progress.current_store_id=store.id;store.status='running';await onProgress?.(progress);
  try{
   const result=await collect({...store.input,platforms},signal,async record=>{
    store.records[platforms.indexOf(record.platform)]=record;await save();
   },{outputDirectory:join(dataRoot,store.id)});
   // Return values are authoritative, including collectors that do not emit progress.
   store.records=platforms.map(p=>result.records.find(r=>r.platform===p)||emptyListing(p,'No platform result was returned.'));
   store.resolved_name=result.name;
   store.status=signal?.aborted?'cancelled':!store.records.some(r=>r.found)?'failed':store.records.some(r=>r.error)?'partial':'completed';
  }catch(error){
   store.error=signal?.aborted?'Cancelled during restaurant collection.':conciseError(error);
   store.status=signal?.aborted?'cancelled':'failed';
   store.records=store.records.map(r=>r.found?r:emptyListing(r.platform,store.error));
  }
  progress.completed++;await save();
 }
 progress.current_store_id=null;await save();return progress;
}
