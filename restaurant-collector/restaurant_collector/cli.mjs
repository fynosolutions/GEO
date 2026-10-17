import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { choose, sameBranch } from './match.mjs';
import { searchCandidates, openPage } from './browser.mjs';
import { extractDocument } from './extract.mjs';

const help = `资料采集器（不进行本地事实比对）
node restaurant_collector/cli.mjs --name "Easy Joy" --location "145 Mulberry St, New York, NY" [选项]
  --output <目录>        默认 output/<时间戳>
  --headless            无界面运行；默认可见浏览器
  --limit <1-10>        每个平台最多访问的候选数，默认 5
  --google-url <URL>    指定候选详情页，仍需名称/位置匹配
  --yelp-url <URL>      指定候选详情页，仍需名称/位置匹配
  --help
需要安装 Playwright 与 Chromium，无需 API key。`;
function field(value, source, kind = 'platform_observation') {
  const found = Array.isArray(value) ? value.length > 0 : !!value;
  return {value:found ? value : null,status:found ? 'observed' : 'not_collected',source,kind};
}
export function makeResult(query, platforms, capturedAt) {
  const entries = Object.values(platforms).filter(p => p.status === 'matched');
  let status = entries.length === 2 ? 'matched' : entries.length === 1 ? 'partial' : 'unresolved';
  // The result may contain only one restaurant. Conflicting branches are diagnostics only.
  if (entries.length === 2 && !sameBranch(entries[0].selected,entries[1].selected)) status = 'cross_platform_conflict';
  const usable = status === 'cross_platform_conflict' ? [] : entries;
  return {schemaVersion:'restaurant.collection.v1',query,capturedAt,status,
    restaurant:usable.length ? {name:usable[0].selected.name,address:usable[0].selected.address} : null,
    platforms:Object.fromEntries(Object.entries(platforms).map(([platform,p]) => {
      if (p.status !== 'matched' || status === 'cross_platform_conflict') return [platform,{status:status === 'cross_platform_conflict' && p.status === 'matched' ? 'needs_review' : p.status,error:p.error || null,evidence:p.evidence || null,
        candidates:(p.selected ? [p.selected] : p.candidates || []).map(c => ({name:c.name,address:c.address,url:c.url,match:c.match}))}];
      const c = p.selected;
      return [platform,{status:'collected',url:c.url,match:c.match,evidence:p.evidence || null,coverageNotes:c.coverageNotes || [],fields:{
        name:field(c.name,c.evidence.name),address:field(c.address,c.evidence.address),
        contact:field(c.phone || c.website ? {phone:c.phone || null,website:c.website || null} : null,c.evidence.phone),
        description:field(c.description,c.evidence.description,c.descriptionKind),
        specialties:field(c.dishes,c.evidence.specialties,'platform_featured_dishes'),
      }}];
    }))};
}
export function markdown(result) {
  const lines = ['# 餐厅资料采集', '',`状态：${result.status}`,`输入：${result.query.name} / ${result.query.location}`,
    `采集时间：${result.capturedAt}`,''];
  for (const [platform,p] of Object.entries(result.platforms)) {
    lines.push(`## ${platform}`,'',`状态：${p.status}`);
    if (!p.fields) { lines.push(p.error || '未确认唯一门店，请查看 JSON 中的候选信息。',''); continue; }
    const f = p.fields;
    lines.push(...(p.coverageNotes || []));
    lines.push(`来源：${p.url}`,'',`名称：${f.name.value || '未采集到'}`,`详细地址：${f.address.value || '未采集到'}`,
      `电话：${f.contact.value?.phone || '未采集到'}`,`网站：${f.contact.value?.website || '未采集到'}`,
      `简介（${f.description.kind || '未知来源'}）：${f.description.value || '未采集到'}`,
      `特色菜（平台特色/热门菜栏目）：${f.specialties.value?.join('、') || '未采集到'}`,'');
  }
  return lines.join('\n');
}
async function main() {
  const {values} = parseArgs({options:{name:{type:'string'},location:{type:'string'},output:{type:'string'},limit:{type:'string',default:'5'},
    headless:{type:'boolean'},help:{type:'boolean'},'google-url':{type:'string'},'yelp-url':{type:'string'}}});
  if (values.help) { console.log(help); return; }
  if (!values.name?.trim() || !values.location?.trim()) throw new Error('需要 --name 和 --location；位置建议包含街道、城市和州');
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('--limit 必须为 1–10');
  for (const [key,host] of [['google-url','google.com'],['yelp-url','yelp.com']]) {
    if (!values[key]) continue;
    const u = new URL(values[key]);
    if (u.protocol !== 'https:' || !(u.hostname === host || u.hostname.endsWith('.'+host)) || u.username || u.password ||
      !(key === 'google-url' ? u.pathname.startsWith('/maps/place/') : u.pathname.startsWith('/biz/')))
      throw new Error(`${key} 需要对应平台的 HTTPS 门店详情链接`);
  }
  let chromium;
  try { ({chromium} = await import(process.env.GEO_PLAYWRIGHT_MODULE || 'playwright')); }
  catch { throw new Error('缺少 Playwright，请按 README 安装依赖和 Chromium'); }
  const output = path.resolve(values.output || `output/${new Date().toISOString().replace(/[:.]/g,'-')}`);
  await mkdir(output,{recursive:true});
  const localChrome = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null;
  const executable = process.env.GEO_BROWSER_EXECUTABLE || (!existsSync(chromium.executablePath()) && localChrome && existsSync(localChrome) ? localChrome : null);
  const browser = await chromium.launch({headless:!!values.headless,chromiumSandbox:true,...(executable ? {executablePath:executable} : {})});
  const context = await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
  const platforms = {};
  try {
    for (const platform of ['google_maps','yelp']) {
      const page = await context.newPage();
      console.error(`正在采集 ${platform}…`);
      try {
        const direct = values[platform === 'google_maps' ? 'google-url' : 'yelp-url'];
        let candidates;
        if (direct) {
          await openPage(page,direct);
          await page.locator(platform === 'google_maps' ? '[data-item-id="address"]' : 'h1').first()
            .waitFor({state:'visible',timeout:30000}).catch(() => {});
          candidates = [{url:page.url(),...await page.evaluate(extractDocument,platform)}];
        }
        else candidates = await searchCandidates(page,platform,values.name,values.location,limit);
        const decision = choose(values.name,values.location,candidates);
        if (decision.selected) {
          if (page.url() !== decision.selected.url) {
            await openPage(page,decision.selected.url);
            await page.locator(platform === 'google_maps' ? '[data-item-id="address"]' : 'h1').first()
              .waitFor({state:'visible',timeout:30000}).catch(() => {});
          }
          const fresh = await page.evaluate(extractDocument,platform);
          const recheck = choose(values.name,values.location,[{url:page.url(),...fresh}]);
          if (!recheck.selected) throw new Error('保存证据前门店身份校验失败');
          decision.selected = {...recheck.selected};
          const html = await page.content();
          const file = `${platform}.html`;
          await writeFile(path.join(output,file),html,{mode:0o600});
          await page.screenshot({path:path.join(output,`${platform}.png`),fullPage:true});
          decision.evidence = {html:file,screenshot:`${platform}.png`,sha256:createHash('sha256').update(html).digest('hex')};
        }
        platforms[platform] = decision;
      } catch (error) {
        const failureEvidence = {};
        try {
          const html = await page.content();
          failureEvidence.html = `${platform}-failure.html`;
          failureEvidence.screenshot = `${platform}-failure.png`;
          failureEvidence.sha256 = createHash('sha256').update(html).digest('hex');
          await writeFile(path.join(output,failureEvidence.html),html,{mode:0o600});
          await page.screenshot({path:path.join(output,failureEvidence.screenshot),fullPage:true});
        } catch { /* Preserve the original acquisition error even if the browser has closed. */ }
        platforms[platform] = {status:'failed',error:error.message,evidence:failureEvidence};
      }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
  const result = makeResult({name:values.name,location:values.location},platforms,new Date().toISOString());
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
  await writeFile(path.join(output,'report.md'),markdown(result),{mode:0o600});
  console.log(JSON.stringify(result,null,2));
  console.error(`结果已保存：${output}`);
  if (result.status !== 'matched') process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => {console.error(error.message);process.exitCode = 1;});
