import { extractDocument } from './extract.mjs';

export class AccessError extends Error {}
export async function openPage(page, url) {
  const response = await page.goto(url, {waitUntil:'domcontentloaded',timeout:45000});
  if (response && response.status() >= 400) throw new AccessError(`HTTP ${response.status()}`);
  // Let client-rendered listing fields settle; this is a bounded render wait, not a retry loop.
  await page.waitForTimeout(2000);
  const body = (await page.locator('body').innerText()).slice(0,12000);
  if (/unusual traffic|verify you are human|verify you're human|enable javascript and cookies to continue|access denied|our systems have detected/i.test(body) || /\/sorry\//.test(page.url()))
    throw new AccessError('平台要求验证或拒绝访问；请人工核对后重试');
  if (/consent.google/.test(page.url())) throw new AccessError('Google 同意页面尚未处理；请使用可见浏览器人工处理后重试');
}
export async function searchCandidates(page, platform, name, location, limit) {
  const url = platform === 'google_maps' ?
    `https://www.google.com/maps/search/${encodeURIComponent(name+' '+location)}?hl=en` :
    `https://www.yelp.com/search?find_desc=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(location)}`;
  await openPage(page,url);
  await page.locator(platform === 'google_maps' ? '[data-item-id="address"], a[href*="/maps/place/"]' : 'a[href*="/biz/"]')
    .first().waitFor({state:'attached',timeout:45000}).catch(() => {});
  if (platform === 'google_maps' && await page.locator('[data-item-id="address"]').count()) {
    return [{url:page.url(), ...await page.evaluate(extractDocument, platform)}];
  }
  const links = await page.locator(platform === 'google_maps' ? 'a[href*="/maps/place/"]' : 'a[href*="/biz/"]').evaluateAll(els =>
    [...new Set(els.map(e => e.href.split('?')[0]))]);
  const candidates = [];
  for (const link of links.slice(0,limit)) {
    try {
      await openPage(page,link);
      await page.locator(platform === 'google_maps' ? '[data-item-id="address"]' : 'h1').first()
        .waitFor({state:'visible',timeout:30000}).catch(() => {});
      const data = await page.evaluate(extractDocument,platform);
      if (data.name && data.address) candidates.push({url:page.url(),...data});
    } catch (error) {
      if (error instanceof AccessError) throw error;
      // A broken candidate is omitted, never interpreted as a nonexistent listing.
    }
  }
  if (!links.length) throw new AccessError('未识别到搜索结果；可能是页面结构变化、登录要求或无结果，需人工核对');
  if (!candidates.length) throw new AccessError('候选页没有取得名称及地址，无法可靠匹配');
  return candidates;
}
