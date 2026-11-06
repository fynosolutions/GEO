import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {runWeekly} from '../dist/backend/weekly/public.js';
const args=process.argv.slice(2);let run;
if(args[0]==='--latest-history'){
 if(!args[1])throw Error('Provide the history root.');
 const pointer=JSON.parse(await readFile(join(resolve(args[1]),'manual/indexes/latest.json'),'utf8'));
 assert.match(pointer.run_id,/^[a-zA-Z0-9_-]+$/);assert.equal(pointer.path,'runs/'+pointer.run_id);
 run=join(resolve(args[1]),'manual/runs',pointer.run_id);
}else {if(!args[0])throw Error('Usage: acceptance-phone-change.mjs RAW_RUN_DIRECTORY [OUTPUT_DIRECTORY] | --latest-history HISTORY_ROOT OUTPUT_DIRECTORY');run=resolve(args[0]);}
const root=resolve(args[args[0]==='--latest-history'?2:1]||'samples/issue5/phone-change');
const original=JSON.parse(await readFile(join(run,'manifest.json'),'utf8')),stores=original.stores.map(({id,name,address,place_id,website})=>({id,name,address,place_id,website}));
await mkdir(root,{recursive:true});await copyFile(join(run,'manifest.json'),join(root,'source-manifest.json'));
const source=new Map(await Promise.all(stores.map(async s=>[s.id,JSON.parse(await readFile(join(run,'snapshots',s.id+'.json'),'utf8'))])));
const now=new Date(),id='baseline-'+now.getTime();
const baseline=await runWeekly({root:join(root,'history'),stores,runId:id,now,collect:async s=>structuredClone(source.get(s.id))});
const before=await readFile(join(baseline.runDir,'snapshots',stores[0].id+'.json'),'utf8');
const altered=structuredClone(source.get(stores[0].id));const r=altered.find(r=>r.platform==='google_maps');assert.equal(typeof r.phone,'string');
const realPhone=r.phone;r.phone=r.phone.replace(/\d(?=\D*$)/,d=>String((Number(d)+1)%10));assert.notEqual(r.phone,realPhone);
const change=await runWeekly({root:join(root,'history'),stores,runId:'changed-'+now.getTime(),compareRun:id,now,collect:async s=>structuredClone(s.id===stores[0].id?altered:source.get(s.id))});
assert.match(change.report,/\| google_maps \| phone \|.*IMPORTANT/);
assert.equal(await readFile(join(baseline.runDir,'snapshots',stores[0].id+'.json'),'utf8'),before);
await writeFile(join(root,'README.md'),'# Controlled phone-change acceptance\n\nThis is an offline replay of real collected snapshots, with ONE deliberate synthetic Google phone change for store '+stores[0].id+'. It makes no platform edits, no paid requests and no claim that the real business phone changed. Source run: '+original.run_id+'.\n\nOriginal: '+realPhone+'; synthetic: '+r.phone+'.\n\nBaseline: '+id+'; comparison: '+change.manifest.run_id+'. The original input and baseline are unchanged; the diff marks the phone change IMPORTANT. This is controlled replay acceptance, not a new platform observation or two-week schedule acceptance.\n');
await writeFile(join(root,'execution.json'),JSON.stringify({environment:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local',github_run_id:process.env.GITHUB_RUN_ID??null,source_run:original.run_id,baseline_run:id,comparison_run:change.manifest.run_id,synthetic:true,extra_actor_calls:0},null,2)+'\n');
await copyFile(join(change.runDir,'diff.md'),join(root,'diff.md'));console.log(root);
