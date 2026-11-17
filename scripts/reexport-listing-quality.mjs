import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {mapApify} from '../dist/backend/collection.js';
import {qualityListing} from '../dist/backend/listing-quality/public.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: reexport-listing-quality.mjs CAPTURE OUTPUT');
const source=resolve(input),out=resolve(output);if(source===out)throw Error('Derived export must not overwrite original capture');
const acceptance=JSON.parse(await readFile(join(source,'acceptance.json'),'utf8'));if(!acceptance.complete)throw Error('Capture incomplete; no derived delivery created');
const rounds=[];const required=new Set();
for(let round=1;round<=3;round++){
 const files=(await readdir(join(source,`run-${round}`))).filter(f=>f.endsWith('.json')).sort();if(files.length!==6)throw Error('Expected six stores per round');
 const stores=[];for(const file of files){const records=JSON.parse(await readFile(join(source,`run-${round}`,file),'utf8'));stores.push({file,records});for(const r of records)if(r.found)required.add(r.platform+'\0'+r.fetched_at);}rounds.push(stores);
}
const index=new Map();
for(const directory of await readdir('.local/collections')){
 const path=join('.local/collections',directory,'providers.json');let parsed;try{parsed=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')continue;throw e;}
 for(const [platform,raw] of Object.entries(parsed)){
  if(!raw||Array.isArray(raw)||typeof raw!=='object')continue;const key=platform+'\0'+raw.collected_at;if(!required.has(key))continue;
  if(index.has(key)&&JSON.stringify(index.get(key).raw)!==JSON.stringify(raw))throw Error('Ambiguous source receipt');index.set(key,{path,raw});
 }
}
const derived=[],evidence=[],changes=[];
for(const [i,stores] of rounds.entries()){
 const normalized=[];
 for(const {file,records} of stores){
  const google=records.find(r=>r.platform==='google_maps');if(!google?.found||!google.matched)throw Error('Missing verified Google identity');
  const target={name:google.name,address:google.address,phone:google.phone};
  const googleSource=index.get('google_maps\0'+google.fetched_at);if(!googleSource)throw Error('Google receipt unavailable');
  const storeProviders=JSON.parse(await readFile(googleSource.path,'utf8'));
  const next=records.map(record=>{
   if(!record.found){
    if(record.absence==='unsure'&&/conflicting street number/.test(record.error||'')){
     const candidates=storeProviders[record.platform+'_attempts']??[storeProviders[record.platform]];
     if(candidates.length&&candidates.every(raw=>raw&&Array.isArray(raw.items)&&mapApify(record.platform,raw,target).error==='No matching public listing was found.')){
      const row={...record,absence:'not_collected',error:'No matching public listing was found.'};
      changes.push({round:i+1,file,platform:record.platform,field:'absence',old:record.absence,new:row.absence,reason:'All saved candidate attempts rejected after excluding generic-only name overlap.'});return row;
     }
    }
    return record;
   }
   const item=index.get(record.platform+'\0'+record.fetched_at);if(!item)throw Error('Original source not found for '+file+'/'+record.platform);
   const mapped=mapApify(record.platform,item.raw,target);if(!mapped.found||!mapped.matched||mapped.url!==record.url)throw Error('Source replay identity differs for '+file+'/'+record.platform);
   const row={...qualityListing(mapped,item.raw),store:record.store};
   evidence.push({round:i+1,file,platform:record.platform,provider_file:item.path,run_id:item.raw.run_id,dataset_id:item.raw.dataset_id,sha256:createHash('sha256').update(JSON.stringify(item.raw)).digest('hex')});
   for(const field of ['rating','rating_raw','error'])if(JSON.stringify(record[field])!==JSON.stringify(row[field]))changes.push({round:i+1,file,platform:record.platform,field,old:record[field],new:row[field]});
   return row;
  });normalized.push({file,records:next});
 }derived.push(normalized);
}
const fields=['absence','found','matched','url','rating','review_count','price_level','recommend_text','followers','posts','name','address','phone','hours','error'];
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':String(JSON.stringify(v));
const differences=[];
for(let i=1;i<derived.length;i++)for(const current of derived[i]){
 const old=derived[i-1].find(s=>s.file===current.file);if(!old)throw Error('Store set changed between rounds');
 for(const r of current.records){const before=old.records.find(x=>x.platform===r.platform);if(!before)throw Error('Platform set changed');for(const field of fields)if(canonical(before[field])!==canonical(r[field]))differences.push({store:r.store,platform:r.platform,from_round:i,to_round:i+1,field,old:before[field]??null,new:r[field]??null,reason:'Requires source/attempt evidence review; no stability cause inferred.'});}
}
await mkdir(out,{recursive:true});
for(const [i,stores] of derived.entries()){await mkdir(join(out,`run-${i+1}`),{recursive:true});for(const s of stores)await writeFile(join(out,`run-${i+1}`,s.file),JSON.stringify(s.records,null,2)+'\n');}
await writeFile(join(out,'acceptance.json'),JSON.stringify({...acceptance,derived_from:source,mapping_policy:'issue18-ratingValue-2026-11-17',source_capture_unchanged:true},null,2)+'\n');
await writeFile(join(out,'source-evidence-private.json'),JSON.stringify(evidence,null,2)+'\n');await writeFile(join(out,'normalization-changes.json'),JSON.stringify(changes,null,2)+'\n');await writeFile(join(out,'stability.json'),JSON.stringify({differences,identical:differences.length===0},null,2)+'\n');
console.log(JSON.stringify({files:18,verified_source_records:evidence.length,normalization_changes:changes.length,differences:differences.length,source_unchanged:true}));
