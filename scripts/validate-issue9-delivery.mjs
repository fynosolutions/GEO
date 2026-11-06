import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const run=resolve(process.argv[2]||''),root=resolve(process.argv[3]||'samples/issue4');
if(!process.argv[2])throw Error('Usage: validate-issue9-delivery.mjs RUN_DIRECTORY [ISSUE4_SAMPLE_DIRECTORY]');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const manifest=await read(join(root,'run-manifest.json'));assert.deepEqual(manifest,await read(join(run,'manifest.json')));
let checks=0;
for(const [id,slug] of [['020','easy-joy'],['001','frydom-express']]){
 const dir=join(root,slug),raw=await readFile(join(dir,'raw-result.json'));
 assert.ok(raw.equals(await readFile(join(run,'details',id+'.json'))),'Raw result was changed');
 assert.ok((await readFile(join(dir,'listing.json'))).equals(await readFile(join(run,'snapshots',id+'.json'))));
 const d=JSON.parse(raw.toString());assert.equal(d.coverage.length,7);
 for(const [file,key] of [['menus','menus'],['prices','prices'],['hours','hours'],['channels','coverage'],['summary','summary']])assert.deepEqual(await read(join(dir,file+'.json')),d[key]);
 for(const item of [...d.menus,...d.prices]){assert.match(item.url,/^https?:\/\//);assert.ok(Number.isFinite(Date.parse(item.fetched_at)));}
 const prices=await read(join(dir,'price-check.json'));assert.equal(prices.checks.length,5);assert.ok(prices.checks.every(c=>c.pass));checks+=prices.checks.length;
 await read(join(dir,'page-price-evidence.json'));
}
const table=await readFile(join(root,'渠道表.md'),'utf8');const rows=table.split('\n').filter(l=>l.startsWith('| Easy Joy ')||l.startsWith('| Frydom Express |'));assert.equal(rows.length,14);
for(const row of rows)assert.ok(['找到了','没找到','被挡住了','没查'].includes(row.split('|')[3].trim()));
const old=await read(join(root,'旧菜单例子/result.json'));assert.equal(old.freshness,'stale');assert.equal(old.year,'2024');assert.equal(old.date_source,'on_page');assert.match(old.url,/^https?:\/\//);assert.ok(Date.parse(old.fetched_at));
const image=await read(join(root,'无日期例子/result.json'));assert.equal(image.format,'image');assert.equal(image.menu_date,null);assert.equal(image.freshness,'unknown_date');assert.equal(image.date_source,'unknown');assert.ok((await readFile(join(root,'无日期例子/source-menu.png'))).length>0);
const boundary=await read(join(root,'营业时间边界测试.json'));assert.equal(boundary.synthetic,true);assert.ok(boundary.rows.some(r=>r.diff_minutes===-30&&r.verdict==='外卖常规提前'));assert.ok(boundary.rows.some(r=>r.diff_minutes===-45&&r.verdict==='不一致'));
assert.equal(checks,10);console.log('Issue #9 delivery checks passed: two unchanged original outputs, 14 channel rows, real 2024/undated evidence, 30/45-minute fixtures and 10/10 independent price matches.');
