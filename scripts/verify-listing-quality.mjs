import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {matchesIdentity} from '../dist/backend/collection.js';
const base='samples/step1-listing',dir=join(base,'stability');
const manifest=JSON.parse(await readFile(join(dir,'acceptance.json'),'utf8'));
const stores=JSON.parse(await readFile(join(base,'stores.json'),'utf8'));
assert.equal(stores.length,6);assert.equal(manifest.three_round_files_complete,true);assert.equal(manifest.cost_within_authorized_limit,true);assert.equal(manifest.budget_usd,10);
const files=(await readdir(join(dir,'run-3'))).filter(f=>f.endsWith('.json')).sort();assert.equal(files.length,6);
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':String(JSON.stringify(v));
const hash=row=>{const {rating,...facts}=row;return createHash('sha256').update(canonical(facts)).digest('hex');};
const expectedPlatforms=['google_maps','yelp','tripadvisor','doordash','uber_eats','grubhub','facebook','instagram'];const rounds=[],counts={present:0,confirmed_absent:0,not_collected:0,unsure:0};let ratingFields=0;
for(let round=1;round<=3;round++){
 assert.deepEqual((await readdir(join(dir,`run-${round}`))).filter(f=>f.endsWith('.json')).sort(),files);
 const phase=[];const seen=new Set();
 for(const file of files){
  const bytes=await readFile(join(dir,`run-${round}`,file));const rows=JSON.parse(bytes);assert.equal(rows.length,10);
  const active=rows.filter(r=>!['opentable','resy'].includes(r.platform));assert.deepEqual(active.map(r=>r.platform),expectedPlatforms);
  const id=active[0].store;const store=id==='020'?stores[0]:stores.find(s=>s.name===id);assert.ok(store);assert.ok(!seen.has(id));seen.add(id);
  const google=active[0];assert.equal(google.found,true);assert.ok(matchesIdentity(google,{name:store.name,address:store.address}));
  for(const r of rows){
   if('rating' in r){ratingFields++;assert.ok(r.rating===null||typeof r.rating==='number'&&Number.isFinite(r.rating)&&r.rating>0&&r.rating<=5&&Math.abs(r.rating*10-Math.round(r.rating*10))<1e-8);}
   if(['opentable','resy'].includes(r.platform)){assert.equal(hash(r),manifest.legacy_booking_fingerprints[file][r.platform]);continue;}
   assert.equal(r.store,id);assert.ok(r.absence in counts);counts[r.absence]++;
   assert.equal(r.found,r.absence==='present');assert.equal(r.matched,r.found);assert.ok(Number.isFinite(Date.parse(r.fetched_at)));
   if(r.found)assert.ok(matchesIdentity(r,{name:google.name,address:google.address,phone:google.phone}));
   else for(const field of ['name','address','phone','url','hours','rating','review_count','followers','posts'])assert.ok(r[field]===null||r[field]===undefined);
   if(r.absence==='confirmed_absent')assert.ok(r.search_url?.startsWith('https://'));
   if(r.platform==='facebook'){assert.ok(r.recommend_text===null||typeof r.recommend_text==='string');if(/recommend|not yet rated/i.test(r.recommend_text||''))assert.equal(r.rating,null);}
  }
  if(round===3)assert.deepEqual(bytes,await readFile(join(base,file)),'Final output must exactly equal run-3');phase.push({file,active});
 }
 rounds.push(phase);
}
const fields=['absence','found','matched','url','rating','review_count','price_level','recommend_text','followers','posts','name','address','phone','hours','error'];const actual=[];
for(let phase=1;phase<3;phase++)for(const current of rounds[phase]){
 const prior=rounds[phase-1].find(x=>x.file===current.file);
 for(const row of current.active){const old=prior.active.find(r=>r.platform===row.platform);assert.ok(Date.parse(row.fetched_at)>=Date.parse(old.fetched_at));for(const field of fields)if(canonical(old[field])!==canonical(row[field]))actual.push({store:row.store,platform:row.platform,from_round:phase,to_round:phase+1,field,old:old[field]??null,new:row[field]??null});}
}
const report=JSON.parse(await readFile(join(dir,'comparison.json'),'utf8'));assert.equal(report.all_differences_explained,true);assert.deepEqual(report.differences.map(({reason,source_evidence,...d})=>d),actual);
for(const d of report.differences){assert.ok(d.reason&&!/Requires source\/attempt evidence review/.test(d.reason));assert.match(d.source_evidence.from_sha256,/^[a-f0-9]{64}$/);assert.match(d.source_evidence.to_sha256,/^[a-f0-9]{64}$/);}
const retry=JSON.parse(await readFile(join(dir,'retry-verification.json'),'utf8'));assert.equal(retry.failed_series.length,manifest.observed_failed_retry_series);for(const series of retry.failed_series){assert.equal(series.attempts,6);assert.equal(series.retries,5);assert.equal(series.platform,'facebook');}
assert.equal(manifest.active_rows,144);assert.deepEqual(manifest.absence_distribution,counts);assert.equal(manifest.reviewed_differences,actual.length);
console.log(JSON.stringify({stores:6,rounds:3,files:18,active_rows:144,legacy_booking_rows:36,rating_fields_valid:ratingFields,absence_distribution:counts,reviewed_differences:actual.length,run3_matches_final:true,network_requests:0}));
