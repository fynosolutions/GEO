import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const args=process.argv.slice(2),run=resolve(args[0]||''),target=resolve(args[1]||'samples');
if(!args[0])throw Error('Usage: node scripts/export-acceptance.mjs RUN_DIRECTORY [OUTPUT_DIRECTORY]');
const manifest=JSON.parse(await readFile(join(run,'manifest.json'),'utf8'));
const names={'020':'easy-joy','001':'frydom-express'};
const cell=v=>(v===null||v===undefined?'—':typeof v==='string'?v:JSON.stringify(v)).replaceAll('|','&#124;').replaceAll('\n',' ');
const channelNames={official_html:'官网菜单页',official_file:'官网菜单文件',google_menu:'Google 菜单',yelp_menu:'Yelp 菜单',delivery_menu:'外卖菜单',reservation_menu:'预订平台菜单',social_menu:'社交平台菜单'};
const channels=['| 店 | 渠道 | 结果 | 链接 | 格式 | 菜单日期 | 日期怎么来的 | 新旧 | 说明及抓取时间 |','|---|---|---|---|---|---|---|---|---|'];
const hours=['| 店 | 平台 | 星期 | 本平台开门 | 本平台关门 | Google 开门 | Google 关门 | 差值分钟 | 判断 | 原因 | 来源 | 抓取时间 |','|---|---|---|---|---|---|---|---|---|---|---|---|'];
const checks=['| 店 | 平台 | 字段 | JSON 里写的 | 页面上写的 | 一样吗 | 页面链接 |','|---|---|---|---|---|---|---|'];
const prices=['| 店 | 菜名 | 渠道 | JSON 价格 | 页面价格 | 结果 | 页面链接 | JSON 抓取时间 |','|---|---|---|---|---|---|---|---|'];
for(const s of manifest.stores){
 const slug=names[s.id];if(!slug)continue;
 const dir=join(target,'issue4',slug);await mkdir(dir,{recursive:true});await mkdir(join(target,'issue1','screenshots'),{recursive:true});
 // Preserve original bytes; tables are derived annotations, never edits to source JSON.
 await copyFile(join(run,'snapshots',s.id+'.json'),join(target,'issue1',slug+'.json'));
 await copyFile(join(run,'details',s.id+'.json'),join(dir,'raw-result.json'));
 await copyFile(join(run,'snapshots',s.id+'.json'),join(dir,'listing.json'));
 const details=JSON.parse(await readFile(join(run,'details',s.id+'.json'),'utf8'));
 const records=JSON.parse(await readFile(join(run,'snapshots',s.id+'.json'),'utf8'));
 for(const coverage of details.coverage){
  const menus=details.menus.filter(m=>m.channel===coverage.channel),blocked=coverage.attempts.some(a=>/403|401|429|restrict|captcha|access denied/i.test(a.error||''));
  const provenAbsent=coverage.attempts.length>0&&coverage.attempts.every(a=>a.absence_verified===true);
  const status=menus.length?'找到了':blocked?'被挡住了':provenAbsent?'没找到':'没查';
  const links=[...new Set([...menus.map(m=>m.url),...coverage.attempts.map(a=>a.url).filter(Boolean)])];
  channels.push('| '+[s.name,channelNames[coverage.channel],status,links.join(' ; '),menus.map(m=>m.format).join(', '),menus.map(m=>m.menu_date??'unknown_date').join(', '),menus.map(m=>m.date_source).join(', '),menus.map(m=>m.freshness).join(', '),(status==='没查'?'已尝试但未确认；不可据此断言不存在。 ':'')+coverage.attempts.map(a=>a.error).filter(Boolean).join(' ; ')+' '+coverage.fetched_at].map(cell).join(' | ')+' |');
 }
 for(const h of details.hours)hours.push('| '+[s.name,h.platform,h.day,h.open,h.close,h.google_open,h.google_close,h.diff_minutes,h.verdict,h.reason,h.url,h.fetched_at].map(cell).join(' | ')+' |');
 for(const r of records)for(const field of ['phone','hours','rating'])checks.push('| '+[s.name,r.platform,field,r[field],'待打开页面核对','未验收',r.url].map(cell).join(' | ')+' |');
 const menu=details.menus.find(m=>m.platform==='uber_eats')??details.menus[0];
 for(const item of (menu?.items??[]).slice(0,5))prices.push('| '+[s.name,item.name,menu.platform,item.price,'待页面核对','未验收',menu.url,item.fetched_at].map(cell).join(' | ')+' |');
}
await mkdir(join(target,'issue5'),{recursive:true});await copyFile(join(run,'manifest.json'),join(target,'issue5','collection-manifest.json'));
await writeFile(join(target,'issue4','渠道表.md'),'# 七渠道检查\n\n源运行：'+manifest.run_id+'；代码：'+(manifest.code_sha??'local working tree; see source-revision.json')+'。表格对应此运行的实际输出，覆盖范围和受阻情况以说明为准。\n\n“没查”也用于已尝试但身份、动态内容或访问范围未能核实的项目，详见说明；不得解释为平台无菜单。\n\n'+channels.join('\n')+'\n');
await writeFile(join(target,'issue4','营业时间表.md'),'# 营业时间比较\n\n原始运行：'+manifest.run_id+'；空判断表示资料不足，不能当作一致。\n\n'+hours.join('\n')+'\n');
await writeFile(join(target,'issue4','菜价抽查.md'),'# 十道菜抽查清单（待页面验收）\n\n以下为两家店各五道菜的原始价格；页面价格尚未核对，不计作 10/10 通过。\n\n'+prices.join('\n')+'\n');
await writeFile(join(target,'issue1','核对表.md'),'# 基础信息核对清单（待页面验收）\n\n每家至少三个平台的电话、营业时间、评分需要独立打开页面核对及截图。以下仅从原始 JSON 生成，未宣称页面核对通过。\n\n'+checks.join('\n')+'\n');
await writeFile(join(target,'README.md'),'# Acceptance evidence\n\nGenerated from collection run '+manifest.run_id+' at code '+(manifest.code_sha??'local source fingerprint')+'. JSON files retain original bytes. Tables distinguish collected evidence from pending page checks. No issue closure is implied.\n\nRegenerate: `node scripts/export-acceptance.mjs RUN_DIRECTORY samples`.\n');
console.log('Generated original outputs and explicitly pending acceptance tables in '+target);
