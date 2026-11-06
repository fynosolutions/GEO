import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {platforms,storesFrom,collectionInputForStore,validateRecords,compare,runWeekly,businessDate,previousWeek} from '../dist/backend/weekly/public.js';
const stores=[{id:'sample-a',name:'Sample | <A>',address:'1 Main St',place_id:null},{id:'sample-b',name:'Sample B',address:'2 Main St',place_id:null}];
const records=()=>platforms.map(platform=>({platform,found:true,matched:true,url:'https://example.com',name:'Sample',address:{city:'NY',street:'1 Main St'},phone:'111',hours:{Mon:'9-5'},rating:4,review_count:100,price_level:null,fetched_at:'2026-11-02T11:00:00Z',error:null}));
const failed=()=>records().map(r=>({...r,found:false,error:'Unavailable'}));
const fixture=async fn=>{const root=await mkdtemp(join(tmpdir(),'weekly-test-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}};
test('configuration rejects traversal, duplicate IDs and missing fields',()=>{
 assert.deepEqual(storesFrom(stores),stores);
 for(const value of [[],[stores[0],stores[0]],[{...stores[0],id:'../escape'}],[{...stores[0],place_id:undefined}]])assert.throws(()=>storesFrom(value));
 assert.throws(()=>validateRecords(records().slice(1)));
});
test('business dates use New York and calendar weeks across DST',()=>{
 assert.equal(businessDate(new Date('2026-11-02T02:00:00Z')),'2026-11-01');
 assert.equal(previousWeek('2026-11-02'),'2026-10-26');
});
test('changes, thresholds, escaping and missing values',()=>{
 const old=records(),next=records();next[0].phone='222';next[1].review_count=110;next[2].review_count=111;next[3].rating=null;next[4].rating={average:4.8};old[5].review_count=0;next[5].review_count=1;
 const text=compare(stores[0],next,old).rows.join('\n');
 assert.match(text,/phone.*111.*222.*IMPORTANT/);assert.match(text,/Change <=10%/);assert.match(text,/>10%/);assert.match(text,/Availability changed/);assert.match(text,/structured values/);assert.match(text,/Zero baseline/);assert.match(text,/Sample &#124; &lt;A&gt;/);
});
test('object order and fetch timestamp changes do not produce changes',()=>{
 const old=records(),next=records();next[0].address={street:'1 Main St',city:'NY'};next[0].fetched_at='2026-11-09T11:00:00Z';assert.deepEqual(compare(stores[0],next,old).rows,[]);
});
test('failure is not absence; partial listing is not whole-platform failure',()=>{
 assert.equal(compare(stores[0],failed(),failed()).failures.length,8);
 assert.equal(compare(stores[0],failed(),null).failures.length,0);
 assert.ok(compare(stores[0],failed(),records()).rows.every(s=>!s.includes('presence changed')));
 const next=records();next[0].error='Missing phone';next[0].phone=null;next[1].found=false;
 const diff=compare(stores[0],next,records());assert.equal(diff.failures.length,0);assert.match(diff.rows.join('\n'),/presence changed/);
});
test('two stores, immutable reruns, adjacent week changes and manual isolation',()=>fixture(async root=>{
 const first=await runWeekly({root,stores,collect:async()=>records(),mode:'scheduled',now:new Date('2026-11-02T11:00:00Z')});
 assert.equal(first.manifest.canonical,true);
 const changed=records();changed[0].phone='222';
 const rerun=await runWeekly({root,stores,collect:async()=>changed,mode:'scheduled',now:new Date('2026-11-02T12:00:00Z')});assert.equal(rerun.manifest.canonical,false);
 assert.equal(JSON.parse(await readFile(join(root,'snapshots/sample-a/2026-11-02.json'),'utf8'))[0].phone,'111');
 const second=await runWeekly({root,stores,collect:async()=>changed,mode:'scheduled',now:new Date('2026-11-09T11:00:00Z')});assert.match(second.report,/111.*222/);
 const manual=await runWeekly({root,stores,collect:async()=>records(),now:new Date('2026-11-10T11:00:00Z')});assert.match(manual.runDir,/manual/);
}));
test('store failures continue, missing week not treated as consecutive failure',()=>fixture(async root=>{
 let calls=0;const collect=async()=>{calls++;throw Error('private diagnostic');};
 await runWeekly({root,stores,collect,mode:'scheduled',now:new Date('2026-11-02T11:00:00Z')});assert.equal(calls,2);
 const adjacent=await runWeekly({root,stores,collect,mode:'scheduled',now:new Date('2026-11-09T11:00:00Z')});assert.match(adjacent.report,/- sample-a \/ google_maps/);
 const gap=await runWeekly({root,stores,collect,mode:'scheduled',now:new Date('2026-11-23T11:00:00Z')});assert.match(gap.report,/None observed/);assert.ok(!gap.report.includes('private diagnostic'));
}));
test('corrupt history stops before paid collection',()=>fixture(async root=>{
 await runWeekly({root,stores,collect:async()=>records(),mode:'scheduled',now:new Date('2026-11-02T11:00:00Z')});
 await writeFile(join(root,'snapshots/sample-a/2026-11-02.json'),'{broken');let calls=0;
 await assert.rejects(runWeekly({root,stores,collect:async()=>{calls++;return records();},mode:'scheduled',now:new Date('2026-11-09T11:00:00Z')}));assert.equal(calls,0);
}));

test('menu sidecars detect dates without modifying the current listing contract',()=>fixture(async root=>{
 const menu={store_id:'sample-a',channel:'official',source_url:'https://example.com/menu',menu_date:'2026-01-01',date_source:'on_page'};
 await runWeekly({root,stores,collect:async()=>records(),menus:[menu],mode:'scheduled',now:new Date('2026-11-02T11:00:00Z')});
 const next=await runWeekly({root,stores,collect:async()=>records(),menus:[{...menu,menu_date:'2026-11-01'}],mode:'scheduled',now:new Date('2026-11-09T11:00:00Z')});
 assert.match(next.report,/menu_date.*2026-01-01.*2026-11-01.*IMPORTANT/);
 const snapshot=JSON.parse(await readFile(join(root,'snapshots/sample-a/2026-11-09.json'),'utf8'));assert.equal(Object.keys(snapshot[0]).length,13);
}));
test('invalid menu provenance and concurrent writers fail safely',()=>fixture(async root=>{
 const {menuObservations}=await import('../dist/backend/weekly/public.js');
 assert.throws(()=>menuObservations([{store_id:'sample-a',channel:'web',source_url:'https://example.com',menu_date:'2026-02-31',date_source:'on_page'}]));
 let unblock;const waiting=new Promise(r=>unblock=r);let entered;const ready=new Promise(r=>entered=r);
 const run=runWeekly({root,stores,collect:async()=>{entered();await waiting;return records();}});await ready;
 try{await assert.rejects(runWeekly({root,stores,collect:async()=>records()}));}finally{unblock();await run;}
}));


test('missing previously declared menu sidecar is not treated as an empty baseline',()=>fixture(async root=>{
 await runWeekly({root,stores,collect:async()=>records(),menus:[],mode:'scheduled',now:new Date('2026-11-02T11:00:00Z')});
 await rm(join(root,'menus/2026-11-02.json'));let calls=0;
 await assert.rejects(runWeekly({root,stores,collect:async()=>{calls++;return records();},mode:'scheduled',now:new Date('2026-11-09T11:00:00Z')}));
 assert.equal(calls,0);
}));


test('optional website validates and maps to the existing collector with explicit input priority',()=>{
 const store={...stores[0],website:'https://example.com/restaurant'};
 assert.equal(storesFrom([store])[0].website,store.website);
 assert.deepEqual(collectionInputForStore(store),{name:store.website,address:store.address});
 assert.deepEqual(collectionInputForStore({...store,place_id:'verified-id'}),{place_id:'verified-id',address:store.address});
 assert.deepEqual(collectionInputForStore({...store,website:null}),{name:store.name,address:store.address});
 assert.deepEqual(collectionInputForStore(stores[0]),{name:store.name,address:store.address});
 for(const website of ['',42,'example.com','file:///tmp/test','https://user:secret@example.com'])assert.throws(()=>storesFrom([{...store,website}]));
});


test('current matched schema is strict while legacy snapshots remain readable without mutation',()=>{
 const current=records();assert.equal(validateRecords(current)[0].matched,true);
 const legacy=current.map(({matched,...r})=>r);
 assert.throws(()=>validateRecords(legacy));assert.deepEqual(validateRecords(legacy,true),legacy);
 assert.throws(()=>validateRecords(current.map(r=>({...r,matched:false}))));
 assert.deepEqual(compare(stores[0],current,validateRecords(legacy,true)).rows,[]);
});

test('menu tracking parameters do not create false replacement reports',async()=>{
 const {menuChanges}=await import('../dist/backend/weekly/menus.js');
 const old={store_id:'sample-a',channel:'delivery_menu',menu_id:'uber:main',source_url:'https://example.com/store/a?utm_source=x&srsltid=old',menu_date:null,date_source:'unknown'};
 assert.deepEqual(menuChanges([{...old,source_url:'https://example.com/store/a?srsltid=new&utm_source=y'}],[old]),[]);
 assert.equal(menuChanges([{...old,source_url:'https://example.com/store/b'}],[old]).length,1);
});


test('weekly collection preserves full menu details and reports menu date changes and partial coverage',async()=>fixture(async root=>{
 let date='2024';
 const collect=async store=>({records:records(),menu_error:'Some channels blocked',menus:[{store_id:store.id,channel:'official_html',menu_id:'official:main',source_url:'https://example.com/menu',menu_date:date,date_source:'on_page'}],menu_details:{directory:'/private/tmp/not-for-history',menus:[{menu_date:date}],prices:[{name:'Soup',price:'$5'}],hours:[],coverage:[],summary:{}}});
 const first=await runWeekly({stores,root,mode:'scheduled',now:new Date('2026-11-02T12:00:00Z'),collect});
 const details=JSON.parse(await readFile(join(first.runDir,'details',stores[0].id+'.json'),'utf8'));assert.equal(details.directory,undefined);assert.equal(details.prices[0].price,'$5');assert.equal(first.manifest.stores[0].status,'partial');assert.match(first.report,/Some channels blocked/);
 date='2026';const next=await runWeekly({stores,root,mode:'scheduled',now:new Date('2026-11-09T12:00:00Z'),collect});assert.match(next.report,/menu date changed/);assert.match(next.report,/2024/);assert.match(next.report,/2026/);
}));

test('latest index points to successful retry without rewriting failed canonical snapshots',()=>fixture(async root=>{
 const first=await runWeekly({root,stores,runId:'failed-first',collect:async()=>{throw Error('fixture');}});
 const old=await readFile(join(root,'manual/snapshots/sample-a',first.manifest.date+'.json'),'utf8');
 const retry=await runWeekly({root,stores,runId:'recovered',collect:async()=>records()});
 assert.equal(retry.manifest.canonical,false);
 assert.equal(await readFile(join(root,'manual/snapshots/sample-a',first.manifest.date+'.json'),'utf8'),old);
 const latest=JSON.parse(await readFile(join(root,'manual/indexes/latest.json'),'utf8'));
 assert.equal(latest.run_id,'recovered');assert.equal(latest.stores[0].status,'completed');
 assert.equal(JSON.parse(await readFile(join(root,'manual/indexes/dates',first.manifest.date+'.json'),'utf8')).run_id,'recovered');
}));
test('explicit same-day manual comparison detects phone change and leaves original run untouched',()=>fixture(async root=>{
 const initial=await runWeekly({root,stores,runId:'baseline',collect:async()=>records()});
 const bytes=await readFile(join(initial.runDir,'snapshots/sample-a.json'),'utf8');
 const changed=records();changed[0].phone='222';
 const next=await runWeekly({root,stores,runId:'comparison',compareRun:'baseline',collect:async()=>changed});
 assert.match(next.report,/Explicit comparison run: baseline/);assert.match(next.report,/phone.*111.*222.*IMPORTANT/);
 assert.equal(await readFile(join(initial.runDir,'snapshots/sample-a.json'),'utf8'),bytes);
 let calls=0;
 await assert.rejects(runWeekly({root,stores,compareRun:'missing',collect:async()=>{calls++;return records();}}),/not found/);
 assert.equal(calls,0);
 await assert.rejects(runWeekly({root,stores,compareRun:'baseline',mode:'scheduled',now:new Date('2026-11-09T11:00:00Z'),collect:async()=>records()}),/manual mode/);
}));
