import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reviewStores,canonicalYelp,actorSpec,normalizeReviews,reviewFilename} from '../dist/backend/reviews/public.js';
import {cachedReviews,lockCache,settledUsage} from '../dist/backend/reviews/provider.js';
import {collectApify} from '../dist/backend/apify.js';
const store={id:'fixture',name:'Fixture Hot Pot',address:'123 Main St, New York, NY 10001',place_id:'fixture-place',google_maps_url:'https://www.google.com/maps/search/?api=1&query_place_id=fixture-place',yelp_url:'https://www.yelp.com/biz/fixture-hot-pot'};
const review=(id,date='2026-11-09',text='Original long\n中文 review text')=>({reviewId:id,name:'Fixture Reviewer',publishedAtDate:date,stars:5,text,language:'zh'});
const place=(reviews)=>({placeId:store.place_id,title:store.name,address:store.address,reviewsCount:reviews.length,reviewsTags:['broth · 4'],reviews});
test('review inputs remove old Yelp offsets, reject wrong domains and duplicate branch targets',()=>{
 assert.equal(canonicalYelp(store.yelp_url+'?start=1040&osq=old#reviews'),store.yelp_url);
 assert.throws(()=>canonicalYelp('https://www.yelp.com.evil.test/biz/fixture'));
 assert.throws(()=>canonicalYelp('https://www.yelp.com/search?find_desc=x'));
 assert.throws(()=>reviewStores([store,{...store,id:'another'}]));
 assert.equal(reviewStores([{...store,yelp_url:store.yelp_url+'?start=40'}])[0].yelp_url,store.yelp_url);
});
test('review Actors use newest Google-only scope and no Yelp language/date filters',()=>{
 const g=actorSpec('google_maps',store,200),y=actorSpec('yelp',store,200);
 assert.equal(g.input.reviewsSort,'newest');assert.equal(g.input.reviewsOrigin,'google');assert.equal(g.input.maxReviews,200);
 assert.equal(y.input.maxReviewsPerUrl,200);assert.equal(y.input.language,undefined);assert.equal(y.input.dateFrom,undefined);
 assert.throws(()=>actorSpec('yelp',store,201));
});
test('original text survives, ratings are per-review, newest sorting and ID-based deduplication',()=>{
 const long='中英 mixed\n'+('unchanged '.repeat(600));
 const first={...review('a','2026-11-08',long),textTranslated:'DO NOT EXPORT',rating:1};
 const sameText=review('b','2026-11-09',long);
 const {record,evidence}=normalizeReviews('google_maps',[place([first,sameText,first])],store);
 assert.equal(record.reviews.length,2);assert.equal(record.reviews[0].date,'2026-11-09');assert.equal(record.reviews[1].text,long);assert.equal(record.reviews[1].rating,5);assert.equal(evidence.duplicates,1);assert.equal(record.total_reviews,3);assert.deepEqual(record.topics,['broth · 4']);
 const tagged=place([review('t')]);tagged.reviewsTags=[{title:'Original topic',count:3}];assert.deepEqual(normalizeReviews('google_maps',[tagged],store).record.topics,['Original topic · 3']);
});
test('cap does not overwrite total, missing language remains null, translated text is never a fallback',()=>{
 const rows=Array.from({length:220},(_,i)=>review(String(i),new Date(Date.UTC(2026,10,9)-i*86400000).toISOString()));
 const root=place(rows);root.reviewsCount=900;
 const value=normalizeReviews('google_maps',[root],store,200);assert.equal(value.record.reviews.length,200);assert.equal(value.record.total_reviews,900);
 const blank={...review('empty'),text:'',language:''};assert.equal(normalizeReviews('google_maps',[place([blank])],store).record.error,null);
 const missing=review('x');delete missing.language;assert.equal(normalizeReviews('google_maps',[place([missing])],store).record.reviews[0].language,null);
 const translated={...review('y'),text:undefined,textTranslated:'translated'};assert.equal(normalizeReviews('google_maps',[place([translated])],store).record.reviews.length,0);
});
test('wrong-branch comments are not exported, including a matching name with wrong street number',()=>{
 assert.equal(normalizeReviews('google_maps',[{...place([review('a')]),address:'124 Main St, New York, NY 10001'}],store).record.reviews.length,0);
 const y={id:'a',businessName:store.name,businessAddress:'124 Main St, New York, NY 10001',businessUrl:store.yelp_url,reviewCount:40,date:'2026-11-08',rating:4,text:'wrong branch',language:'en'};
 assert.equal(normalizeReviews('yelp',[y],store).record.total_reviews,null);
});
test('Yelp total is not sampled length and owner replies are not customer text',()=>{
 const y={id:'a',businessName:store.name,businessAddress:store.address,businessUrl:store.yelp_url,reviewCount:84,date:'2026-11-08',rating:4,text:'Original customer\ntext',ownerResponse:'Not a customer review',language:'en'};
 const {record,evidence}=normalizeReviews('yelp',[y],store);assert.equal(record.total_reviews,84);assert.equal(record.reviews.length,1);assert.equal(record.reviews[0].text,y.text);assert.equal(evidence.complete,false);assert.match(record.error,/Fewer reviews/);
});
test('zero reviews, unavailable data, malformed dates and expansion markers stay distinct',()=>{
 const empty=normalizeReviews('google_maps',[place([])],store);assert.equal(empty.record.total_reviews,0);assert.equal(empty.evidence.complete,true);
 assert.equal(normalizeReviews('google_maps',[],store).record.total_reviews,null);
 const malformed=normalizeReviews('google_maps',[place([review('a','not a date','cut short…more')])],store);assert.equal(malformed.record.reviews[0].date,null);assert.equal(malformed.evidence.complete,false);assert.equal(malformed.evidence.possible_truncations,1);
});
test('review cache prevents paid repeats, cache-only misses never start Actors and budget includes reservations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reviews-')),old=process.env.APIFY_TOKEN,oldEnabled=process.env.APIFY_ENABLED;process.env.APIFY_TOKEN='fixture';process.env.APIFY_ENABLED='true';let calls=0;
 try{
  const mock=async(platform,target,signal,transport,options)=>{calls++;await options.onStarted('fixture-run');return {status:'unverified',actor:options.entry.actor,run_id:'fixture-run',dataset_id:'fixture-data',collected_at:'2026-11-09T01:00:00Z',note:'',items:[place([review('a')])],truncated:false,target,usage_usd:0.1};};
  const options={root,budget:0.5,runCap:0.4,collect:mock};
  await cachedReviews(store,'google_maps',200,options);const again=await cachedReviews(store,'google_maps',200,options);assert.equal(calls,1);assert.equal(again.cached,true);
  await assert.rejects(()=>cachedReviews(store,'yelp',200,{...options,cacheOnly:true}),/cache-only/);assert.equal(calls,1);
  await assert.rejects(()=>cachedReviews({...store,id:'second',place_id:'second-place'},'google_maps',200,{...options,runCap:0.5}),/budget exhausted/);assert.equal(calls,1);
  const ledger=JSON.parse(await readFile(join(root,'ledger.json')));assert.equal(Object.values(ledger.requests)[0].usage_usd,0.1);
 }finally{await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;if(oldEnabled===undefined)delete process.env.APIFY_ENABLED;else process.env.APIFY_ENABLED=oldEnabled;}
});
test('cache lock prevents two processes paying for the same batch concurrently',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reviews-lock-'));
 try{const unlock=await lockCache(root);await assert.rejects(()=>lockCache(root),/locked/);await unlock();const second=await lockCache(root);await second();}finally{await rm(root,{recursive:true,force:true});}
});
test('optional review Actor configuration keeps secrets out of URL and records run/usage',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';let body,started;
 try{
  const r=await collectApify('google_maps',{name:store.name,address:store.address,website_url:'',listing_url:store.google_maps_url,place_id:store.place_id},undefined,async(url,options)=>{
   assert.ok(!url.includes('fixture')||url.includes('datasets/fixture'));if(options.method==='POST'){body=JSON.parse(options.body);return Response.json({data:{id:'fixture',status:'SUCCEEDED',defaultDatasetId:'fixture',usageTotalUsd:0.03}});}return Response.json([place([review('a')])]);
  },{entry:actorSpec('google_maps',store,200),maxChargeUsd:0.4,onStarted:async id=>{started=id;}});
  assert.equal(started,'fixture');assert.equal(r.usage_usd,0.03);assert.equal(body.maxReviews,200);assert.deepEqual(body.placeIds,[store.place_id]);assert.equal(body.searchStringsArray,undefined);
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});

