import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectRestaurant} from '../dist/backend/public.js';
const google={title:'Fixture Cafe',address:'123 Main St, Test City, NY 10001',phone:'2125550100',url:'https://www.google.com/maps/place/fixture'};
const result=items=>({status:items.length?'unverified':'empty',items,collected_at:new Date().toISOString(),actor:'fixture',run_id:'fixture',dataset_id:'fixture',note:'',truncated:false,target:{}});
test('selected-only collection uses Google identity and emits matched:false without leaking a different business',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-select-'));const previous={OUTPUT_DIR:process.env.OUTPUT_DIR,COLLECTION_DATA_DIR:process.env.COLLECTION_DATA_DIR};
 process.env.OUTPUT_DIR=join(directory,'out');process.env.COLLECTION_DATA_DIR=join(directory,'data');
 try{
  const calls=[];const apify=async(key,target)=>{calls.push({key,target:{...target}});if(key==='google_maps')return result([google]);if(key==='_discovery')return result([]);return result([{name:'Other Business',address:'999 Wrong St, Another City, NY 10002',phone:'9995550100',url:'https://www.yelp.com/biz/other'}]);};
  const input={name:'Fixture Cafe',address:google.address,platforms:['yelp']};
  const collected=await collectRestaurant(input,undefined,undefined,{apify});
  assert.deepEqual(calls.map(v=>v.key),['google_maps','_discovery','_discovery']);assert.equal(calls[0].target.name,input.name);assert.equal(calls[0].target.address,input.address);
  assert.match(calls[1].target.queries,/site:yelp.com/);assert.ok(calls[1].target.queries.includes(google.address));assert.ok(!calls[1].target.queries.includes('facebook.com'));
  const records=JSON.parse(await readFile(collected.output_file,'utf8'));assert.equal(records.length,1);assert.equal(records[0].platform,'yelp');assert.equal(records[0].matched,false);assert.equal(records[0].found,false);
  for(const key of ['url','name','address','phone','hours','rating','review_count','price_level'])assert.equal(records[0][key],null);
  assert.ok(!JSON.stringify(records).includes('Other Business'));
  calls.length=0;const onlyGoogle=await collectRestaurant({...input,platforms:['google_maps']},undefined,undefined,{apify});assert.deepEqual(calls.map(v=>v.key),['google_maps']);assert.equal(onlyGoogle.records.length,1);assert.equal(onlyGoogle.records[0].matched,true);
  calls.length=0;await assert.rejects(collectRestaurant({...input,platforms:[]},undefined,undefined,{apify}),/Select at least/);await assert.rejects(collectRestaurant({...input,platforms:['unknown']},undefined,undefined,{apify}),/Select at least/);assert.equal(calls.length,0);
  calls.length=0;const ambiguous=await collectRestaurant({name:'Fixture Cafe',platforms:['yelp']},undefined,undefined,{apify:async key=>{calls.push({key});return result([google,{...google,address:'124 Main St, Test City, NY 10001'}]);}});
  assert.deepEqual(calls.map(v=>v.key),['google_maps']);assert.equal(ambiguous.records[0].matched,false);assert.equal(ambiguous.records[0].name,null);
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(directory,{recursive:true,force:true});}
});

test('Yelp rejects a discovered wrong branch then searches with the full Google address',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-yelp-retry-'));const previous={OUTPUT_DIR:process.env.OUTPUT_DIR,COLLECTION_DATA_DIR:process.env.COLLECTION_DATA_DIR};
 process.env.OUTPUT_DIR=join(directory,'out');process.env.COLLECTION_DATA_DIR=join(directory,'data');
 try{
  const anchor={...google,title:'KFC',address:'408 8th Ave, New York, NY 10001',phone:'3323458424'};
  const wrong={name:'KFC',address:'1027 8th Ave N, Nashville, TN 37208',phone:'6152561069',url:'https://www.yelp.com/biz/kfc-nashville-6'};
  const correct={name:'KFC',address:anchor.address,phone:anchor.phone,url:'https://www.yelp.com/biz/kfc-new-york-fixture'};
  for(const succeeds of [true,false]){
   const calls=[];let discoveries=0;
   const apify=async(key,target)=>{
    calls.push({key,target:{...target}});
    if(key==='google_maps')return result([anchor]);
    if(key==='_discovery'){assert.ok(target.queries.includes(anchor.address));discoveries++;if(discoveries===1){assert.ok(target.queries.includes(anchor.phone));return result([{organicResults:[{url:wrong.url}]}]);}return result([{organicResults:succeeds?[{url:wrong.url+'?duplicate=1'},{url:correct.url.replace('www.yelp.com','m.yelp.com')}]:[]}]);}
    assert.equal(target.address,anchor.address);assert.equal(target.name,'KFC');
    if(target.listing_url===wrong.url)return result([wrong]);
    if(target.listing_url===correct.url)return result([correct]);
    throw Error('Unexpected Yelp candidate');
   };
   const collected=await collectRestaurant({name:'KFC',address:anchor.address,platforms:['yelp']},undefined,undefined,{apify});
   assert.deepEqual(calls.map(v=>v.key),succeeds?['google_maps','_discovery','yelp','_discovery','yelp']:['google_maps','_discovery','yelp','_discovery']);
   assert.equal(collected.records[0].matched,succeeds);assert.equal(collected.records[0].address,succeeds?anchor.address:null);
   assert.ok(!JSON.stringify(collected.records).includes('Nashville'));
  }
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(directory,{recursive:true,force:true});}
});

test('Yelp verifies at most three different candidates, stops on success, and keeps the Google target',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-yelp-limit-'));const previous={OUTPUT_DIR:process.env.OUTPUT_DIR,COLLECTION_DATA_DIR:process.env.COLLECTION_DATA_DIR};
 process.env.OUTPUT_DIR=join(directory,'out');process.env.COLLECTION_DATA_DIR=join(directory,'data');
 try{
  const urls=[1,2,3,4].map(n=>`https://www.yelp.com/biz/kfc-fixture-${n}`);
  for(const successAt of [1,2,3,0]){
   const details=[];let searches=0,active=0,peak=0;
   const apify=async(key,target)=>{
    if(key==='google_maps')return result([google]);
    if(key==='_discovery')return result([{organicResults:[urls[0],`${urls[0]}?tracking=duplicate`,urls[1],urls[2],urls[3]].map(url=>({url}))}]);
    assert.equal(target.address,google.address);assert.equal(target.name,google.title);
    if(!target.listing_url){searches++;return result([]);}
    details.push(target.listing_url);
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
    if(details.length===successAt)return result([{name:google.title,address:google.address,phone:google.phone,url:target.listing_url}]);
    return result([{name:google.title,address:'999 Wrong St, Nashville, TN 37208',phone:'6152561069',url:target.listing_url}]);
   };
   const collected=await collectRestaurant({name:google.title,address:google.address,platforms:['yelp']},undefined,undefined,{apify});
   assert.deepEqual(details,urls.slice(0,successAt||3));assert.equal(searches,0);assert.equal(peak,1);assert.equal(active,0);
   assert.equal(collected.records[0].matched,successAt>0);
   if(!successAt){assert.match(collected.records[0].error,/conflicting street number/);for(const field of ['url','name','address','phone','hours','rating','review_count','price_level'])assert.equal(collected.records[0][field],null);}
  }
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(directory,{recursive:true,force:true});}
});
