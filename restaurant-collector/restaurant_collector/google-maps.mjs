import {parseArgs} from 'node:util';
import {mkdir,writeFile,open,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {collectGoogle} from './google.mjs';
import {makeResult,markdown} from './cli.mjs';

const {values:v}=parseArgs({options:{name:{type:'string'},location:{type:'string'},url:{type:'string'},
  output:{type:'string'},profile:{type:'string'},interactive:{type:'boolean'},headless:{type:'boolean'},
  limit:{type:'string',default:'3'},'delay-ms':{type:'string',default:'4000'},help:{type:'boolean'}}});
if (v.help) {
  console.log(`Google Maps 单店资料采集
node restaurant_collector/google-maps.mjs --name "Easy Joy" --location "145 Mulberry St, New York, NY"
--url <Google Maps详情链接>  跳过搜索，仍核对门店
--interactive               验证/同意页/有限视图停留，供人工处理（需要可见浏览器和终端）
--profile <目录>            可选项目专用持久档案；勿使用日常 Chrome 档案
--headless                  无界面运行
--limit <1-5>               最多检查候选数，默认 3
--delay-ms <毫秒>           导航最小间隔，至少 3000，默认 4000
--output <目录>             结果和分栏目证据目录`);
} else {
  let browser,context,lock;
  let output;
  let ownedLock=false;
  try {
    if (!v.name?.trim() || !v.location?.trim()) throw new Error('需要 --name 和 --location');
    if (v.interactive && (v.headless || !process.stdin.isTTY)) throw new Error('--interactive 需要终端及可见浏览器');
    const limit=Number(v.limit),delayMs=Number(v['delay-ms']);
    if (!Number.isInteger(limit) || limit<1 || limit>5 || !Number.isFinite(delayMs) || delayMs<3000 || delayMs>60000) throw new Error('limit 需为 1–5，delay-ms 需为 3000–60000');
    if (v.url) {
      const url=new URL(v.url);
      if (url.protocol !== 'https:' || !['google.com','www.google.com','maps.google.com'].includes(url.hostname) ||
        !url.pathname.startsWith('/maps/place/') || url.username || url.password) throw new Error('--url 需要完整 Google Maps HTTPS 门店详情链接');
    }
    output=path.resolve(v.output || `output/google-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    await mkdir(output,{recursive:true});
    lock=path.resolve('.google-maps-collector.lock');
    const fd=await open(lock,'wx'); ownedLock=true; await fd.writeFile(String(process.pid)); await fd.close();
    const {chromium}=await import(process.env.GEO_PLAYWRIGHT_MODULE || 'playwright');
    const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const executablePath=process.env.GEO_BROWSER_EXECUTABLE ||
      (!existsSync(chromium.executablePath()) && existsSync(macChrome) ? macChrome : undefined);
    const launch={headless:!!v.headless,chromiumSandbox:true,...(executablePath ? {executablePath} : {})};
    if (v.profile) {
      const profile=path.resolve(v.profile);
      if (profile.includes('/Google/Chrome/') || /[\\/]Chrome[\\/]User Data/i.test(profile)) throw new Error('请使用项目专用档案目录，不使用日常 Chrome 档案');
      console.error(`使用项目档案：${profile}；浏览器登录状态可能保存在此目录。`);
      context=await chromium.launchPersistentContext(profile,{...launch,locale:'en-US',viewport:{width:1440,height:1000}});
    } else {
      browser=await chromium.launch(launch);
      context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
    }
    const page=await context.newPage();
    const evidence=[];
    async function capture(page,label) {
      const html=await page.content();
      await writeFile(path.join(output,`${label}.html`),html,{mode:0o600});
      await page.screenshot({path:path.join(output,`${label}.png`),fullPage:false});
      evidence.push({pane:label,url:page.url(),capturedAt:new Date().toISOString(),html:`${label}.html`,
        screenshot:`${label}.png`,sha256:createHash('sha256').update(html).digest('hex')});
    }
    async function confirm(message) {
      const rl=createInterface({input:process.stdin,output:process.stderr});
      try {await rl.question(message+'\n');} finally {rl.close();}
    }
    let decision;
    try {
      decision=await collectGoogle(page,{name:v.name,location:v.location},{url:v.url,limit,delayMs,interactive:v.interactive,capture,confirm});
    } catch(error) {
      await capture(page,'failure').catch(()=>{});
      decision={status:error.code || 'failed',error:error.message};
    }
    decision.evidence=evidence;
    const result=makeResult({name:v.name,location:v.location},{google_maps:decision},new Date().toISOString());
    result.schemaVersion='google-maps.collection.v1';
    result.status=decision.status === 'matched' ? (decision.selected.coverageNotes?.length ? 'limited_view' : 'collected') : decision.status;
    result.accessTrace=decision.trace || [];
    result.fieldCoverage=decision.selected ? {
      collected:['name','address','contact','description','specialties'].filter(k=>result.platforms.google_maps.fields[k].status === 'observed'),
      notCollected:['name','address','contact','description','specialties'].filter(k=>result.platforms.google_maps.fields[k].status !== 'observed'),
    } : {collected:[],notCollected:['name','address','contact','description','specialties']};
    result.completeness=result.fieldCoverage.notCollected.length === 0 ? 'complete' : result.fieldCoverage.collected.length ? 'partial' : 'none';
    await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
    await writeFile(path.join(output,'report.md'),markdown(result),{mode:0o600});
    console.log(JSON.stringify(result,null,2));
    console.error(`结果：${output}`);
    if (result.fieldCoverage.notCollected.length) process.exitCode=2;
  } catch(error) {console.error(error.code === 'EEXIST' ? '已有 Google 采集任务运行；异常退出时先确认进程已结束，再删除 .google-maps-collector.lock' : error.message); process.exitCode=1;}
  finally {
    await context?.close().catch(()=>{}); await browser?.close().catch(()=>{});
    if (ownedLock) await unlink(lock).catch(()=>{});
  }
}
