import './config.js';
import { chromium, type BrowserContext } from 'playwright';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

export type BrowserSnapshot = {
  url: string; status: 'readable' | 'blocked' | 'error'; http_status: number | null;
  text: string; links: { text: string; url: string }[]; screenshot: string | null; note: string | null;
  screenshots?: string[];
  structured_data?: unknown[];
  requested_locale?:string;page_language?:string;
  wait_ms?:number; challenge_detected?:boolean; challenge_frames?:string[]; initial_http_status?:number|null;
  navigation_error?:string; session_persistent?:boolean;
};
export function englishUrl(url:string):string {
  const u=new URL(url);
  if(/(^|\.)google\.com$/.test(u.hostname)) {u.searchParams.set('hl','en');u.searchParams.set('gl','us');}
  if(/^(www\.)?yelp\.com$/.test(u.hostname))u.searchParams.set('hl','en_US');
  return u.href;
}
export function sameDocumentUrl(a:string,b:string):boolean {
  try {const normalize=(value:string)=>{const u=new URL(value);for(const k of ['hl','gl'])u.searchParams.delete(k);u.hash='';u.searchParams.sort();return u.href;};return normalize(a)===normalize(b);}catch{return false;}
}
export function matchesDomains(url: string, domains: readonly string[]): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password
    && (!u.port || u.port === '443') && domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`)); } catch { return false; }
}
/** Discovery sources are not necessarily restaurant listings (e.g. Yelp legal PDFs). */
export function isListingCandidate(url: string, platform: string): boolean {
  try {
    const u=new URL(url);
    if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || /\.(pdf|zip|docx?|png|jpe?g)(?:$|\/)/i.test(u.pathname))return false;
    if(platform==='yelp')return /^(?:(?:www|m)\.)?yelp\.com$/i.test(u.hostname) && /^\/biz\/[^/]+\/?$/i.test(u.pathname);
    if(platform==='opentable')return /(^|\.)opentable\.com$/.test(u.hostname)&&/^\/r\/[^/]+/.test(u.pathname);
    if(platform==='uber_eats')return /(^|\.)ubereats\.com$/.test(u.hostname)&&/\/store\//.test(u.pathname);
    if(platform==='doordash')return /(^|\.)doordash\.com$/.test(u.hostname)&&/\/store\//.test(u.pathname);
    if(platform==='grubhub')return /(^|\.)grubhub\.com$/.test(u.hostname)&&/^\/restaurant\//.test(u.pathname);
    if(platform==='tripadvisor')return /(^|\.)tripadvisor\.com$/.test(u.hostname)&&/^\/Restaurant_Review-/.test(u.pathname);
    if(platform==='google_maps')return /^(www\.|maps\.)?google\.com$/i.test(u.hostname) && (/^\/maps(?:\/|$)/.test(u.pathname) || (u.hostname==='maps.google.com' && u.pathname==='/' && ['cid','q','ftid','place_id'].some(k=>u.searchParams.has(k))));
    if(platform==='facebook')return /(^|\.)facebook\.com$/.test(u.hostname) && (u.pathname==='/profile.php'?!!u.searchParams.get('id'):(/^\/(?:p|people)\/[^/]+\/\d+\/?$/.test(u.pathname)||/^\/p\/[^/]+-\d+\/?$/.test(u.pathname))||/^\/(?!search(?:\/|$)|login(?:\/|$)|watch(?:\/|$)|share(?:\/|$)|groups(?:\/|$)|photo|reel|posts|events|marketplace|help|policies|privacy)[a-zA-Z0-9._-]+\/?$/.test(u.pathname));
    return true;
  }catch{return false;}
}
export function isPublicIP(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return ![0,10,127].includes(a) && a < 224 && !(a===169 && b===254) && !(a===172 && b>=16 && b<=31)
      && !(a===192 && (b===168 || b===0)) && !(a===100 && b>=64 && b<=127) && !(a===198 && (b===18 || b===19));
  }
  // IPv6 public global unicast only; excludes loopback, link-local and mapped IPv4.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}
export function classifyPage(http: number | null, text: string): boolean {
  return http === 401 || http === 403 || http === 429 || /verify (?:that )?you are human|access denied|unusual traffic|complete the captcha|checking your browser|sign in to continue|log in to continue|访问暂时受限|验证码|人机验证/i.test(text.slice(0, 10000));
}
let tail = Promise.resolve();
/** Serialize browser sessions to avoid competing with each other for memory. */
export async function readWithBrowser(url: string, domains: readonly string[], directory: string, key: string, signal?: AbortSignal): Promise<BrowserSnapshot> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>(r => { release = r; });
  await previous;
  try { signal?.throwIfAborted(); return await readPage(url, domains, directory, key,signal); } finally { release(); }
}
async function readPage(url: string, domains: readonly string[], directory: string, key: string, signal?: AbortSignal): Promise<BrowserSnapshot> {
  url=englishUrl(url);
  const snapshot: BrowserSnapshot = { url, status: 'error', http_status: null, text: '', links: [], screenshot: null, note: null,requested_locale:'en-US' };
  if (!matchesDomains(url, domains)) return { ...snapshot, note: 'Browser URL is outside the permitted HTTPS platform domains.' };
  let context: BrowserContext | undefined;
  const stop = () => { void context?.close().catch(()=>{}); };
  try {
    const proxyUrl = process.env.BROWSER_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const env = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','HOME','USERPROFILE','LOCALAPPDATA'].flatMap(k => process.env[k] ? [[k,process.env[k]!]] : []));
    // Dedicated profiles only: never open the user's personal browser profile.
    const profile=resolve(process.env.BROWSER_PROFILE_DIR || '.local/browser-profiles',domains[0].replace(/[^a-z0-9.-]/gi,'_'));
    await mkdir(profile,{recursive:true});
    context = await chromium.launchPersistentContext(profile,{
      channel: process.env.BROWSER_CHANNEL || 'chromium',
      headless: process.env.BROWSER_HEADLESS !== 'false', env,
      args:['--lang=en-US'],
      locale:'en-US',extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'},viewport:{width:1365,height:900},serviceWorkers:'block',acceptDownloads:false,
      proxy: proxy ? { server: `${proxy.protocol}//${proxy.host}`, username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password), bypass: 'localhost,127.0.0.1' } : undefined,
    });
    snapshot.session_persistent=true;
    signal?.addEventListener('abort',stop,{once:true}); signal?.throwIfAborted();
    const publicHosts = new Map<string, boolean>();
    await context.route('**/*', async route => {
      try {
        const request = route.request(), u = new URL(request.url());
        if (!['http:','https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) return await route.abort();
        // Maps needs anonymous read RPCs to render public place panels.
        const mapsRead = request.method()==='POST' && /(^|\.)google\.com$/.test(u.hostname)
          && /^\/maps\/(?:preview\/rpc|rpc\/|preview\/entityreviews)/.test(u.pathname);
        if (!['GET','HEAD','OPTIONS'].includes(request.method()) && !mapsRead) return await route.abort();
        if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame() && !matchesDomains(u.href, domains)) return await route.abort();
        let allowed = publicHosts.get(u.hostname);
        if (allowed === undefined) {
          const addresses = await lookup(u.hostname, { all: true });
          allowed = addresses.length > 0 && addresses.every(a => isPublicIP(a.address)); publicHosts.set(u.hostname,allowed);
        }
        if (!allowed) return await route.abort();
        await route.continue();
      } catch { await route.abort().catch(() => {}); }
    });
    await context.routeWebSocket('**/*', ws => ws.close());
    const page = await context.newPage();
    snapshot.screenshots=[];
    const capture=async(file:string)=>{
      try {
        const cdp=await context!.newCDPSession(page);
        let timer:ReturnType<typeof setTimeout>|undefined;
        try {const image=await Promise.race([cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Screenshot timeout')),5000);})]);await writeFile(join(directory,file),Buffer.from(image.data,'base64'));snapshot.screenshots!.push(file);}
        finally{if(timer)clearTimeout(timer);await cdp.detach();}
      }catch{/* A missing screenshot must never become fabricated visual evidence. */}
    };
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    page.on('dialog', dialog => void dialog.dismiss());
    // Track the latest main document, not a stale 403 before a natural redirect/reload.
    page.on('response',response=>{const r=response.request();if(r.isNavigationRequest() && r.frame()===page.mainFrame())snapshot.http_status=response.status();});
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(error=>{snapshot.navigation_error=String(error.message).slice(0,500);});
    snapshot.initial_http_status=snapshot.http_status;
    await page.waitForTimeout(2000);
    if(/(^|\.)google\.com$/.test(new URL(page.url()).hostname)) await page.waitForFunction(()=>!!document.querySelector('h1')?.textContent?.trim(),{},{timeout:25000}).catch(()=>{});
    const waitStarted=Date.now();
    const configured=Number(process.env.BROWSER_SETTLE_TIMEOUT_MS || 45000);
    const waitLimit=Number.isFinite(configured)?Math.max(0,Math.min(120000,configured)):45000;
    let stable=0,previousText='';
    snapshot.challenge_detected=false;
    while(true) {
      signal?.throwIfAborted();
      const body=await page.locator('body').innerText({timeout:2000}).catch(()=>'');
      const frames=page.frames().filter(f=>f!==page.mainFrame()).map(f=>f.url());
      const challengeFrames=frames.filter(u=>/captcha-delivery\.com|\/captcha(?:\/|\?)|challenges\.cloudflare\.com/i.test(u));
      snapshot.challenge_frames=challengeFrames;
      const blocked=classifyPage(snapshot.http_status,body)||challengeFrames.length>0;
      snapshot.challenge_detected ||= blocked;
      stable=body===previousText?stable+1:0;previousText=body;
      // Wait for normal page JS, never click/solve a challenge or reload repeatedly.
      if(!blocked && body.trim().length>80 && stable>=2)break;
      if(Date.now()-waitStarted>=waitLimit)break;
      await page.waitForTimeout(1000);
    }
    snapshot.wait_ms=Date.now()-waitStarted;
    snapshot.url = page.url();
    snapshot.page_language=await page.locator('html').getAttribute('lang')||'unknown';
    if (!matchesDomains(snapshot.url, domains)) throw new Error('Unexpected redirect');
    snapshot.structured_data = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(node => { try { return [JSON.parse(node.textContent || '')]; } catch { return []; } }));
    snapshot.text = (await page.locator('body').innerText({ timeout: 5000 })).slice(0, 45000);
    await capture(`${key}.browser.png`);
    if (!classifyPage(snapshot.http_status, snapshot.text) && !snapshot.challenge_frames?.length) {
      // Only expand explicitly labeled information controls. Never click ordering/login/booking actions.
      const hours = page.getByRole('button', { name: /^(see all hours|show all hours|view hours|opening hours)$/i }).first();
      if (await hours.isVisible().catch(() => false)) await hours.click({timeout:2000}).catch(() => {});
      for (let i=0; i<2; i++) { await page.mouse.wheel(0,650); await page.waitForTimeout(400); }
      await capture(`${key}.view-1.png`);
      snapshot.text = (await page.locator('body').innerText()).slice(0,45000);
      snapshot.links = await page.locator('a:visible').evaluateAll(links => links.slice(0,250).map(a => ({ text: (a as HTMLElement).innerText, url: (a as HTMLAnchorElement).href })));
      const frames=await page.locator('iframe[src]').evaluateAll(frames=>frames.map(f=>({text:'Embedded map',url:(f as HTMLIFrameElement).src})).filter(f=>/google\.com\/maps/.test(f.url)));
      snapshot.links.push(...frames);
    }
    // A canvas-only listing has no extractable text; retain diagnostics only.
    snapshot.status = classifyPage(snapshot.http_status,snapshot.text) || snapshot.challenge_frames?.length ? 'blocked' : (snapshot.http_status && snapshot.http_status >= 400 || !snapshot.http_status && snapshot.navigation_error ? 'error' : 'readable');
    snapshot.note = snapshot.status === 'blocked' ? `Access challenge or login wall remains after ${Math.round(snapshot.wait_ms/1000)}s of passive waiting. Dedicated session saved; no challenge solving attempted.` : 'Persistent read-only browser snapshot; only visible text and links were inspected. No newest-review sorting was performed.';
    snapshot.screenshot = snapshot.screenshots[0] || null;
    if(snapshot.page_language!=='unknown' && !snapshot.page_language.toLowerCase().startsWith('en'))snapshot.note+=` Requested en-US, but page declares ${snapshot.page_language}; original text was preserved, not translated.`;
  } catch(error) { snapshot.note = `Browser could not read this URL: ${error instanceof Error?error.message.slice(0,400):'unknown error'}`; }
  finally { signal?.removeEventListener('abort',stop); await context?.close().catch(() => {}); }
  return snapshot;
}
