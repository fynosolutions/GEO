import assert from 'node:assert/strict';import {readFile,readdir,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {safeName} from '../dist/backend/collection.js';import {execFileSync} from 'node:child_process';
const [captureArg,derivedArg]=process.argv.slice(2);if(!captureArg||!derivedArg)throw Error('Usage: report-listing-quality.mjs CAPTURE DERIVED');
const capture=resolve(captureArg),derived=resolve(derivedArg),base='samples/step1-listing',dir=join(base,'stability');
const read=async path=>JSON.parse(await readFile(path,'utf8'));const state=await read(join(capture,'acceptance.json')),bill=await read(join(capture,'billing-final-private.json')),comparison=await read(join(derived,'stability.json')),evidence=await read(join(derived,'source-evidence-private.json')),stores=await read(join(base,'stores.json'));
assert.equal(state.complete,true);assert.ok(bill.within_limit&&bill.total_usd<=10);assert.ok(bill.runs.every(r=>['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(r.status)));assert.equal(comparison.all_differences_explained,true);
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':String(JSON.stringify(v));
const fingerprints={},distribution={present:0,confirmed_absent:0,not_collected:0,unsure:0},windows=[],failedSeries=[],recovered=[];
async function attemptsFor(root,round,store,visited=new Set()){
 if(visited.has(root))throw Error('Cyclic capture ancestry');visited.add(root);
 const cost=await read(join(root,'cost-private.json'));const rows=cost.attempts.filter(a=>a.round===round&&a.store===store.name);if(rows.length)return {rows,root};
 const previous=(await read(join(root,'acceptance.json'))).resumed_from;if(!previous)throw Error('Missing attempt evidence for '+store.name);return attemptsFor(resolve(previous),round,store,visited);
}
for(let round=1;round<=3;round++){
 const times=[];
 for(const file of (await readdir(join(dir,`run-${round}`))).filter(f=>f.endsWith('.json'))){
  const rows=await read(join(dir,`run-${round}`,file)),active=rows.filter(r=>!['opentable','resy'].includes(r.platform)),id=active[0].store,store=id==='020'?stores[0]:stores.find(s=>s.name===id);assert.ok(store);
  const originalName=safeName(store.name)+'.json';const original=await read(join(capture,`run-${round}`,originalName));
  for(const r of active){assert.equal(r.fetched_at,original.find(x=>x.platform===r.platform).fetched_at);distribution[r.absence]++;times.push(r.fetched_at);}
  const googleEvidence=evidence.find(e=>e.round===round&&e.file===originalName&&e.platform==='google_maps');assert.ok(googleEvidence);const providers=await read(googleEvidence.provider_file);
  const attemptData=await attemptsFor(capture,round,store);const grouped=new Map();for(const a of attemptData.rows){if(!grouped.has(a.platform))grouped.set(a.platform,[]);const sequences=grouped.get(a.platform);if(a.attempt===1||!sequences.length)sequences.push([]);sequences.at(-1).push(a);}
  let older=[];try{older=await read(join(attemptData.root,'retry-evidence-private.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const [platform,sequences] of grouped){
   for(const series of sequences){
    const isError=a=>a.status==='error'||a.items>0&&a.item_errors===a.items||older.some(r=>r.run_id===a.run_id&&r.all_item_errors);
    if(series.length===6&&series.every(isError)){
     assert.deepEqual(series.map(a=>a.attempt),[1,2,3,4,5,6]);failedSeries.push({store:id,platform,round,attempts:6,retries:5,outcome:active.find(r=>r.platform===platform)?.absence??'discovery',reason:'Actor request/data failures persisted through the bounded retry sequence; no absence assertion was inferred.'});
    }else if(series.some(isError)){
     const last=series.at(-1);const raw=[providers[platform],...(providers[platform+'_attempts']??[])].find(r=>r?.run_id===last.run_id);
     assert.ok(raw&&['unverified','success','empty'].includes(raw.status)&&!(raw.items?.length&&raw.items.every(x=>x?.error)),'Unexplained early retry termination');
    }
   }
  }
  for(const r of active){const raw=providers[r.platform];if(raw?.note==='Existing remote run ended; dataset recovered without starting another Actor.')recovered.push({store:id,platform:r.platform,round,read_existing_dataset:true,outcome:r.absence});}
  if(round===1){const old=JSON.parse(execFileSync('git',['show','HEAD:'+join(base,file)],{encoding:'utf8'}));fingerprints[file]={};for(const row of old.filter(r=>['opentable','resy'].includes(r.platform))){const {rating,...facts}=row;fingerprints[file][row.platform]=createHash('sha256').update(canonical(facts)).digest('hex');}}
 }
 times.sort();windows.push({round,first_fetched_at:times[0],last_fetched_at:times.at(-1)});
}
const storeWindows=[];
for(const store of stores){
 const file=safeName(store.name)+'.json',captures=[];
 for(let round=1;round<=3;round++){
  const rows=(await read(join(capture,`run-${round}`,file))).filter(r=>r.fetched_at);
  const times=rows.map(r=>r.fetched_at).sort();assert.ok(times.length);
  captures.push({round,first_fetched_at:times[0],last_fetched_at:times.at(-1)});
 }
 const consecutive=captures.every((w,i)=>!i||captures[i-1].last_fetched_at<=w.first_fetched_at);
 storeWindows.push({store:store===stores[0]?'020':store.name,captures,non_overlapping_order:consecutive});
}
let perStoreConsecutive=false;
if(!state.resumed_from){
 const cost=await read(join(capture,'cost-private.json')),blocks=[];
 for(const a of cost.attempts){const key=a.store+'\0'+a.round;if(blocks.at(-1)!==key)blocks.push(key);}
 const expected=stores.flatMap(store=>[1,2,3].map(round=>store.name+'\0'+round));
 perStoreConsecutive=JSON.stringify(blocks)===JSON.stringify(expected);
 assert.ok(perStoreConsecutive,'Actual attempts must run each store three times before moving to the next');
 assert.ok(storeWindows.every(s=>s.non_overlapping_order),'Store capture windows overlap');
}
const metadata={issue:18,three_round_files_complete:true,stores:6,rounds:3,files:18,active_rows:144,legacy_booking_rows:36,resumed_after_interruption:!!state.resumed_from,uninterrupted_execution:!state.resumed_from,per_store_consecutive_attempt_order:perStoreConsecutive,source_timestamps_preserved:true,capture_windows:windows,store_capture_windows:storeWindows,absence_distribution:distribution,reviewed_differences:comparison.differences.length,all_differences_explained:true,observed_failed_retry_series:failedSeries.length,cost_within_authorized_limit:true,budget_usd:10,private_billing_receipts_published:false,legacy_booking_fingerprints:fingerprints,limitations:[...(state.resumed_from?['Capture was interrupted and resumed; complete checkpoints and timestamps were preserved.']:[]),'No confirmed absence without reviewed search evidence.','Facebook hours may be current open state, not weekly hours.','Uber Eats aggregate fields differed; real source changes were not independently established.']};
await writeFile(join(dir,'acceptance.json'),JSON.stringify(metadata,null,2)+'\n');await writeFile(join(dir,'retry-verification.json'),JSON.stringify({policy:{initial_attempts:1,max_retries:5,delay_ms:3000,recover_existing_run_before_new_actor:true},failed_series:failedSeries,recovered_existing_runs:recovered,note:'Empty successful datasets and missing candidate URLs are not interface failures. Partial item errors with readable results proceed to identity checks.'},null,2)+'\n');console.log(JSON.stringify({public_report_written:true,failed_retry_series:failedSeries.length,recovered_existing_runs:recovered.length,account_metadata_published:false}));

const cell=value=>String(value??'—').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
const lines=['# Issue #18 验收报告','', '六家店、三轮真实采集，共十八份文件。正式样例由第三轮生成，未手改商户记录。','', state.resumed_from?'采集发生中断并恢复，原始时间和捕获未改；不宣称一次无中断执行。':'本批次按每店第1次、第2次、第3次的顺序连续执行后再进入下一家；原始调用记录和逐店时间窗口已核验，未使用断点恢复。','', '| 轮次 | 首条采集时间（UTC） | 最后采集时间（UTC） |','|---|---|---|'];
for(const w of windows)lines.push(`| ${w.round} | ${w.first_fetched_at} | ${w.last_fetched_at} |`);
lines.push('', '## 第三轮各平台状态','', '| 店 | present | not_collected | unsure |','|---|---|---|');
for(const file of (await readdir(join(dir,'run-3'))).filter(f=>f.endsWith('.json')).sort()){
 const rows=(await read(join(dir,'run-3',file))).filter(r=>!['opentable','resy'].includes(r.platform));
 lines.push('| '+[rows[0].store,...['present','not_collected','unsure'].map(state=>rows.filter(r=>r.absence===state).map(r=>r.platform).join(', ')||'—')].map(cell).join(' | ')+' |');
}
lines.push('', `三轮非订位记录合计：present ${distribution.present}、not_collected ${distribution.not_collected}、unsure ${distribution.unsure}、confirmed_absent ${distribution.confirmed_absent}。没有把空结果、未调用或访问失败认定为店页不存在。`, '', '## 重试与恢复','', `核对到 ${failedSeries.length} 组失败序列，每组首次调用加五次重试；Actor 成功但全部数据项出错仍视为采集失败。已有远端运行终态核对后优先恢复同一数据集，避免重复启动。`, '', '## 跨轮差异','', '| 店 | 平台 | 轮次 | 字段 | 旧 | 新 | 原因 |','|---|---|---|---|---|---|---|');
for(const d of comparison.differences)lines.push('| '+[d.store,d.platform,`${d.from_round}→${d.to_round}`,d.field,JSON.stringify(d.old),JSON.stringify(d.new),d.reason].map(cell).join(' | ')+' |');
lines.push('', '## 输出与限制','', '- rating 为数字或 null，按一位小数精度四舍五入；原始 rating_raw 保留。Facebook 推荐文本不换算成星级。', '- KPOT 历史 OpenTable 的零评论 rating=0 改为 null，rating_raw 与其他资料、原时间不变；未重新采集订位平台。', '- Uber Eats ratingValue 原字段已补映射，所有轮次从本批次已保存原始返回统一重导出。', '- Facebook hours 的开闭状态不代表一周营业表；Uber Eats 的统计差异不能直接解释成真实评论增减。', '- 空结果、账号级品牌页缺分店证据、无门店链接、访问错误等缺口均保留。', '- 所有运行终态和费用已只读核对，含诊断/中止费用未超过 US$10；实际账单、Actor 运行明细及账户元数据只留本地。', '', '## 离线核验','', '```sh', 'npm ci', 'npm run check', 'npm run build', 'npm run verify:listing-quality', 'BROWSER_CHANNEL=chrome npm test', '```', '', '离线核验不联网、不调用 Apify；精确重放需要本地原始返回和费用核对材料。完整性检查通过不替代 mentor 验收。','');
await writeFile(join(dir,'验收报告.md'),lines.join('\n'));
