import {matchesIdentity,mapItem} from '../dist/backend/collection.js';
const identityConflict=(items,target)=>!matchesIdentity(mapItem('google_maps',items[0]),target);
import test from 'node:test';import assert from 'node:assert/strict';
import {collectApify,expandInput} from '../dist/backend/apify.js';

test('402 billing errors explain the account restriction without leaking raw provider messages',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture-private-token';
 try{
  const r=await collectApify('google_maps',{name:'Fixture',address:'New York',listing_url:'',website_url:''},undefined,async()=>Response.json({error:{type:'not-enough-usage-to-run-paid-actor',message:'raw fixture-private-token'}},{status:402}));
  assert.equal(r.status,'error');assert.equal(r.run_id,null);assert.match(r.note,/not-enough-usage-to-run-paid-actor/);assert.match(r.note,/Insufficient Apify account usage/);assert.ok(!r.note.includes('fixture-private-token'));
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});
test('wrong-branch provider results are rejected rather than treated as successful extraction',()=>{
 const target={name:'Easy Joy Dim Sum & AYCE Hot Pot',address:'145 Mulberry St, New York, NY 10013'};
 assert.equal(identityConflict([{name:'Canyon Lake Country Club Bar & Grill',address:'32001 Railroad Canyon Rd, Canyon Lake, CA 92587'}],target),true);
 assert.equal(identityConflict([{title:'Easy Joy Dim Sum Hot Pot',address:{streetAddress:'145 Mulberry Street',postalCode:'10013'}}],target),false);
});
test('input expansion preserves types and exact text',()=>{
 assert.deepEqual(expandInput({urls:['{{listing_url}}'],count:1,all:true},{listing_url:'https://example.com/a?x="raw"'}),{urls:['https://example.com/a?x="raw"'],count:1,all:true});
});
test('Facebook name and direct-page adapters use the documented schemas',async()=>{
 const previous=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';const requests=[];
 try{
  const transport=async(url,options)=>{
   if(options.method==='POST'){requests.push({url,input:JSON.parse(options.body)});return Response.json({data:{id:'fixture',status:'SUCCEEDED',defaultDatasetId:'fixture'}});}
   return Response.json([]);
  };
  const target={name:'Fixture Cafe',address:'123 Main St',website_url:'',listing_url:''};
  await collectApify('facebook',target,undefined,transport);
  await collectApify('facebook',{...target,listing_url:'https://www.facebook.com/fixturecafe'},undefined,transport);
  assert.ok(requests[0].url.includes('apify~facebook-search-scraper'));
  assert.deepEqual(requests[0].input,{categories:['Fixture Cafe'],locations:[''],searchType:'pages-google',resultsLimit:5});
  assert.ok(requests[1].url.includes('apify~facebook-pages-scraper'));
  assert.deepEqual(requests[1].input,{startUrls:[{url:'https://www.facebook.com/fixturecafe'}]});
 }finally{if(previous===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=previous;}
});
test('missing token skips without a network request',async()=>{
 const previous=process.env.APIFY_TOKEN;delete process.env.APIFY_TOKEN;
 try{const r=await collectApify('yelp',{},undefined,()=>{throw Error('unexpected network');});assert.equal(r.status,'skipped');}
 finally{if(previous!==undefined)process.env.APIFY_TOKEN=previous;}
});

test('new platform Actor inputs use the verified schemas',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';const calls=[];
 try{
  const transport=async(url,options)=>{
   if(options.method==='POST'){calls.push({url,input:JSON.parse(options.body)});return Response.json({data:{id:'fixture',status:'SUCCEEDED',defaultDatasetId:'fixture'}});}
   return Response.json([]);
  };
  const target={name:'Fixture Cafe',address:'123 Main St, New York, NY 10001',website_url:'',listing_url:''};
  await collectApify('resy',target,undefined,transport);
  await collectApify('resy',{...target,listing_url:'https://resy.com/cities/new-york-ny/venues/fixture'},undefined,transport);
  const skip=await collectApify('instagram',target,undefined,transport);assert.equal(skip.status,'skipped');
  await collectApify('instagram',{...target,listing_url:'https://www.instagram.com/fixturecafe/'},undefined,transport);
  assert.ok(calls[0].url.includes('memo23~resy-restaurant-scraper'));assert.deepEqual(calls[0].input.cities,['New York']);
  assert.equal(calls[0].input.query,'Fixture Cafe');assert.equal(calls[0].input.includeAvailability,false);
  assert.deepEqual(calls[1].input.startUrls,['https://resy.com/cities/new-york-ny/venues/fixture']);assert.equal(calls[1].input.cities,undefined);
  assert.ok(calls[2].url.includes('apify~instagram-profile-scraper'));assert.deepEqual(calls[2].input,{usernames:['https://www.instagram.com/fixturecafe/'],includeAboutSection:false});
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});

test('Stop aborts a remote Actor once even when cancellation races its start acknowledgement',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';
 try{
  for(const phase of ['start','running','abort-failure']){
   const controller=new AbortController();const calls=[];
   const transport=async(url,options)=>{
    calls.push(url);
    if(url.includes('/abort?')){assert.equal(options.signal.aborted,false);return phase==='abort-failure'?Response.json({},{status:503}):Response.json({data:{status:'ABORTED'}});}
    if(url.includes('/runs?')){
     if(phase==='start')controller.abort();
     else setTimeout(()=>controller.abort(),5);
     assert.equal(options.signal.aborted,false);
     return Response.json({data:{id:'fixture-run',status:'RUNNING'}});
    }
    throw Error('Polling or dataset fetch must stop');
   };
   const result=await collectApify('google_maps',{name:'Fixture',address:'New York',listing_url:'',website_url:''},controller.signal,transport);
   assert.equal(result.status,'cancelled');assert.equal(calls.filter(u=>u.includes('/abort?gracefully=false')).length,1);
   assert.equal(calls.length,2);assert.match(result.note,/Cancelled/);
   if(phase==='abort-failure')assert.match(result.note,/remote Actor termination could not be confirmed/);
  }
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});

test('Yelp only scrapes observed US listing URLs and never starts its broken native search',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';
 try{
  const target={name:'KFC',address:'242 E 14th St, New York, NY 10003',listing_url:'',website_url:''};let input;
  const skipped=await collectApify('yelp',target,undefined,()=>{throw Error('Native search must not start');});assert.equal(skipped.status,'skipped');
  await collectApify('yelp',{...target,listing_url:'https://www.yelp.com/biz/fixture'},undefined,async(url,options)=>{
   if(options.method==='POST'){input=JSON.parse(options.body);return Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'data'}});}
   return Response.json([]);
  });
  assert.deepEqual(input.directUrls,['https://www.yelp.com/biz/fixture']);assert.equal(input.searchTerms,undefined);
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});

