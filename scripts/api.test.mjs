import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';

test('local UI needs no login and downloads the actual single output file; old input/routes are removed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'geo-api-'));
 const child=spawn(process.execPath,['dist/backend/server.js'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',GEO_API_TOKEN:'',APIFY_TOKEN:'fixture-only',APIFY_ENABLED:'false',BROWSER_FALLBACK:'false',AUDIT_DATA_DIR:join(directory,'jobs'),COLLECTION_DATA_DIR:join(directory,'data'),OUTPUT_DIR:join(directory,'out')},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('Server exited')));});
  assert.equal((await fetch(base+'/api/session')).status,200);
  const foreignHostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/health',{headers:{Host:'other.example'}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);req.end();});
  assert.equal(foreignHostStatus,403);
  const post=input=>fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal((await post({url:'https://example.com'})).status,400);
  assert.equal((await post({name:'Cafe',place_id:'some-id'})).status,400);
  const denied=await fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify({name:'Cafe'})});assert.equal(denied.status,403);
  const submitted=await post({name:"Fixture's Café"});assert.equal(submitted.status,202);const {id}=await submitted.json();
  let job;
  for(let i=0;i<100;i++){job=await (await fetch(`${base}/api/audits/${id}`)).json();if(!['running','cancelling'].includes(job.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(job.status,'partial');assert.equal(job.filename,"Fixture's Café.json");
  const response=await fetch(`${base}/api/audits/${id}/output.json`);assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/Fixture%27s%20Caf%C3%A9\.json/);
  assert.equal(await response.text(),await readFile(job.output_file,'utf8'));
  for(const path of ['official.json','toast.json','yelp.json','restaurant.json','screenshots/yelp.browser.png'])assert.equal((await fetch(`${base}/api/audits/${id}/${path}`)).status,404);
  assert.equal((await fetch(base+'/js/comparison.js')).status,404);
 }finally{child.kill();await once(child,'exit');await rm(directory,{recursive:true,force:true});}
});
