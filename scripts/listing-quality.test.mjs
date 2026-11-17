import test from 'node:test';import assert from 'node:assert/strict';
import {numericRating,qualityListing,retryProvider,RunBudget} from '../dist/backend/listing-quality/public.js';
import {emptyListing} from '../dist/backend/collection.js';
test('issue18 ratings are positive star numbers or null, recommendation text retained',()=>{
 for(const v of [0,'Not yet rated','92% recommend (770 reviews)',{},NaN])assert.equal(numericRating(v),null);
 assert.equal(numericRating({average:4.56,count:12}),4.6);assert.equal(numericRating('4.5'),4.5);
 const r=qualityListing({...emptyListing('facebook'),rating:'92% recommend (770 reviews)'});assert.equal(r.rating,null);assert.equal(r.recommend_text,'92% recommend (770 reviews)');
});
test('absence requires real identity and reviewed successful search evidence',()=>{
 assert.equal(qualityListing(emptyListing('yelp','403')).absence,'not_collected');
 assert.equal(qualityListing(emptyListing('yelp','matched:false; conflicting street number')).absence,'unsure');
 const review={url:'https://www.yelp.com/search?find_desc=Cafe',reviewed:true,identity_checked:true,no_match:true};
 assert.equal(qualityListing(emptyListing('yelp'),{status:'error'},review).absence,'not_collected');
 const absent=qualityListing(emptyListing('yelp'),{status:'empty'},review);assert.equal(absent.absence,'confirmed_absent');assert.equal(absent.search_url,review.url);
 assert.equal(qualityListing({...emptyListing('yelp'),found:true,matched:true}).absence,'present');
});
test('provider errors retry five times with delays, success stops immediately',async()=>{
 let calls=0;const delays=[];
 const r=await retryProvider(async()=>({status:'error',items:[],note:'Apify HTTP 403',run_id:null}),{sleep:async n=>delays.push(n)});
 assert.equal(r.attempts.length,6);assert.deepEqual(delays,[3000,3000,3000,3000,3000]);
 await retryProvider(async()=>{calls++;return {status:'success',items:[],note:''};});assert.equal(calls,1);
 await assert.rejects(retryProvider(async()=>({status:'error',items:[],note:'Actor start was not replayed',run_id:null})),/reconciliation/);
});
test('budget never starts another Actor after cumulative reserved cap',()=>{
 const b=new RunBudget(1,.5);b.reserve();b.reserve();assert.throws(()=>b.reserve(),/budget exhausted/);
 b.settle({usage_usd:.2});assert.throws(()=>b.reserve(),/budget exhausted/);b.settle({usage_usd:.1});b.reserve();assert.ok(Math.abs(b.actual-.3)<1e-9);
});

test('actor-specific reservation handles published minimum caps without losing aggregate limit',()=>{
 const b=new RunBudget(1,.05);b.reserve(.5);b.settle({usage_usd:.01},.5);b.reserve(.5);assert.ok(Math.abs(b.reserved-.51)<1e-9);assert.throws(()=>b.reserve(.5),/budget exhausted/);
});

test('unrelated actor results are not mislabeled as a plausible branch',()=>{
 const r=qualityListing(emptyListing('grubhub','No matching public listing was found.'),{status:'unverified',items:[{name:'Taco Bell',address:'104 Third Ave'}]});assert.equal(r.absence,'not_collected');
});
test('discovery uses brand without generic suffix while identity remains full',async()=>{
 const {discoveryName}=await import('../dist/backend/collection.js');
 assert.equal(discoveryName('The Dolar Shop Hot Pot Manhattan'),'The Dolar Shop');
 assert.equal(discoveryName('LaoJie Hotpot'),'LaoJie');
 assert.equal(discoveryName('Easy Joy (Hot Pot, BBQ Skewers, Dim Sum) 意中人'),'Easy Joy');
 assert.equal(discoveryName('Hot Pot'),'Hot Pot');
});

