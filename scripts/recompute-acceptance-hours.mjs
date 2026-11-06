import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {compareHours} from '../dist/backend/menu-audit/public.js';
import {mapApify} from '../dist/backend/collection.js';
const rows=['| 店 | 平台 | 星期 | 开门 | 关门 | Google 开门 | Google 关门 | 相差分钟 | 判断 | 原因 | 来源 | 抓取时间 |','|---|---|---|---|---|---|---|---|---|---|---|---|'];
for(const [slug,name] of [['easy-joy','Easy Joy'],['frydom-express','Frydom Express']]){
 let records=JSON.parse(await readFile('samples/issue4/'+slug+'/listing.json','utf8'));const g=records.find(r=>r.platform==='google_maps');
 records=records.map(r=>r.platform==='grubhub'&&r.found?mapApify('grubhub',{status:'unverified',items:[r],collected_at:r.fetched_at,target:{},note:'',actor:null,run_id:null,dataset_id:null,truncated:false},{name:g.name,address:g.address,phone:g.phone}):r);
 if(slug==='frydom-express'){
  const latest=JSON.parse(await readFile('.local/acceptance/frydom-retest/out/Frydom Express.json','utf8'));
  records=records.map(r=>latest.find(p=>p.platform===r.platform)??r);
  await copyFile('.local/acceptance/frydom-retest/out/Frydom Express.json','samples/issue4/frydom-express/local-targeted-retest.json');
 }
 const hours=compareHours(records);await writeFile('samples/issue4/'+slug+'/local-hours.json',JSON.stringify(hours,null,2)+'\n');
 const cell=v=>(v===null||v===undefined?'—':typeof v==='string'?v:JSON.stringify(v)).replaceAll('|','&#124;');
 for(const h of hours)rows.push('| '+[name,h.platform,h.day,h.open,h.close,h.google_open,h.google_close,h.diff_minutes,h.verdict,h.reason,h.url,h.fetched_at].map(cell).join(' | ')+' |');
}
await writeFile('samples/issue4/营业时间表.md','# 当前本地营业时间比较\n\n原始云端 listing.json/raw-result.json 保持不变。本表用当前解析器重新计算；Grubhub Catering 不被当成普通门店，未知时区时段不作一致性结论。Frydom 的 Yelp/Grubhub 使用 local-targeted-retest.json 中后续真实定向采集结果。每行保留实际数据来源和抓取时间；本地重算不是新的全平台采集。\n\n'+rows.join('\n')+'\n');
console.log('Recomputed comparison with current timezone/matching safeguards.');