test('delayed review billing retains the whole reservation until all dataset items are charged',()=>{
 const rows=[{},{}];assert.equal(settledUsage('yelp',{status:'SUCCEEDED',usageTotalUsd:0.003,chargedEventCounts:{'apify-actor-start':1}},rows),null);
 assert.equal(settledUsage('yelp',{status:'SUCCEEDED',usageTotalUsd:0.006,chargedEventCounts:{'apify-default-dataset-item':2}},rows),0.006);
 assert.equal(settledUsage('yelp',{status:'RUNNING',usageTotalUsd:0.006,chargedEventCounts:{'apify-default-dataset-item':2}},rows),null);
});

test('charge counts arriving before usage totals do not release a run reservation',()=>{
 const meta={status:'SUCCEEDED',usageTotalUsd:0.003,chargedEventCounts:{'apify-default-dataset-item':2},pricingInfo:{pricingPerEvent:{actorChargeEvents:{'apify-default-dataset-item':{eventPriceUsd:0.002}}}}};
 assert.equal(settledUsage('yelp',meta,[{},{}]),null);meta.usageTotalUsd=0.004;assert.equal(settledUsage('yelp',meta,[{},{}]),0.004);
});

test('a cache-only miss preserves an already collected restaurant output',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reviews-replay-'));
 try{
  await mkdir(join(root,'out'));const stores=join(root,'stores.json');await writeFile(stores,JSON.stringify([store]));
  const output=join(root,'out',reviewFilename(store)),original=JSON.stringify([{platform:'google_maps',reviews:[{text:'Existing verified text'}]}]);await writeFile(output,original);
  const run=spawnSync(process.execPath,['dist/backend/reviews/cli.js','--stores',stores,'--output',join(root,'out'),'--cache',join(root,'cache'),'--platforms','google_maps','--cache-only','true'],{encoding:'utf8'});
  assert.equal(run.status,2,run.stderr);assert.equal(await readFile(output,'utf8'),original);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('Google source line-break markup becomes displayed newlines without rewriting other content or Yelp text',()=>{
 const original='  First<br>中文<BR/>next<br />last\n&lt;br&gt; <b>literal</b> &amp;  ';
 const expected='  First\n中文\nnext\nlast\n&lt;br&gt; <b>literal</b> &amp;  ';
 const raw=review('breaks','2026-11-09',original);
 assert.equal(normalizeReviews('google_maps',[place([raw])],store).record.reviews[0].text,expected);
 assert.equal(raw.text,original);
 const y={id:'breaks',businessName:store.name,businessAddress:store.address,businessUrl:store.yelp_url,reviewCount:1,date:'2026-11-09',rating:4,text:original,language:'en'};
 assert.equal(normalizeReviews('yelp',[y],store).record.reviews[0].text,original);
});


test('review export preserves platform IDs and public authors, never substitutes URLs or business names',()=>{
 const raw={...review('native-id'),name:'公开名字'};
 const g=normalizeReviews('google_maps',[place([raw,raw,{...review('second'),name:'公开名字'}])],store);
 assert.deepEqual(g.record.reviews.map(r=>r.review_id),['native-id','second']);assert.equal(g.evidence.duplicates,1);
 assert.ok(g.record.reviews.every(r=>r.author==='公开名字'));
 const missing={...review(''),reviewUrl:'https://google.com/review/example',name:null};delete missing.reviewId;
 const absent=normalizeReviews('google_maps',[place([missing])],store);
 assert.equal(absent.record.reviews[0].review_id,null);assert.equal(absent.record.reviews[0].author,null);assert.equal(absent.evidence.missing_ids,1);
 const y={id:'yelp-id',businessName:store.name,businessAddress:store.address,businessUrl:store.yelp_url,reviewCount:1,date:'2026-11-09',rating:5,text:'Original',language:'en',reviewerName:'Eunice Y.'};
 const v=normalizeReviews('yelp',[y],store);assert.equal(v.record.reviews[0].review_id,'yelp-id');assert.equal(v.record.reviews[0].author,'Eunice Y.');
 assert.equal(actorSpec('google_maps',store,200).input.scrapeReviewsPersonalData,true);
});

test('offline review delivery verifier rejects duplicate native IDs across a restaurant file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-review-delivery-'));
 try{
  const stores=JSON.parse(await readFile('samples/step1-reviews/stores.json','utf8'));
  await writeFile(join(root,'stores.json'),JSON.stringify(stores));
  for(const s of stores){const rows=['google_maps','yelp'].map(platform=>({platform,store:s.id==='store-001'?'020':s.name,total_reviews:1,topics:[],url:platform==='yelp'?s.yelp_url:s.google_maps_url,fetched_at:'2026-11-18T00:00:00Z',error:null,reviews:[{review_id:platform+'-native',author:'Public Name',date:'2026-11-17T00:00:00Z',rating:5,text:'Original',language:'en'}]}));await writeFile(join(root,reviewFilename(s)),JSON.stringify(rows));}
  const ok=spawnSync(process.execPath,['scripts/verify-review-samples.mjs',root],{encoding:'utf8'});assert.equal(ok.status,0,ok.stderr);
  const file=join(root,reviewFilename(stores[0])),rows=JSON.parse(await readFile(file,'utf8'));rows[1].reviews[0].review_id=rows[0].reviews[0].review_id;await writeFile(file,JSON.stringify(rows));
  const bad=spawnSync(process.execPath,['scripts/verify-review-samples.mjs',root],{encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/Duplicate platform review ID/);
 }finally{await rm(root,{recursive:true,force:true});}
});