test('known branch URLs still fetch fresh data and invalid seed fails before paid requests',async()=>{
 const {collectRestaurant}=await import('../dist/backend/collection.js');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'geo18-known-'));const old=process.env.COLLECTION_DATA_DIR;process.env.COLLECTION_DATA_DIR=join(root,'providers');
 let calls=[];const apify=async(platform,target)=>{calls.push(platform);return {status:'unverified',items:[{title:'Cafe',name:'Cafe',address:'1 Main St',url:platform==='google_maps'?'https://www.google.com/maps/place/Cafe':'https://www.yelp.com/biz/cafe-new-york'}],target,collected_at:new Date().toISOString(),note:''};};
 try{
  const result=await collectRestaurant({name:'Cafe',address:'1 Main St',platforms:['google_maps','yelp']},undefined,undefined,{apify,outputDirectory:root,knownListingUrls:{yelp:['https://www.yelp.com/biz/cafe-new-york']}});
  assert.deepEqual(calls,['google_maps','yelp']);assert.equal(result.records.find(x=>x.platform==='yelp').found,true);
  calls=[];await assert.rejects(collectRestaurant({name:'Cafe'},undefined,undefined,{apify,outputDirectory:root,knownListingUrls:{yelp:['https://evil.example/biz/cafe']}}),/Invalid known/);assert.equal(calls.length,0);
 }finally{if(old===undefined)delete process.env.COLLECTION_DATA_DIR;else process.env.COLLECTION_DATA_DIR=old;await rm(root,{recursive:true,force:true});}
});

