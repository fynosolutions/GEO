import {readFile,readdir,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {safeName} from '../dist/backend/collection.js';
import {numericRating} from '../dist/backend/listing-quality/public.js';
const args=process.argv.slice(2);const source=args[0];
if(!source||args.slice(1).some(x=>!['--publish'].includes(x)))throw Error('Usage: node scripts/promote-listing-quality.mjs INPUT [--publish]');
const base=resolve(source),acceptance=JSON.parse(await readFile(join(base,'acceptance.json'),'utf8'));
if(!acceptance.complete||acceptance.budget_exhausted)throw Error('Incomplete three-round capture; formal samples not replaced');
const stores=JSON.parse(await readFile('samples/step1-listing/stores.json','utf8'));
const target=resolve('samples/step1-listing');const existing=[];
for(const name of await readdir(target)){if(!name.endsWith('.json')||name==='stores.json')continue;const rows=JSON.parse(await readFile(join(target,name),'utf8'));if(Array.isArray(rows))existing.push({name,rows});}
const norm=v=>String(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const plans=[];
for(const store of stores){
 const street=norm(store.address.split(',')[0]);
 const matches=existing.filter(x=>x.rows.some(r=>r.platform==='google_maps'&&norm(typeof r.address==='string'?r.address:JSON.stringify(r.address)).includes(street)));
 if(matches.length!==1)throw Error('Cannot uniquely map original sample for '+store.name);
 const old=matches[0];
 for(let round=1;round<=3;round++){
  const path=join(base,`run-${round}`,safeName(store.name)+'.json');const rows=JSON.parse(await readFile(path,'utf8'));
  if(rows.length!==8||new Set(rows.map(r=>r.platform)).size!==8)throw Error('Expected eight non-booking platforms');
  for(const r of rows){
   if(r.store!==(stores.indexOf(store)===0?'020':store.name))throw Error('Wrong store identity in round');
   if(!['present','confirmed_absent','not_collected','unsure'].includes(r.absence)||r.found!==(r.absence==='present')||r.matched!==r.found)throw Error('Invalid absence invariant');
   if(r.absence==='confirmed_absent'&&!r.search_url)throw Error('Absent without search URL');
   if('rating' in r&&r.rating!==null&&!(typeof r.rating==='number'&&r.rating>0&&r.rating<=5))throw Error('Invalid rating');
  }
  // Keep historical booking facts/timestamps; apply the required rating contract without collecting again.
  const output=[...rows,...old.rows.filter(r=>['opentable','resy'].includes(r.platform)).map(r=>'rating' in r?{...r,rating:numericRating(r.rating)}:r)];
  plans.push({round,name:old.name,output});
 }
}
const stability=JSON.parse(await readFile(join(base,'stability.json'),'utf8'));
if(stability.differences.some(d=>!d.reason||/Requires source\/attempt evidence review/.test(d.reason)))throw Error('Stability differences require evidence-backed explanation before publication');
if(!args.includes('--publish')){console.log(JSON.stringify({validated_files:plans.length,publication:false,differences:stability.differences.length}));process.exit(0);}
for(const p of plans){const directory=join(target,'stability',`run-${p.round}`);await mkdir(directory,{recursive:true});const bytes=JSON.stringify(p.output,null,2)+'\n';await writeFile(join(directory,p.name),bytes);if(p.round===3)await writeFile(join(target,p.name),bytes);}
await copyFile(join(base,'stability.json'),join(target,'stability','comparison.json'));
console.log(JSON.stringify({published_files:plans.length,final_round:3,differences:stability.differences.length}));
