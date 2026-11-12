import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectRestaurant,matchesIdentity,mapItem,mapApify,resolveGoogle,safeName} from '../dist/backend/collection.js';
const item={title:'Fixture Cafe',address:'123 Main St, Test City, NY 10001',phone:'+1 212 555 0100',url:'https://www.google.com/maps/place/fixture',placeId:'fixture-place-id'};
const result=items=>({status:'unverified',items,collected_at:new Date().toISOString(),note:'',actor:'fixture',run_id:'fixture',dataset_id:'fixture',truncated:false,target:{}});
test('filenames are portable without normalizing original merchant names',()=>{
 assert.equal(safeName('CON'),'_CON');assert.equal(safeName('Cafe / Restaurant'),'Cafe _ Restaurant');assert.equal(safeName('Ｆｏｏ Café'),'Ｆｏｏ Café');
});

test('identity requires two matching facts and rejects wrong streets',()=>{
 const target={name:item.title,address:item.address,phone:item.phone};
 assert.equal(matchesIdentity(mapItem('yelp',{name:item.title}),target),false);
 assert.equal(matchesIdentity(mapItem('yelp',{name:item.title,address:'123'}),target),false);
 assert.equal(matchesIdentity(mapItem('yelp',{name:item.title,address:'124 Main St, Test City, NY 10001',phone:item.phone}),target),false);
 assert.equal(matchesIdentity(mapItem('yelp',{name:item.title,phone:item.phone}),target),true);
 assert.equal(matchesIdentity(mapItem('yelp',{name:item.title,address:'123 Main Street, Test City, NY 10001'}),target),true);
});
test('Google resolution rejects ambiguous names and a different place ID',()=>{
 assert.equal(resolveGoogle(result([item,{...item,address:'124 Main St'}]),{name:'Fixture Cafe'}).found,false);
 assert.equal(resolveGoogle(result([item]),{place_id:'other-id'}).found,false);
});
test('DoorDash nested values and observed source URL survive identity validation unchanged',()=>{
 const rating={average:4.5,count:10,display_string:'10'},address={display_address:item.address,street:'123 Main St'};
 const raw={...result([{restaurant:{id:'12345',name:item.title,location:{address},rating}}]),target:{listing_url:'https://www.doordash.com/store/fixture-cafe-12345/'}};
 const r=mapApify('doordash',raw,{name:item.title,address:item.address});assert.equal(r.found,true);assert.deepEqual(r.address,address);assert.deepEqual(r.rating,rating);assert.equal(r.url,raw.target.listing_url);
 raw.target.listing_url='https://www.doordash.com/store/other-99999/';assert.equal(mapApify('doordash',raw,{name:item.title,address:item.address}).found,false);
});
test('Facebook p/ pages match brand aliases without overwriting a differing source phone',()=>{
 const phone='(646) 398-9113',hours='Closed now';
 const r=mapApify('facebook',result([{title:'Easy Joy Buffet | New York NY',address:'145 Mulberry St, New York, NY, United States, 10013',phone,pageUrl:'https://www.facebook.com/p/Easy-Joy-Buffet-61579381037917/',business_hours:hours}]),{name:'Easy Joy (Hot Pot, BBQ Skewers, Dim Sum) 意中人火锅烧烤点心',address:'145 Mulberry St, New York, NY 10013',phone:'(929) 243-6130'});
 assert.equal(r.found,true);assert.equal(r.phone,phone);assert.equal(r.hours,hours);
});
test('Facebook URLs, ratings and rating counts map without interpreting followers as reviews',()=>{
 const r=mapItem('facebook',{title:item.title,address:item.address,pageUrl:'https://www.facebook.com/fixturecafe',rating:'94% recommend (839 Reviews)',ratingOverall:94,ratingCount:839,followers:99999});
 assert.equal(r.rating,'94% recommend (839 Reviews)');assert.equal(r.review_count,839);assert.equal(r.url,'https://www.facebook.com/fixturecafe');
 assert.equal(mapItem('facebook',{title:'Fixture',followers:99999}).review_count,null);
 assert.equal(mapApify('facebook',result([{...item,pageUrl:'https://evil.example',url:'https://evil.example'}]),{name:item.title,address:item.address}).found,false);
});
test('name and place-ID inputs produce the same ten-record file contract; platform exceptions are isolated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'geo-output-'));const keys=['OUTPUT_DIR','COLLECTION_DATA_DIR','BROWSER_FALLBACK'];const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{OUTPUT_DIR:join(dir,'out'),COLLECTION_DATA_DIR:join(dir,'data'),BROWSER_FALLBACK:'false'});
 const calls=[];const apify=async(platform,target)=>{
  calls.push({platform,target:{...target}});
  if(platform==='google_maps')return result([item]);
  if(platform==='_discovery')return result([{organicResults:[{url:'https://www.yelp.com/biz/fixturecafe'}]}]);
  if(platform==='yelp')throw Error('Fixture provider failure.');
  if(platform==='facebook')return result([{title:item.title,address:item.address,pageUrl:'https://www.facebook.com/fixturecafe',rating:'4.5 (12 Reviews)',ratingCount:12}]);
  return {...result([]),status:'empty'};
 };
 try{
  for(const input of [{name:'Fixture Cafe'},{place_id:'fixture-place-id'},{name:'https://fixture.example/'}]){
   const wrapped=async(platform,target)=>platform==='google_maps'&&input.name?.startsWith('https:')?result([{...item,website:'https://fixture.example/'}]):apify(platform,target);
   const r=await collectRestaurant(input,undefined,undefined,{apify:wrapped,browser:async()=>{throw Error('Browser must never be invoked.');}});
   assert.equal(r.filename,'Fixture Cafe.json');assert.equal(r.output_file,join(dir,'out','information','Fixture Cafe.json'));
   const json=JSON.parse(await readFile(r.output_file,'utf8'));assert.equal(json.length,10);assert.equal(json.find(v=>v.platform==='facebook').found,true);assert.match(json.find(v=>v.platform==='yelp').error,/Fixture provider failure/);
   assert.deepEqual(json.map(v=>v.platform),['google_maps','yelp','tripadvisor','opentable','doordash','uber_eats','grubhub','facebook','resy','instagram']);
   assert.deepEqual(Object.keys(json[0]),['platform','found','matched','url','name','address','phone','hours','rating_raw','rating','review_count','price_level','fetched_at','error']);
   assert.match(json.find(v=>v.platform==='opentable').error,/No matching public listing/);assert.equal(json[0].matched,true);
  }
  assert.deepEqual(await readdir(join(dir,'out','information')),['Fixture Cafe.json']);assert.equal(calls.filter(v=>v.platform==='google_maps').length,2);assert.equal(calls.filter(v=>v.platform==='google_maps')[1].target.place_id,'fixture-place-id');
  const controller=new AbortController();
  const cancelled=await collectRestaurant({name:'Fixture Cafe'},controller.signal,async r=>{if(r.platform==='google_maps')controller.abort();},{apify});
  assert.equal(cancelled.records[0].found,true);assert.ok(cancelled.records.slice(1).every(r=>r.found===false&&r.error==='Cancelled.'));
  await assert.rejects(collectRestaurant({place_id:'unresolved'},undefined,undefined,{apify:async()=>({...result([]),status:'empty'})}),/resolution/);
  assert.deepEqual(await readdir(join(dir,'out','information')),['Fixture Cafe.json']);
 }finally{for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];await rm(dir,{recursive:true,force:true});}
});