test('promotion validates all rounds before writing and retains booking source evidence with normalized zero rating',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {join,resolve}=await import('node:path');const {tmpdir}=await import('node:os');const {spawnSync}=await import('node:child_process');
 const script=resolve('scripts/promote-listing-quality.mjs'),root=await mkdtemp(join(tmpdir(),'geo18-promotion-')),samples=join(root,'samples/step1-listing'),input=join(root,'capture');
 await mkdir(samples,{recursive:true});await mkdir(input);const stores=Array.from({length:6},(_,i)=>({name:'Cafe '+i,address:`${i+1} Main St, New York, NY`}));
 const platforms=['google_maps','yelp','tripadvisor','doordash','uber_eats','grubhub','facebook','instagram'];const bookings=[{platform:'opentable',found:false,rating:0,rating_raw:{average:0,count:0},fetched_at:'2026-11-07T00:00:00Z',error:'Historical record'},{platform:'resy',found:true,url:'https://resy.com/example'}];
 try{
  await writeFile(join(samples,'stores.json'),JSON.stringify(stores));await writeFile(join(input,'acceptance.json'),JSON.stringify({complete:true,budget_exhausted:false}));await writeFile(join(input,'stability.json'),JSON.stringify({differences:[]}));
  for(let round=1;round<=3;round++){
   await mkdir(join(input,`run-${round}`));
   for(const [i,s] of stores.entries()){
    const rows=platforms.map(platform=>({platform,found:true,matched:true,name:s.name,address:s.address,absence:'present',rating:4.5,store:i===0?'020':s.name}));
    await writeFile(join(input,`run-${round}`,s.name+'.json'),JSON.stringify(rows));if(round===1)await writeFile(join(samples,s.name+'.json'),JSON.stringify([...rows,...bookings]));
   }
  }
  const initial=await readFile(join(samples,'Cafe 0.json'),'utf8');const corrupt=join(input,'run-3','Cafe 5.json');const good=await readFile(corrupt,'utf8');await writeFile(corrupt,good.replaceAll('Cafe 5','Wrong store'));
  assert.notEqual(spawnSync(process.execPath,[script,input,'--publish'],{cwd:root,encoding:'utf8'}).status,0);assert.equal(await readFile(join(samples,'Cafe 0.json'),'utf8'),initial);
  await writeFile(corrupt,good);const done=spawnSync(process.execPath,[script,input,'--publish'],{cwd:root,encoding:'utf8'});assert.equal(done.status,0,done.stderr);
  const final=await readFile(join(samples,'Cafe 0.json'),'utf8');assert.equal(final,await readFile(join(samples,'stability/run-3/Cafe 0.json'),'utf8'));assert.deepEqual(JSON.parse(final).slice(-2),[{...bookings[0],rating:null},bookings[1]]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('remote reconciliation permits bounded retries only after a verified terminal state',async()=>{
 const {actorReceipt,remoteEnded}=await import('../dist/backend/listing-quality/remote.js');
 const raw={status:'error',items:[],run_id:'owned-run',note:'remote Actor termination could not be confirmed'};
 assert.equal(await remoteEnded(raw,async()=>new Response(JSON.stringify({data:{status:'RUNNING',usageTotalUsd:.01}}))),false);
 assert.equal(await remoteEnded(raw,async()=>new Response(JSON.stringify({data:{status:'ABORTED',usageTotalUsd:.049}}))),true);
 assert.equal(await actorReceipt('owned-run',async()=>new Response('{}',{status:403})),null);
 let calls=0;const result=await retryProvider(async()=>{calls++;return raw;},{sleep:async()=>{},reconcile:async()=>true});assert.equal(calls,6);assert.equal(result.attempts.length,6);
 calls=0;await assert.rejects(retryProvider(async()=>{calls++;return raw;},{sleep:async()=>{},reconcile:async()=>false}),/Uncertain remote/);assert.equal(calls,1);
});

test('billing holds full reservation through immediate/uncertain receipts and settles later terminal charges',async()=>{
 const {ReceiptBudget}=await import('../dist/backend/listing-quality/remote.js');const b=new ReceiptBudget(1,.05);b.reserve(.5);b.capture({run_id:'owned-run',usage_usd:0},.5,0);
 let reads=0;const transport=async()=>{reads++;return new Response(JSON.stringify({data:{status:'SUCCEEDED',usageTotalUsd:.049}}));};
 await b.refresh(transport,119999);assert.equal(reads,0);assert.equal(b.reserved,.5);
 await b.refresh(async()=>new Response(JSON.stringify({data:{status:'RUNNING',usageTotalUsd:0}})),120000);assert.equal(b.reserved,.5);
 await b.refresh(transport,120001);assert.equal(b.actual,.049);assert.ok(Math.abs(b.reserved-.049)<1e-9);assert.equal(b.pending.length,0);
 await b.refresh(transport,240000);assert.equal(reads,1);
});

test('remote wait polls only the same existing Actor and respects termination or cancellation',async()=>{
 const {waitForRemoteEnd}=await import('../dist/backend/listing-quality/remote.js');let time=0,calls=0;const urls=[];
 const transport=async url=>{urls.push(url);calls++;return new Response(JSON.stringify({data:{status:calls===1?'RUNNING':'ABORTED',usageTotalUsd:.049}}));};
 assert.equal(await waitForRemoteEnd({run_id:'owned-run'},{transport,now:()=>time,sleep:async n=>{time+=n;}}),true);assert.equal(calls,2);assert.equal(new Set(urls).size,1);
 const aborted=new AbortController();aborted.abort();assert.equal(await waitForRemoteEnd({run_id:'owned-run'},{signal:aborted.signal,transport}),false);assert.equal(calls,2);
 assert.equal(await waitForRemoteEnd({run_id:null},{transport}),false);
});

test('completed uncertain run recovers its own dataset and avoids starting a second Actor',async()=>{
 const {recoverRemoteResult}=await import('../dist/backend/listing-quality/remote.js');let starts=0,reads=[];
 const transport=async url=>{reads.push(url);return new Response(JSON.stringify(url.includes('/datasets/')?[{name:'Cafe',address:'1 Main St'}]:{data:{status:'SUCCEEDED',usageTotalUsd:.049,defaultDatasetId:'owned-dataset'}}));};
 const outcome=await retryProvider(async()=>{starts++;return {status:'error',items:[],run_id:'owned-run',note:'remote Actor termination could not be confirmed'};},{sleep:async()=>{},reconcile:r=>recoverRemoteResult(r,{transport})});
 assert.equal(starts,1);assert.equal(outcome.result.status,'unverified');assert.equal(outcome.result.items[0].name,'Cafe');assert.ok(reads.every(url=>url.includes('owned-run')||url.includes('owned-dataset')));
});

test('Uber Eats HTML aggregate ratingValue is not discarded when rating is absent',async()=>{
 const {mapApify}=await import('../dist/backend/collection.js');const raw={status:'unverified',collected_at:'2026-11-17T00:00:00Z',items:[{title:'Cafe',address:'1 Main St',url:'https://www.ubereats.com/store/cafe/example-id',ratingValue:4.5,reviewCount:24}]};
 const r=qualityListing(mapApify('uber_eats',raw,{name:'Cafe',address:'1 Main St'}),raw);assert.equal(r.rating,4.5);assert.equal(r.review_count,24);assert.equal(r.rating_raw.average,4.5);
});

test('source replay restores ratingValue consistently without changing original captures or accepting wrong branches',async()=>{
 const {mapApify}=await import('../dist/backend/collection.js');const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {join,resolve}=await import('node:path');const {tmpdir}=await import('node:os');const {spawnSync}=await import('node:child_process');
 const script=resolve('scripts/reexport-listing-quality.mjs'),root=await mkdtemp(join(tmpdir(),'geo18-reexport-')),capture=join(root,'capture'),out=join(root,'derived');
 const platforms=['google_maps','yelp','tripadvisor','doordash','uber_eats','grubhub','facebook','instagram'];let lastPath,lastPayload;
 try{
  await mkdir(capture);await writeFile(join(capture,'acceptance.json'),JSON.stringify({complete:true,budget_exhausted:false}));
  for(let round=1;round<=3;round++){
   await mkdir(join(capture,`run-${round}`));
   for(let i=0;i<6;i++){
    const name='Cafe '+i,address=(i+1)+' Main St',target={name,address},stamp=new Date(Date.UTC(2026,10,17,0,round*10+i)).toISOString();
    const google={status:'unverified',collected_at:stamp,items:[{name,address,url:'https://www.google.com/maps/place/Cafe'+i,totalScore:4.5}]};
    const uber={status:'unverified',collected_at:stamp,items:[{name,address,url:'https://www.ubereats.com/store/cafe-'+i+'/id',ratingValue:round===1?4.8:4.5,reviewCount:round===1?550:24}]};
    const rows=platforms.map(platform=>({...emptyListing(platform,'No source'),absence:'not_collected',search_url:null,store:i===0?'020':name}));
    rows[0]={...qualityListing(mapApify('google_maps',google,target),google),store:rows[0].store};rows[4]={...qualityListing(mapApify('uber_eats',uber,target),uber),rating:null,rating_raw:{average:null,count:uber.items[0].reviewCount},store:rows[0].store};
    await writeFile(join(capture,`run-${round}`,name+'.json'),JSON.stringify(rows));const provider=join(root,'.local/collections',`provider-${round}-${i}`);await mkdir(provider,{recursive:true});lastPath=join(provider,'providers.json');lastPayload={google_maps:google,uber_eats:uber};await writeFile(lastPath,JSON.stringify(lastPayload));
   }
  }
  const original=await readFile(join(capture,'run-1/Cafe 0.json'),'utf8');const bad=structuredClone(lastPayload);bad.uber_eats.items[0].address='999 Wrong St';await writeFile(lastPath,JSON.stringify(bad));
  assert.notEqual(spawnSync(process.execPath,[script,capture,out],{cwd:root,encoding:'utf8'}).status,0);
  await writeFile(lastPath,JSON.stringify(lastPayload));const result=spawnSync(process.execPath,[script,capture,out],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(await readFile(join(out,'run-1/Cafe 0.json'),'utf8'))[4].rating,4.8);assert.equal(JSON.parse(await readFile(join(out,'run-3/Cafe 0.json'),'utf8'))[4].rating,4.5);assert.equal(await readFile(join(capture,'run-1/Cafe 0.json'),'utf8'),original);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('generic The/Shop overlap does not make an unrelated business a plausible branch',async()=>{
 const {mapApify}=await import('../dist/backend/collection.js');const target={name:'The Dolar Shop Hot Pot Manhattan',address:'55 3rd Ave, New York, NY 10003'};
 const unrelated={status:'unverified',collected_at:new Date().toISOString(),items:[{name:'The Protein Shop',location:{address:'57 Clinton St, New York, NY 10002'},url:'https://www.grubhub.com/restaurant/the-protein-shop/123'}]};
 const r=qualityListing(mapApify('grubhub',unrelated,target),unrelated);assert.equal(r.absence,'not_collected');assert.equal(r.found,false);
 const other={...unrelated,items:[{name:'The Dolar Shop',location:{address:'39 Main St, Flushing, NY 11354'},url:'https://www.grubhub.com/restaurant/the-dolar-shop/456'}]};assert.equal(qualityListing(mapApify('grubhub',other,target),other).absence,'unsure');
});

test('delivered listing verifier is offline and rejects a corrupted zero rating',async()=>{
 const {mkdtemp,mkdir,cp,readFile,writeFile,rm}=await import('node:fs/promises');const {join,resolve}=await import('node:path');const {tmpdir}=await import('node:os');const {spawnSync}=await import('node:child_process');
 const script=resolve('scripts/verify-listing-quality.mjs'),root=await mkdtemp(join(tmpdir(),'geo18-delivery-'));
 try{
  await mkdir(join(root,'samples'));await cp('samples/step1-listing',join(root,'samples/step1-listing'),{recursive:true,filter:path=>!path.endsWith('.xlsx')&&!path.endsWith('.md')});
  const good=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).network_requests,0);
  const file=join(root,'samples/step1-listing/stability/run-1/99 Favor Taste.json');const rows=JSON.parse(await readFile(file,'utf8'));rows[0].rating=0;await writeFile(file,JSON.stringify(rows));assert.notEqual(spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'}).status,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
