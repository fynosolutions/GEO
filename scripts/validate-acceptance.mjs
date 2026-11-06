import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validateRecords} from '../dist/backend/weekly/public.js';
import {channels,dateRange} from '../dist/backend/menu-audit/public.js';
const root=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node scripts/validate-acceptance.mjs RUN_DIRECTORY');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const manifest=await read('manifest.json');
assert.ok(Array.isArray(manifest.stores)&&manifest.stores.length>0);
let menuCount=0,hourCount=0;
for(const store of manifest.stores){
 assert.equal(typeof store.id,'string');assert.match(store.id,/^[a-z0-9][a-z0-9-]*$/);
 const records=validateRecords(await read('snapshots/'+store.id+'.json'));
 for(const r of records){if(!r.matched){for(const key of ['name','address','phone','hours','rating','review_count','price_level'])assert.equal(r[key],null,`${store.id}/${r.platform}: unverified field ${key}`);}}
 if(store.status==='failed')continue;
 const details=await read('details/'+store.id+'.json');
 assert.deepEqual(details.coverage.map(c=>c.channel),[...channels]);
 for(const menu of details.menus){
  for(const key of ['channel','url','format','menu_date','date_source','fetched_at'])assert.ok(Object.hasOwn(menu,key),`Missing menu field ${key}`);
  assert.ok(channels.includes(menu.channel));assert.ok(['html','pdf','image'].includes(menu.format));
  assert.ok(['on_page','metadata','upload_date','unknown'].includes(menu.date_source));
  assert.ok(menu.menu_date===null||dateRange(menu.menu_date));
  if(menu.date_source==='unknown')assert.equal(menu.menu_date,null);
  assert.ok(Number.isFinite(Date.parse(menu.fetched_at)));assert.match(menu.url,/^https?:\/\//);
  for(const item of menu.items??[]){assert.equal(typeof item.name,'string');assert.ok(Object.hasOwn(item,'category'));assert.ok(Object.hasOwn(item,'price'));assert.equal(item.url,menu.url);assert.ok(Number.isFinite(Date.parse(item.fetched_at)));}
  menuCount++;
 }
 for(const row of details.hours){
  for(const key of ['platform','day','open','close','google_open','google_close','diff_minutes','verdict'])assert.ok(Object.hasOwn(row,key),`Missing hours field ${key}`);
  assert.ok([null,'一致','外卖常规提前','不一致'].includes(row.verdict));
  if(row.verdict===null)assert.ok(typeof row.reason==='string'&&row.reason.length>0);
  hourCount++;
 }
 console.log(`${store.id}: 8 platform records, 7 channel records; status=${store.status}`);
}
console.log(`Required field and provenance validation passed: ${menuCount} menus, ${hourCount} daily hour rows. This validates structure, not complete platform coverage or page accuracy.`);