test('Grubhub Catering listing cannot stand in for a normal restaurant at the same address',()=>{
 const catering={name:'Fixture Cafe - Catering',address:item.address,url:'https://www.grubhub.com/restaurant/fixture-cafe---catering-123-main/1234'};
 assert.equal(mapApify('grubhub',result([catering]),{name:'Fixture Cafe',address:item.address}).matched,false);
 assert.equal(mapApify('grubhub',result([catering]),{name:'Fixture Cafe Catering',address:item.address}).matched,true);
 const normal={...catering,name:'Fixture Cafe',url:'https://www.grubhub.com/restaurant/fixture-cafe-123-main/1235'};
 assert.equal(mapApify('grubhub',result([catering,normal]),{name:'Fixture Cafe',address:item.address}).url,normal.url);
});
test('mobile Yelp discovery is accepted and canonicalized before Actor input',async()=>{
 const {isListingCandidate}=await import('../dist/backend/browser.js');
 assert.equal(isListingCandidate('https://m.yelp.com/biz/fixture-cafe','yelp'),true);
 const root=await mkdtemp(join(tmpdir(),'mobile-yelp-'));const old=process.env.OUTPUT_DIR,oldData=process.env.COLLECTION_DATA_DIR;
 process.env.OUTPUT_DIR=join(root,'out');process.env.COLLECTION_DATA_DIR=join(root,'data');const calls=[];
 try{
  const apify=async(platform,target)=>{
   calls.push({platform,target});
   if(platform==='google_maps')return result([item]);
   if(platform==='_discovery')return result([{organicResults:[{url:'https://m.yelp.com/biz/fixture-cafe'}]}]);
   return result([{...item,name:item.title,url:target.listing_url}]);
  };
  const data=await collectRestaurant({name:item.title,address:item.address,platforms:['yelp']},undefined,undefined,{apify});
  assert.equal(data.records[0].matched,true);
  assert.equal(calls.find(c=>c.platform==='yelp').target.listing_url,'https://www.yelp.com/biz/fixture-cafe');
 }finally{for(const [k,v] of [['OUTPUT_DIR',old],['COLLECTION_DATA_DIR',oldData]])if(v===undefined)delete process.env[k];else process.env[k]=v;await rm(root,{recursive:true,force:true});}
});