test('Actor SUCCEEDED with all requests failed is an error rather than an empty search',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';
 try{
  const r=await collectApify('yelp',{name:'KFC',address:'New York',listing_url:'https://www.yelp.com/biz/fixture',website_url:''},undefined,async(url,options)=>options.method==='POST'?Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'data',statusMessage:'Finished! Total 1 requests: 0 succeeded, 1 failed.'}}):Response.json([]));
  assert.equal(r.status,'error');assert.match(r.note,/all requests failed/);
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});
test('dataset pagination preserves all arbitrary fields and original JSON types',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';
 const data=Array.from({length:100},(_,i)=>({id:i,unexpected:{a:[false,null,{'raw key':'1.2K reviews'}]},rating:4.5}));const calls=[];
 try{
 const r=await collectApify('yelp',{name:'Easy Joy',address:'145 Mulberry St',listing_url:'https://www.yelp.com/biz/fixture',website_url:'https://example.com'},undefined,async(url,options)=>{
  calls.push(url);assert.equal(options.headers.Authorization,'Bearer fixture');assert.ok(!url.includes('fixture'));
  if(options.method==='POST')return Response.json({data:{id:'run1',status:'SUCCEEDED',defaultDatasetId:'data1'}});
  return Response.json(url.includes('offset=0&')?data:[{more:'last record'}]);
 });assert.equal(r.status,'unverified');assert.equal(r.items.length,101);assert.deepEqual(r.items[0],data[0]);assert.equal(calls.length,3);assert.ok(calls[0].includes('maxTotalChargeUsd='));
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});
test('cancellation aborts an already-started remote Actor',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';const controller=new AbortController();let aborted=false;
 try{
  const r=await collectApify('yelp',{listing_url:'https://www.yelp.com/biz/fixture'},controller.signal,async(url)=>{
   if(url.includes('/abort?gracefully=false')){aborted=true;return Response.json({data:{}});}
   controller.abort();return Response.json({data:{id:'run1',status:'RUNNING'}});
  });assert.equal(r.status,'cancelled');assert.equal(aborted,true);
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});

test('Chinese names reject a different restaurant even at the same address',()=>{
 const target={name:'喜悦火锅',address:'145 Mulberry St, New York, NY 10013'};
 assert.equal(identityConflict([{name:'喜悦火锅',address:'145 Mulberry Street, New York, NY 10013'}],target),false);
 assert.equal(identityConflict([{name:'另一家火锅',address:target.address}],target),true);
 assert.equal(identityConflict([{name:target.name,address:'146 Mulberry St, New York, NY 10013'}],target),true);
});
test('mixed Chinese/English names retain Unicode and fold full-width characters',()=>{
 const target={name:'喜悦 Ｅａｓｙ Joy',address:'145 Mulberry St, New York, NY 10013'};
 assert.equal(identityConflict([{name:'喜悦 Easy Joy',address:target.address}],target),false);
 assert.equal(identityConflict([{name:'喜悦 Other Restaurant',address:target.address}],target),true);
 assert.equal(identityConflict([{name:'喜悦 Easy Different',address:target.address}],target),true);
});

test('Google Place ID uses native Actor input without generic Maps search URL or name search',async()=>{
 const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';let input;
 try{
  await collectApify('google_maps',{name:'',address:'145 Mulberry St',website_url:'',place_id:'ChIJhRc3tYlZwokRbR4dwpc-0qI',listing_url:'https://www.google.com/maps/search/?api=1&query_place_id=ChIJhRc3tYlZwokRbR4dwpc-0qI&query=restaurant'},undefined,async(url,options)=>{
   if(options.method==='POST'){input=JSON.parse(options.body);return Response.json({data:{id:'fixture',status:'SUCCEEDED',defaultDatasetId:'fixture'}});}
   return Response.json([]);
  });
  assert.deepEqual(input.placeIds,['ChIJhRc3tYlZwokRbR4dwpc-0qI']);
  assert.equal(input.startUrls,undefined);assert.equal(input.searchStringsArray,undefined);
 }finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}
});
