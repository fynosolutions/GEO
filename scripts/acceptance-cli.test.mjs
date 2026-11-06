import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {runWeekly,platforms} from '../dist/backend/weekly/public.js';
const execute=promisify(execFile);
const script=name=>fileURLToPath(new URL(name,import.meta.url));
test('manual cloud acceptance entry preserves source data and summarizes partial coverage honestly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'acceptance-cli-'));
 try{
  const store={id:'020',name:'Synthetic Cafe',address:'1 Fixture St',place_id:null};
  const records=platforms.map(platform=>({platform,found:true,matched:true,url:'https://example.com/fixture',name:store.name,address:store.address,phone:'2125550100',hours:null,rating:4,review_count:10,price_level:null,fetched_at:new Date().toISOString(),error:null}));
  const source=await runWeekly({root:join(root,'history'),stores:[store],runId:'source',collect:async()=>({records,menu_error:'Synthetic incomplete coverage'})});
  const original=await readFile(join(source.runDir,'snapshots/020.json'),'utf8');
  const out=join(root,'phone');
  await execute(process.execPath,[script('acceptance-phone-change.mjs'),'--latest-history',join(root,'history'),out],{env:{...process.env,GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'fixture-run'}});
  assert.match(await readFile(join(out,'diff.md'),'utf8'),/google_maps.*phone.*2125550100.*2125550101.*IMPORTANT/);
  assert.equal(await readFile(join(source.runDir,'snapshots/020.json'),'utf8'),original);
  const meta=JSON.parse(await readFile(join(out,'execution.json'),'utf8'));assert.equal(meta.synthetic,true);assert.equal(meta.extra_actor_calls,0);assert.equal(meta.environment,'github-actions');
  const summary=join(root,'summary.md');
  await execute(process.execPath,[script('summarize-history.mjs'),join(root,'history'),'workflow_dispatch'],{env:{...process.env,GITHUB_STEP_SUMMARY:summary}});
  const text=await readFile(summary,'utf8');assert.match(text,/020.*partial.*8\/8/);assert.match(text,/does not mean every platform/);
  assert.equal(JSON.parse(await readFile(join(root,'history/manual/indexes/latest.json'),'utf8')).run_id,'source');
 }finally{await rm(root,{recursive:true,force:true});}
});
