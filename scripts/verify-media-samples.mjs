import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {mediaSources,mediaMembershipReport,evaluateMediaAcceptance} from '../dist/backend/media/public.js';
const dir=resolve(process.argv[2]??'samples/step1-media');
const json=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
const articles=await json('articles.json'),sources=(await json('evidence.json')).sources,acceptance=await json('acceptance.json');
assert.equal(articles.length,mediaSources.length);assert.equal(sources.length,articles.length);
for(let i=0;i<articles.length;i++){
 const a=articles[i],s=mediaSources[i];assert.deepEqual(Object.keys(a),['url','site','title','published','updated','restaurants']);assert.equal(a.url,s.url);assert.equal(a.site,s.site);assert.equal(sources[i].source_id,s.id);
 assert.ok(a.title===null||typeof a.title==='string');for(const key of ['published','updated'])assert.ok(a[key]===null||typeof a[key]==='string'&&Number.isFinite(Date.parse(a[key])));
 a.restaurants.forEach((r,index)=>{assert.deepEqual(Object.keys(r),['name','rank','address','blurb']);assert.equal(typeof r.name,'string');assert.ok(r.name.trim());assert.equal(r.rank,index+1);for(const key of ['address','blurb'])assert.ok(r[key]===null||typeof r[key]==='string'&&r[key].trim().length>0);});
 assert.equal(sources[i].extracted_count,a.restaurants.length);
}
assert.deepEqual(evaluateMediaAcceptance(articles,sources,mediaSources).acceptance,acceptance);
const targets=JSON.parse(await readFile('backend/media/targets.json','utf8'));assert.equal(await readFile(join(dir,'上榜表.md'),'utf8'),mediaMembershipReport(articles,sources,targets));
console.log(JSON.stringify({sources:articles.length,restaurants:acceptance.restaurant_count,descriptions:acceptance.descriptions_available,missing_descriptions:acceptance.descriptions_missing,full_data_complete:acceptance.complete,schema:'passed',counts:'passed',generated_table:'passed',network_requests:0}));
