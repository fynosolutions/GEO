import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {join} from 'node:path';
import {reviewStores,reviewFilename,normalizeReviews} from '../dist/backend/reviews/public.js';
const args=process.argv.slice(2),base=args[0]??'samples/step1-reviews',source=args[1];
const read=async p=>JSON.parse(await readFile(p,'utf8'));const stores=reviewStores(await read(join(base,'stores.json')));
assert.equal(stores.length,6);const raw=[];
if(source)for(const name of await readdir(join(source,'requests'))){if(name.endsWith('.json')&&!name.endsWith('-billing.json')){const item=await read(join(source,'requests',name));if(item.result)raw.push(item);}}
const summary=[];
for(const store of stores){
 const records=await read(join(base,reviewFilename(store)));assert.equal(records.length,2);const ids=new Set();
 for(const platform of ['google_maps','yelp']){
  const matching=records.filter(r=>r.platform===platform);assert.equal(matching.length,1);const r=matching[0];
  assert.equal(r.store,store.id==='store-001'?'020':store.name);assert.ok(Number.isFinite(Date.parse(r.fetched_at)));assert.ok(Array.isArray(r.reviews));
  let previous=Infinity;
  for(const v of r.reviews){
   assert.deepEqual(Object.keys(v).sort(),['review_id','author','date','rating','text','language'].sort());
   assert.ok(v.review_id===null||typeof v.review_id==='string'&&v.review_id.trim());
   if(v.review_id!==null){assert.ok(!ids.has(v.review_id),'Duplicate platform review ID in '+reviewFilename(store));ids.add(v.review_id);}
   assert.ok(v.author===null||typeof v.author==='string'&&v.author.trim());assert.equal(typeof v.text,'string');
   assert.ok(v.rating===null||typeof v.rating==='number'&&v.rating>=1&&v.rating<=5);
   assert.ok(v.date===null||typeof v.date==='string'&&Number.isFinite(Date.parse(v.date)));
   const time=v.date?Date.parse(v.date):-Infinity;assert.ok(time<=previous,'Reviews not newest first');previous=time;
  }
  if(source){
   const actor=platform==='google_maps'?'compass/crawler-google-places':'tri_angle/yelp-review-scraper';
   const sources=raw.filter(x=>x.spec.actor===actor&&x.target.name===store.name&&x.target.address===store.address);assert.equal(sources.length,1,'Expected one fresh raw source');
   const x=sources[0],replayed=normalizeReviews(platform,x.result.items,store,x.limit,x.result.collected_at,['unverified','success','empty'].includes(x.result.status)?(x.result.truncated?'Provider dataset was truncated.':null):x.result.note).record;
   assert.deepEqual(r,{...replayed,store:store.id==='store-001'?'020':store.name},'Public output differs from raw replay');
  }
  summary.push({store:r.store,platform,reviews:r.reviews.length,missing_ids:r.reviews.filter(v=>v.review_id===null).length,missing_authors:r.reviews.filter(v=>v.author===null).length,newest:r.reviews.find(v=>v.date)?.date??null});
 }
}
console.log(JSON.stringify({files:6,platform_records:12,raw_replay_verified:!!source,summary},null,2));
