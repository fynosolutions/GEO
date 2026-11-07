import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {collectBatch,parseStoreList} from '../dist/backend/batch.js';
import {emptyListing,collectRestaurant} from '../dist/backend/collection.js';

test('restaurant lists validate completely, support text/JSON/place IDs and distinguish same-name branches',()=>{
 assert.deepEqual(parseStoreList('Cafe | 1 Main St\nCafe | 2 Main St'),[{id:'store-001',name:'Cafe',address:'1 Main St'},{id:'store-002',name:'Cafe',address:'2 Main St'}]);
 assert.deepEqual(parseStoreList('\uFEFF[{"id":"by-id","place_id":"fixture-place","address":"1 Main St"}]'),[{id:'by-id',place_id:'fixture-place',address:'1 Main St'}]);
 for(const invalid of ['',[],{},'[{bad JSON',Array(21).fill({name:'Cafe'}),[{name:'Cafe'},{name:''}],[{name:'Cafe',place_id:'x'}],[{id:'../escape',name:'Cafe'}],[{id:'x',name:'A'},{id:'x',name:'B'}],'Cafe | St | extra'])assert.throws(()=>parseStoreList(invalid));
});

test('batch writes one single-store-format file per restaurant and continues after failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-batch-'));const calls=[];let active=0,peak=0;
 try{
  const stores=parseStoreList([{name:'Cafe',address:'1 Main St'},{place_id:'unresolved'},{name:'Cafe',address:'2 Main St'}]);
  const address={street:'1 Main St',raw:{line:'unchanged'}},rating={average:4.5,count:8};
  const collect=async(input,signal,onResult,options)=>{
   calls.push({input,options});active++;peak=Math.max(peak,active);
   try{
    assert.deepEqual(input.platforms,['yelp','instagram']);await new Promise(resolve=>setTimeout(resolve,5));
    if(input.place_id)throw Error('Google could not resolve the supplied place ID.');
    const records=[{...emptyListing('yelp'),found:true,matched:true,name:'Cafe',address,rating,review_count:8},emptyListing('instagram','Candidate listing found, but matched:false. Address and phone unavailable.')];
    for(const r of records)await onResult(r);
    return {records,name:'Cafe'};
   }finally{active--;}
  };
  const result=await collectBatch({stores,platforms:['instagram','yelp']},undefined,undefined,{collect,outputRoot:join(root,'out'),dataRoot:join(root,'private')});
  assert.equal(calls.length,3);assert.equal(peak,1);assert.equal(result.completed,3);
  assert.equal((await readdir(result.directory)).length,3);
  const files=await Promise.all(stores.map(s=>readFile(result.output_files[s.id],'utf8').then(JSON.parse)));
  assert.ok(files.every(rows=>rows.length===2));
  assert.deepEqual(files[0][0].address,address);assert.deepEqual(files[0][0].rating,rating);
  assert.equal(files[1][0].name,null);assert.equal(files[1][0].matched,false);assert.match(files[1][0].error,/place ID/);
  for(const records of files){assert.deepEqual(records.map(r=>r.platform),['yelp','instagram']);assert.ok(records.every(r=>!('input' in r)&&!('store_id' in r)));assert.equal(Object.hasOwn(records[1],'rating'),false);}
  assert.notEqual(result.output_files[stores[0].id],result.output_files[stores[2].id]);
  assert.equal(new Set(calls.map(c=>c.options.outputDirectory)).size,3);
  assert.equal(result.stores[1].status,'failed');assert.equal(result.stores[2].status,'partial');
  let started=false;
  await assert.rejects(collectBatch({stores:[{name:'Valid'},{name:''}]},undefined,undefined,{collect:async()=>{started=true;},outputRoot:join(root,'invalid')}));assert.equal(started,false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Stop preserves completed records and never starts remaining stores',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-batch-stop-')),controller=new AbortController();let calls=0;
 try{
  const result=await collectBatch({stores:parseStoreList('First | 1 Main St\nSecond | 2 Main St'),platforms:['yelp','resy']},controller.signal,undefined,{outputRoot:root,collect:async(input,signal,onResult)=>{
   calls++;const yelp={...emptyListing('yelp'),found:true,matched:true,name:'First'};await onResult(yelp);controller.abort();
   return {name:'First',records:[yelp,emptyListing('resy','Cancelled.')]};
  }});
  assert.equal(calls,1);assert.ok(result.stores.every(s=>s.status==='cancelled'));
  const first=JSON.parse(await readFile(result.output_files['store-001'],'utf8')),second=JSON.parse(await readFile(result.output_files['store-002'],'utf8'));
  assert.equal(first[0].found,true);assert.ok(second.every(r=>!r.found&&/Cancelled before/.test(r.error)));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('CLI accepts a list and prints restaurant file paths without invoking paid collection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-batch-cli-'));
 try{
  const file=join(root,'stores.json');await writeFile(file,JSON.stringify([{name:'Fixture A'},{name:'Fixture B'}]));
  const child=spawnSync(process.execPath,['dist/backend/cli.js','--stores',file,'--platforms','yelp,instagram'],{encoding:'utf8',env:{...process.env,APIFY_ENABLED:'false',OUTPUT_DIR:join(root,'out'),COLLECTION_DATA_DIR:join(root,'providers')}});
  assert.equal(child.status,2,child.stderr);const paths=child.stdout.trim().split(/\r?\n/);assert.equal(paths.length,2);
  assert.ok(paths[0].endsWith('Fixture A.json'));assert.ok(paths[1].endsWith('Fixture B.json'));
  for(const path of paths){const rows=JSON.parse(await readFile(path,'utf8'));assert.equal(rows.length,2);assert.ok(rows.every(r=>!r.found&&r.error));}
 }finally{await rm(root,{recursive:true,force:true});}
});

