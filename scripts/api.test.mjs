import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {request as httpRequest} from 'node:http';

test('local UI needs no login and downloads the actual single output file; old input/routes are removed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-api-'));
 const child=spawn(process.execPath,['dist/backend/server.js'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',GEO_API_TOKEN:'',APIFY_TOKEN:'fixture-only',APIFY_ENABLED:'false',BROWSER_FALLBACK:'false',AUDIT_DATA_DIR:join(directory,'jobs'),COLLECTION_DATA_DIR:join(directory,'data'),OUTPUT_DIR:join(directory,'out')},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('Server exited')));});
  assert.equal((await fetch(base+'/api/session')).status,200);
  assert.equal((await fetch(base+'/js/menu-results.js')).status,200);
  const priceAsset=await fetch(base+'/js/menu-price.js');assert.equal(priceAsset.status,200);assert.match(priceAsset.headers.get('content-type'),/javascript/);assert.match(await priceAsset.text(),/displayMenuPrice/);
  const foreignHostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/health',{headers:{Host:'other.example'}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);req.end();});
  assert.equal(foreignHostStatus,403);
  const post=(input,path='/api/check')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal((await post({url:'https://example.com'})).status,400);
  assert.equal((await post({name:'Cafe',place_id:'some-id'})).status,400);
  assert.equal((await post({name:'Cafe',menu_scope:'unknown'})).status,400);
  for(const platforms of [[],['unknown'],'yelp'])assert.equal((await post({name:'Cafe',platforms})).status,400);
  const denied=await fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify({name:'Cafe'})});assert.equal(denied.status,403);
  const submitted=await post({name:"Fixture's Café"});assert.equal(submitted.status,202);const {id}=await submitted.json();
  let job;
  for(let i=0;i<100;i++){job=await (await fetch(`${base}/api/audits/${id}`)).json();if(!['running','cancelling'].includes(job.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(job.status,'failed');assert.equal(job.filename,"Fixture's Café.json");
  assert.equal(dirname(job.output_file),join(directory,'out','information'));
  const response=await fetch(`${base}/api/audits/${id}/output.json`);assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/Fixture%27s%20Caf%C3%A9\.json/);
  assert.equal(await response.text(),await readFile(job.output_file,'utf8'));
  await writeFile(job.output_file,JSON.stringify([{name:'A different subsequent run'}]));
  assert.deepEqual(await (await fetch(`${base}/api/audits/${id}/output.json`)).json(),job.records);
  const report=await (await fetch(`${base}/api/audits/${id}/report.json`)).json();assert.equal(report.schema_version,'geo-report.v1');assert.deepEqual(report.platforms,job.records);assert.equal(report.menu,null);
  for(const path of ['official.json','toast.json','yelp.json','restaurant.json','screenshots/yelp.browser.png'])assert.equal((await fetch(`${base}/api/audits/${id}/${path}`)).status,404);
  assert.equal((await fetch(base+'/js/comparison.js')).status,404);
  for(const input of [{stores:[]},{stores:[{name:'Good'},{name:''}]},{stores:[{name:'Cafe'}],name:'Other'},{stores:[{name:'Cafe'}],menu_mode:'full'}])assert.equal((await post(input)).status,400);
  let batchResponse;
  for(let i=0;i<100;i++){batchResponse=await post({stores:'Fixture A | 1 Main St\nFixture B | 2 Main St',platforms:['yelp','instagram']});if(batchResponse.status!==429)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(batchResponse.status,202);const batchId=(await batchResponse.json()).id;
  for(let i=0;i<100;i++){job=await(await fetch(`${base}/api/audits/${batchId}`)).json();if(!['running','cancelling'].includes(job.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(job.batch.total,2);assert.equal(job.batch.completed,2);assert.equal(job.batch.stores.length,2);
  assert.equal(dirname(job.batch.directory),join(directory,'out','information','batches'));
  assert.match(basename(job.batch.directory),/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z - Collect Information$/);
  assert.deepEqual(Object.keys(job.batch.output_files),['store-001','store-002']);
  for(const store of job.batch.stores){
   const download=await fetch(`${base}/api/audits/${batchId}/stores/${store.id}.json`);assert.equal(download.status,200);
   assert.ok(download.headers.get('content-disposition').includes(encodeURIComponent(store.filename)));
   const rows=await download.json();assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.platform),['yelp','instagram']);assert.ok(rows.every(r=>!r.found&&r.error&&!('input' in r)&&!('store_id' in r)));
  }
  assert.equal((await fetch(`${base}/api/audits/${batchId}/stores/unknown.json`)).status,404);
  assert.equal((await fetch(`${base}/api/audits/${batchId}/platforms/facebook.json`)).status,404);
  for (const input of [{ name: 'Fixture A' }, { stores: [{ name: 'Fixture A' }] }]) {
   let result;
   for (let i=0;i<100;i++) {
    result=await post({ ...input, platforms: ['google_maps'] },'/api/introduction');
    if(result.status!==429) break;
    await new Promise(r=>setTimeout(r,20));
   }
   assert.equal(result.status,202);
   const { id: introductionId } = await result.json();
   for (let i=0;i<100;i++) {
    job=await(await fetch(`${base}/api/audits/${introductionId}`)).json();
    if(!['running','cancelling'].includes(job.status)) break;
    await new Promise(r=>setTimeout(r,20));
   }
   const [store] = job.introduction.stores;
   const outputFolder = dirname(store.output_file);
   const introductionRoot = join(directory,'out','introductions');
   if ('stores' in input) {
    assert.equal(dirname(outputFolder),join(introductionRoot,'batches'));
    assert.match(basename(outputFolder),/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z - Collect Introduction$/);
   } else {
    assert.equal(store.output_file,join(introductionRoot,'Fixture A.json'));
   }
   const download=await fetch(`${base}/api/audits/${introductionId}/stores/${store.id}.json`);
   assert.equal(download.status,200);
   assert.equal(await download.text(),await readFile(store.output_file,'utf8'));
   if (!('stores' in input)) {
    await writeFile(store.output_file,JSON.stringify([{platform:'A different subsequent run'}]));
    const historical = await fetch(`${base}/api/audits/${introductionId}/stores/${store.id}.json`);
    assert.deepEqual(await historical.json(),store.records);
   }
  }
 }finally{child.kill();await once(child,'exit');await rm(directory,{recursive:true,force:true});}
});
