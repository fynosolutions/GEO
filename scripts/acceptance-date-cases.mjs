import '../dist/backend/config.js';
import {readDocument} from '../dist/backend/menu-audit/extract.js';
import {freshness,compareHours} from '../dist/backend/menu-audit/public.js';
import {writeFile,mkdir,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const cases=[{folder:'旧菜单例子',restaurant:"Grasso's Restaurant",url:'https://www.grassosrestaurant.com/menu/fall-dinner-menu-2023-copy/',kind:'html',expected:'stale'},{folder:'无日期例子',restaurant:'618 Restaurant',url:'https://images.squarespace-cdn.com/content/v1/6102a1f9b9fc15011565183b/ba51e2d9-d23c-4159-95e5-66630c55f5d2/November%2B2026%2BFOOD%2BMENU.png',kind:'image',expected:'unknown_date'}];
cases.push({folder:'真实PDF例子',restaurant:"Grasso's Restaurant",url:'https://media-cdn.getbento.com/accounts/1a691e6ec49e9291d5a9fc0abb20a78d/media/YHRMfx6gT1aIXbxbnZkg_Winter%20Diner%202023.pdf',kind:'pdf',expected:'stale'});
for(const c of cases.filter(c=>!process.argv.includes('--pdf-only')||c.kind==='pdf')){
 const dir='samples/issue4/'+c.folder;await mkdir(dir,{recursive:true});
 const doc=await readDocument(c.url);const result={channel:c.kind==='html'?'official_html':'official_file',url:doc.url,format:doc.format,...doc.date,...freshness(doc.date.menu_date,doc.fetched_at),fetched_at:doc.fetched_at,extraction:doc.extraction,sha256:doc.sha256};
 await writeFile(dir+'/document.json',JSON.stringify(doc,null,2)+'\n');await writeFile(dir+'/result.json',JSON.stringify(result,null,2)+'\n');
 assert.equal(result.freshness,c.expected);if(c.expected==='stale')assert.ok(Number(result.year)<=2024);
 if(c.kind==='image'){const response=await fetch(c.url);if(!response.ok)throw Error('Could not preserve menu image');const bytes=Buffer.from(await response.arrayBuffer());const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(bytes).digest('hex'),doc.sha256);await writeFile(dir+'/source-menu.png',bytes);}
 await writeFile(dir+'/README.md','# Real public menu evidence\n\nRestaurant: '+c.restaurant+'\n\nSource: '+c.url+'\n\nFetched: '+doc.fetched_at+'\n\nProgram result: '+result.freshness+'. These are real public sources, not generated menu fixtures. Image was visually checked for a printed menu date; a tequila vintage and dates in asset filenames are not menu publication dates. HTTP Last-Modified is not used as a photo publication date.\n');
 console.log(c.folder,JSON.stringify(result));
}
const record=(platform,hours)=>({platform,found:true,matched:true,hours,url:'https://example.com/synthetic-hours',fetched_at:new Date().toISOString()});
const hours=compareHours([record('google_maps',{Mon:'10:00-22:00'}),record('doordash',{Mon:'10:00-21:30'}),record('uber_eats',{Mon:'10:00-21:15'})]);
assert.equal(hours.find(r=>r.platform==='doordash'&&r.day==='Monday').verdict,'外卖常规提前');assert.equal(hours.find(r=>r.platform==='uber_eats'&&r.day==='Monday').verdict,'不一致');
await writeFile('samples/issue4/营业时间边界测试.json',JSON.stringify({synthetic:true,test:'hours compare delivery closing exceptions and opening times, overnight and missing',rows:hours},null,2)+'\n');