test('batch resolves same-name branches independently and exports the original single-store array',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-batch-identities-')),calls=[];
 const prior=process.env.COLLECTION_DATA_DIR;process.env.COLLECTION_DATA_DIR=join(root,'providers');
 try{
  const raw=items=>({status:'unverified',actor:'fixture',run_id:'fixture',dataset_id:'fixture',items,collected_at:new Date().toISOString(),note:'',truncated:false});
  const apify=async(platform,target)=>{
   calls.push({platform,address:target.address});
   const number=target.address.startsWith('1 ')?'1':'2',url=`https://www.yelp.com/biz/cafe-${number}`;
   if(platform==='google_maps')return raw([{title:'Cafe',address:target.address,phone:'2125550100',url:`https://www.google.com/maps/place/cafe-${number}`}]);
   if(platform==='_discovery')return raw([{organicResults:[{url}]}]);
   assert.equal(platform,'yelp');return raw([{name:'Cafe',address:target.address,phone:'2125550100',url}]);
  };
  const result=await collectBatch({stores:parseStoreList('Cafe | 1 Main St, New York, NY 10001\nCafe | 2 Main St, New York, NY 10001'),platforms:['yelp']},undefined,undefined,{outputRoot:join(root,'out'),dataRoot:join(root,'private'),collect:(input,signal,onResult,options)=>collectRestaurant(input,signal,onResult,{...options,apify})});
  const rows=await Promise.all(Object.values(result.output_files).map(path=>readFile(path,'utf8').then(JSON.parse).then(records=>records[0])));
  assert.ok(rows.every(r=>r.matched));assert.notEqual(rows[0].address,rows[1].address);assert.notEqual(rows[0].url,rows[1].url);
  assert.deepEqual(calls.map(c=>c.platform),['google_maps','_discovery','yelp','google_maps','_discovery','yelp']);
  assert.equal((await readdir(result.directory)).length,2);
  assert.equal(new Set(Object.values(result.output_files).map(p=>p.toLowerCase())).size,2);
  assert.equal((await readdir(join(root,'private'))).length,1);
 }finally{if(prior===undefined)delete process.env.COLLECTION_DATA_DIR;else process.env.COLLECTION_DATA_DIR=prior;await rm(root,{recursive:true,force:true});}
});

test('six restaurants produce exactly six ten-platform arrays identical to their single-store results',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-six-stores-')),expected=[];
 try{
  const stores=Array.from({length:6},(_,index)=>({name:`Input ${index+1}`}));
  const result=await collectBatch({stores},undefined,undefined,{outputRoot:root,collect:async(input,signal,onResult)=>{
   const index=expected.length,name=index===5?'restaurant 1':`Restaurant ${index+1}`;
   assert.equal(input.platforms.length,10);
   const records=input.platforms.map(platform=>({...emptyListing(platform),found:true,matched:true,name,address:{original:'1 Main St'},...(platform==='instagram'?{followers:100,posts:5}:{})}));
   expected.push(records);return {name,records};
  }});
  const files=await readdir(result.directory);assert.equal(files.length,6);
  assert.equal(new Set(files.map(name=>name.toLowerCase())).size,6);
  for(let i=0;i<6;i++){
   const records=JSON.parse(await readFile(result.output_files[`store-${String(i+1).padStart(3,'0')}`],'utf8'));
   assert.deepEqual(records,expected[i]);assert.equal(records.length,10);
   assert.ok(records.every(r=>!('store_id' in r)&&!('input' in r)));
  }
  assert.ok(!files.some(file=>file.startsWith('Input')));
 }finally{await rm(root,{recursive:true,force:true});}
});
