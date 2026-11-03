import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapItem,mapApify,collectRestaurant,matchesIdentity,resolveGoogle} from '../dist/backend/collection.js';

test('mapping preserves original types, strings, nested addresses and hours',()=>{
 const hours=[{day:'Monday',hours:'09:00-17:00'}],address={addressLine1:'145 Mulberry St',city:'New York',regionCode:'NY',postalCode:'10013'};
 const raw={title:' Easy Joy ',address,phoneNumber:'(347) 913-0454',operationHours:hours,rating:'4.5',reviewCount:'84',priceRange:'$$$'};
 const r=mapItem('yelp',raw);
 assert.deepEqual(Object.keys(r),['platform','found','url','name','address','phone','hours','rating','review_count','price_level','fetched_at','error']);
 assert.equal(r.name,raw.title);assert.deepEqual(r.address,address);assert.deepEqual(r.hours,hours);assert.equal(r.phone,raw.phoneNumber);assert.equal(r.rating,'4.5');assert.equal(r.review_count,'84');assert.equal(r.price_level,'$$$');
 assert.equal(mapItem('google_maps',{title:'Cafe',totalScore:0,reviewsCount:0,priceLevel:2}).rating,0);assert.equal(mapItem('google_maps',{priceLevel:2}).price_level,2);
});
test('different provider representations remain different in the exported fields',()=>{
 const a=mapItem('facebook',{name:'Cafe',address:'145 Mulberry St',business_hours:'Closed now',rating:'94% recommend (839 Reviews)',ratingCount:839});
 const b=mapItem('doordash',{restaurant:{name:'Cafe',location:{address:{display_address:'145 Mulberry St'}},rating:{average:4.5,count:10}}});
 assert.equal(a.hours,'Closed now');assert.deepEqual(b.address,{display_address:'145 Mulberry St'});assert.deepEqual(b.rating,{average:4.5,count:10});assert.equal(a.rating,'94% recommend (839 Reviews)');assert.equal(b.review_count,10);
});
test('private address comparison does not alter Yelp source data',()=>{
 const address={formatted:'145 Mulberry St\nLittle Italy\nNew York, NY 10013',addressLine1:'145 Mulberry St'};
 const source={title:'Easy Joy Dim Sum & AYCE Hot Pot',address,operationHours:{Mon:'10:00 AM - 10:30 PM'},url:'https://www.yelp.com/biz/easy-joy'};
 const r=mapApify('yelp',{status:'unverified',items:[source],collected_at:new Date().toISOString()},{name:'Easy Joy (Hot Pot, BBQ Skewers, Dim Sum) 意中人火锅烧烤点心',address:'145 Mulberry Street, New York, NY 10013'});
 assert.equal(r.found,true);assert.deepEqual(r.address,address);assert.deepEqual(r.hours,source.operationHours);
});
test('wrong branch and ambiguous datasets cannot become found records',()=>{
 const base={status:'unverified',collected_at:new Date().toISOString(),note:'',items:[]};
 const target={name:'Cafe',address:'1 Main St'};
 assert.equal(mapApify('yelp',{...base,items:[{name:'Other',address:'9 Wrong St'}]},target).found,false);
 assert.match(mapApify('yelp',{...base,items:[{name:'Cafe',address:'1 Main St',url:'https://www.yelp.com/biz/cafe'},{name:'Cafe',address:'1 Main St',url:'https://www.yelp.com/biz/cafe'}]},target).error,/Ambiguous/);
});
test('disabled providers save one aggregate output containing all eight records',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-collection-'));
 const keys=['APIFY_ENABLED','BROWSER_FALLBACK','COLLECTION_DATA_DIR','OUTPUT_DIR'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{APIFY_ENABLED:'false',BROWSER_FALLBACK:'false',COLLECTION_DATA_DIR:join(directory,'records'),OUTPUT_DIR:join(directory,'out')});
 try{
  const result=await collectRestaurant({name:'Test Cafe'});assert.equal(result.records.length,8);
  for(const r of result.records){assert.equal(r.found,false);assert.ok(r.error);}
  assert.equal(JSON.parse(await readFile(join(directory,'out','Test Cafe.json'),'utf8')).length,8);
  const second=await collectRestaurant({name:'Test Cafe'});assert.notEqual(result.directory,second.directory);assert.equal((await readdir(join(directory,'records'))).length,2);
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];await rm(directory,{recursive:true,force:true});}
});
