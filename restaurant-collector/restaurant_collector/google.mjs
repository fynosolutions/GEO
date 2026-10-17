import {extractDocument} from './extract.mjs';
import {choose,normalize} from './match.mjs';

export function classifyGoogle({url='',body='',status=200,challengeFrame=false}) {
  if (status === 429) return {status:'rate_limited',reason:'HTTP 429；停止请求，稍后再运行'};
  if (/\/sorry\//.test(url) || challengeFrame || /unusual traffic|our systems have detected|异常流量|不是机器人|verify you are human/i.test(body))
    return {status:'verification_required',reason:'Google 要求人工验证；未执行自动解题'};
  if (/consent\.google\./.test(url)) return {status:'consent_required',reason:'需要人工处理 Google 同意页面'};
  if (status >= 400) return {status:'access_denied',reason:`HTTP ${status}；未取得正常详情页`};
  if (/You're seeing a limited view of Google Maps|有限视图/i.test(body))
    return {status:'limited_view',reason:'Google 返回有限视图；不能据此断言已被反爬虫封禁'};
  return {status:'available',reason:null};
}
export async function inspectGoogle(page,status=200) {
  return classifyGoogle({url:page.url(),status,body:await page.locator('body').innerText({timeout:10000}).catch(()=>''),
    challengeFrame:await page.locator('iframe[src*="recaptcha"][title*="challenge"], iframe[src*="captcha-delivery.com"]').count() > 0});
}
export async function navigateGoogle(page,url,{delayMs=4000,interactive=false,confirm=async()=>{},onAccess=()=>{}}={}) {
  // Serial, bounded navigation. No proxy rotation, fingerprint modification or automatic challenge solving.
  await page.waitForTimeout(delayMs);
  const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(1500);
  let access = await inspectGoogle(page,response?.status() || 200);
  onAccess(access);
  if (interactive && ['verification_required','consent_required','limited_view'].includes(access.status)) {
    const message=access.status === 'limited_view' ?
      '当前是有限视图。可选择在项目浏览器中自行登录 Google，再按回车继续；保持未登录可直接按回车。登录不保证解除限制。' :
      access.reason+'。请在浏览器中手动处理，完成后回到终端按回车；不要向终端输入密码。';
    await confirm(message);
    // Inspect the user-visible result, never submit or solve a challenge on their behalf.
    access = await inspectGoogle(page);
    onAccess(access);
  }
  if (!['available','limited_view'].includes(access.status)) {
    const error = new Error(access.reason); error.code = access.status; throw error;
  }
  return access;
}
export function mergeObservations(base,observations) {
  const merged = {...base,dishes:[...(base.dishes || [])],evidence:{...base.evidence},coverageNotes:[...(base.coverageNotes || [])]};
  for (const {label,data} of observations) {
    // A pane navigation must never silently merge a different restaurant.
    if (data.name && normalize(data.name) !== normalize(base.name)) continue;
    if (!merged.description && data.description) {
      merged.description=data.description; merged.descriptionKind=data.descriptionKind;
      merged.evidence.description={pane:label,selector:data.evidence.description};
    }
    for (const dish of data.dishes || []) if (!merged.dishes.includes(dish)) merged.dishes.push(dish);
    if (data.dishes?.length) merged.evidence.specialties={pane:label,section:data.evidence.specialties};
    merged.coverageNotes.push(...(data.coverageNotes || []));
  }
  merged.coverageNotes=[...new Set(merged.coverageNotes)];
  return merged;
}
export async function collectGoogle(page,query,options) {
  const trace=[];
  const opts={...options,onAccess:a=>trace.push(a)};
  const searchUrl=options.url || `https://www.google.com/maps/search/${encodeURIComponent(query.name+' '+query.location)}?hl=en`;
  await navigateGoogle(page,searchUrl,opts);
  await page.locator('[data-item-id="address"], a[href*="/maps/place/"]').first().waitFor({state:'visible',timeout:45000}).catch(()=>{});
  const candidates=[];
  const candidateErrors=[];
  if (await page.locator('[data-item-id="address"]').count()) candidates.push({url:page.url(),...await page.evaluate(extractDocument,'google_maps')});
  else {
    const links=await page.locator('a[href*="/maps/place/"]').evaluateAll(els=>[...new Set(els.map(e=>e.href.split('?')[0]))]);
    if (!links.length) {
      const access=await inspectGoogle(page); trace.push(access);
      const e=new Error(access.reason || '搜索面板未加载或无可解析候选；请提供更明确的位置或 --url');
      e.code=access.status === 'available' ? 'search_unavailable' : access.status; throw e;
    }
    for (const url of links.slice(0,options.limit)) {
      try {
        await navigateGoogle(page,url,opts);
        await page.locator('[data-item-id="address"]').waitFor({state:'visible',timeout:30000});
        candidates.push({url:page.url(),...await page.evaluate(extractDocument,'google_maps')});
      } catch(e) {
        if (['rate_limited','verification_required','consent_required','access_denied'].includes(e.code)) throw e;
        candidateErrors.push({url,error:e.message});
      }
    }
  }
  const decision=choose(query.name,query.location,candidates);
  if (!decision.selected) return {...decision,trace,candidateErrors};
  if (page.url() !== decision.selected.url) {
    await navigateGoogle(page,decision.selected.url,opts);
    await page.locator('[data-item-id="address"]').waitFor({state:'visible',timeout:30000});
  }
  const base={url:page.url(),...await page.evaluate(extractDocument,'google_maps')};
  if (!choose(query.name,query.location,[base]).selected) throw new Error('详情页身份发生变化，停止保存');
  const observations=[];
  async function capture(label) {
    const access=await inspectGoogle(page); trace.push(access);
    if (!['available','limited_view'].includes(access.status)) {const e=new Error(access.reason); e.code=access.status; throw e;}
    const data=await page.evaluate(extractDocument,'google_maps');
    await options.capture(page,label);
    observations.push({label,data});
  }
  // Google renders many sections inside a scrollable details pane rather than the page body.
  await capture('overview');
  const pane=page.locator('[role="main"]').first();
  if (await pane.count()) {
    for (let i=0;i<3;i++) {
      await pane.hover(); await page.mouse.wheel(0,650); await page.waitForTimeout(1000);
      await capture(`overview-scroll-${i+1}`);
    }
  }
  const tabs=await page.getByRole('tab').all();
  const tabNames=[];
  for (const tab of tabs) tabNames.push(await tab.getAttribute('aria-label') || await tab.innerText());
  // Only read known information panes. Reviews and owner promotional posts are not merchant descriptions.
  for (const prefix of ['About','Menu']) {
    const name=tabNames.find(n=>n === prefix || n.startsWith(prefix+' '));
    if (!name) continue;
    await page.getByRole('tab',{name,exact:true}).click(); await page.waitForTimeout(2000);
    await capture(prefix.toLowerCase());
  }
  const selected={...decision.selected,...mergeObservations(base,observations)};
  return {status:'matched',selected,candidates:[],trace,candidateErrors};
}
