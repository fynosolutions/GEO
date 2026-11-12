import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('jobs persist all ten records without OpenAI',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'geo-job-'));Object.assign(process.env,{AUDIT_DATA_DIR:join(dir,'jobs'),COLLECTION_DATA_DIR:join(dir,'records'),OUTPUT_DIR:join(dir,'out'),APIFY_ENABLED:'false',BROWSER_FALLBACK:'false'});
 const {startJob,getJob,isBusy}=await import('../dist/backend/audit.js');
 try{const job=await startJob({name:'Fixture'},'links');let done;
 for(let i=0;i<100;i++){done=await getJob(job.id);if(done.status!=='running'&&!isBusy())break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(isBusy(),false);
 assert.equal(done.status,'failed');assert.equal(done.menu_status,'not_started');assert.match(done.error,/Apify/);assert.equal(done.records.length,10);assert.equal(done.records.find(r=>r.platform==='facebook').found,false);assert.ok(!('platforms' in done));
 }finally{await rm(dir,{recursive:true,force:true});}
});
