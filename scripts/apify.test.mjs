import {matchesIdentity,mapItem} from '../dist/backend/collection.js';
const identityConflict=(items,target)=>!matchesIdentity(mapItem('google_maps',items[0]),target);
import test from 'node:test';import assert from 'node:assert/strict';
import {collectApify,expandInput} from '../dist/backend/apify.js';
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
   if(url.endsWith('/abort')){aborted=true;return Response.json({data:{}});}
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
