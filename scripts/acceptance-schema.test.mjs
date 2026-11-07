import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {emptyListing,platformGroups} from '../dist/backend/public.js';
import {channels} from '../dist/backend/menu-audit/public.js';

test('acceptance helper validates historical eight-platform and current ten-platform outputs without altering originals',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-acceptance-schema-'));
 try{
  await mkdir(join(root,'snapshots'));await mkdir(join(root,'details'));
  await writeFile(join(root,'manifest.json'),JSON.stringify({stores:[{id:'fixture',status:'partial'}]}));
  await writeFile(join(root,'details/fixture.json'),JSON.stringify({coverage:channels.map(channel=>({channel,status:'not_checked',attempts:[]})),menus:[],hours:[]}));
  const current=[...platformGroups.listings,...platformGroups.profiles].map(p=>emptyListing(p,'Synthetic fixture only.'));
  const legacy=current.slice(0,8).map(({rating_raw,...row})=>row);
  for(const rows of [legacy,current]){
   await writeFile(join(root,'snapshots/fixture.json'),JSON.stringify(rows));
   const result=spawnSync(process.execPath,['scripts/validate-acceptance.mjs',root],{encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);assert.match(result.stdout,new RegExp(rows.length+' platform records'));
  }
  await writeFile(join(root,'snapshots/fixture.json'),JSON.stringify(current.map((r,i)=>i? r:{...r,unexpected:'not permitted'})));
  const bad=spawnSync(process.execPath,['scripts/validate-acceptance.mjs',root],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
