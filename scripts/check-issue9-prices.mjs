import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const [runArg,easyArg,frydomArg,outArg]=process.argv.slice(2);
if(!runArg||!easyArg||!frydomArg||!outArg)throw Error('Usage: check-issue9-prices.mjs RUN_DIRECTORY EASY_CAPTURE FRYDOM_CAPTURE SAMPLE_ROOT');
const run=resolve(runArg),out=resolve(outArg),rows=[];
const parseCapture=text=>JSON.parse(text.includes('### Result\n')?text.split('### Result\n')[1].split('\n### Ran')[0].trim():text);
const number=value=>{if(typeof value==='number')return value;const match=String(value).trim().match(/^\$?\s*(\d+(?:\.\d{1,2})?)(?:[⁺+])?$/);assert.ok(match,'Price is not an unambiguous scalar');return Number(match[1]);};
for(const [id,slug,path] of [['020','easy-joy',easyArg],['001','frydom-express',frydomArg]]){
 const observed=parseCapture(await readFile(path,'utf8')),details=JSON.parse(await readFile(join(run,'details',id+'.json'),'utf8'));
 assert.ok(Number.isFinite(Date.parse(observed.captured_at)));assert.ok(Array.isArray(observed.items));
 const sameUrl=value=>{const a=new URL(value),b=new URL(observed.url);return a.hostname===b.hostname&&a.pathname===b.pathname;};
 const menu=details.menus.find(m=>sameUrl(m.url));assert.ok(menu,`No collected menu for ${slug} page`);
 const chosen=observed.items.filter(p=>menu.items.some(item=>item.name===p.name)).slice(0,5);assert.equal(chosen.length,5);
 const checks=chosen.map(p=>{const item=menu.items.find(i=>i.name===p.name);return {name:p.name,channel:menu.platform,json_price:item.price,page_price:p.price,pass:Math.round(number(item.price)*100)===Math.round(number(p.price)*100),url:observed.url,fetched_at:item.fetched_at,page_checked_at:observed.captured_at};});
 const directory=join(out,'issue4',slug);await mkdir(directory,{recursive:true});
 await writeFile(join(directory,'page-price-evidence.json'),JSON.stringify(observed,null,2)+'\n');
 await writeFile(join(directory,'price-check.json'),JSON.stringify({selection:'First five exact-name matches in independent visible page order; no cart/login actions',checks},null,2)+'\n');
 rows.push(...checks.map(c=>({store:slug,...c})));
}
const cell=v=>(typeof v==='string'?v:JSON.stringify(v)).replaceAll('|','&#124;').replaceAll('\n',' ');
const table=['| 店 | 菜名 | 渠道 | JSON 里的价 | 页面上的价 | 一致吗 | 页面链接 | JSON 抓取时间 | 页面核对时间 |','|---|---|---|---|---|---|---|---|---|',...rows.map(r=>'| '+[r.store,r.name,r.channel,r.json_price,r.page_price,r.pass?'一致':'不一致',r.url,r.fetched_at,r.page_checked_at].map(cell).join(' | ')+' |')];
await writeFile(join(out,'issue4','菜价抽查.md'),'# 十道菜真实页面价格核对\n\n两家店各五道，来自独立浏览器打开的 Yelp 菜单页。按页面顺序选择与本轮原始 JSON 菜名完全相同的条目，未使用搜索摘要或采集器的 JSON-LD 作为页面价格。JSON 原值未修改。此核对仅覆盖所列十道菜，不代表其他渠道全部核验。每家目录的 page-price-evidence.json 保留页面观察，price-check.json 保留逐项比较。\n\n'+table.join('\n')+'\n');
assert.equal(rows.length,10);assert.ok(rows.every(r=>r.pass),'Price mismatches found; report retained');console.log('Independent visible-page price verification: 10/10 passed (five per store).');
