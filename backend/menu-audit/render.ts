import {chromium} from 'playwright';
import {lookup} from 'node:dns/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {htmlDocument,type Document} from './extract.js';
import {extractDate} from './dates.js';
import {orderingProvider} from './sources.js';
import {isPublicIP,classifyPage} from '../browser.js';

/** Exact anonymous initialization/read requests observed in the public ordering page. */
export function allowMenuRequest(method:string,value:string,targetHost:string):boolean{
 try{const u=new URL(value);
 if(['GET','HEAD','OPTIONS'].includes(method))return true;
 if(method!=='POST'||targetHost!=='order.mealkeyway.com')return false;
 if(u.hostname==='order.mealkeyway.com')return /^\/merchant\/[^/]+\/(?:info|menu|popularItem)$/.test(u.pathname)||['/member/getMerchantConfig','/member/getAllBusinessInfo'].includes(u.pathname);
 return u.hostname==='c.riskified.com'&&u.pathname==='/v2/client_infos'||u.hostname==='play.google.com'&&u.pathname==='/log';
 }catch{return false;}
}

let tail=Promise.resolve();
/** Anonymous public menu rendering. Never clicks ordering, login, checkout or challenge controls. */
export async function readRenderedMenu(url:string,signal?:AbortSignal,includePrices=true):Promise<Document>{
 const before=tail;let release!:()=>void;tail=new Promise<void>(r=>{release=r;});await before;
 try{return await render(url,signal,includePrices);}finally{release();}
}
async function render(url:string,signal?:AbortSignal,includePrices=true):Promise<Document>{
 const target=new URL(url);
 if(!orderingProvider(url)&&!(/^https:\/\/(?:www\.|m\.)?yelp\.com\/menu\/[^/]+\/?(?:\?.*)?$/.test(url)))throw Error('Unsupported rendered menu source.');
 const configured=Number(process.env.MENU_BROWSER_TIMEOUT_MS||(orderingProvider(url)==='mealkeyway'?'180000':'90000')),limit=Number.isFinite(configured)?Math.max(5000,Math.min(180000,configured)):90000;
 const proxyUrl=process.env.BROWSER_PROXY||process.env.HTTPS_PROXY||process.env.https_proxy,proxy=proxyUrl?new URL(proxyUrl):null;
 const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','HOME','USERPROFILE','LOCALAPPDATA'].flatMap(k=>process.env[k]?[[k,process.env[k]!]]:[]));
 signal?.throwIfAborted();
 const launchOptions={channel:process.env.BROWSER_CHANNEL||undefined,headless:process.env.BROWSER_HEADLESS!=='false',env,proxy:proxy?{server:proxy.protocol+'//'+proxy.host,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'localhost,127.0.0.1'}:undefined};
 let browser;
 try{browser=await chromium.launch(launchOptions);}catch(e){
  if(process.platform!=='darwin'||!String(e).includes("Executable doesn't exist")||launchOptions.channel&&launchOptions.channel!=='chromium')throw e;
  browser=await chromium.launch({...launchOptions,channel:'chrome'}); // Installed Chrome supports local use while CI installs Chromium.
 }
 const stop=()=>{void browser.close().catch(()=>{});},timer=setTimeout(stop,limit+25000);signal?.addEventListener('abort',stop,{once:true});
 try{
  const context=await browser.newContext({locale:'en-US',viewport:{width:1365,height:900},serviceWorkers:'block',acceptDownloads:false});
  const blockedRequests:Array<{method:string;host:string;path:string}>=[];
  const hosts=new Map<string,Promise<boolean>>();
  await context.route('**/*',async route=>{
   try{
    const request=route.request(),u=new URL(request.url());
    if(['image','font','media'].includes(request.resourceType()))return await route.abort(); // Text/price extraction does not download dish photos or payment media.
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))return await route.abort();
    if(!allowMenuRequest(request.method(),u.href,target.hostname)){blockedRequests.push({method:request.method(),host:u.hostname,path:u.pathname});return await route.abort();}
    if(request.isNavigationRequest()&&request.frame()===request.frame().page().mainFrame()&&u.hostname!==target.hostname)return await route.abort();
    let valid=hosts.get(u.hostname);if(!valid){valid=lookup(u.hostname,{all:true}).then(rows=>rows.length>0&&rows.every(r=>isPublicIP(r.address)));hosts.set(u.hostname,valid);}
    if(!await valid)return await route.abort();await route.continue();
   }catch{await route.abort().catch(()=>{});}
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const errors:string[]=[];
  const network:Array<{path:string;status?:number;error?:string}>=[];
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{try{network.push({path:new URL(r.url()).origin+new URL(r.url()).pathname,error:r.failure()?.errorText});}catch{}});
  page.on('response',r=>{const u=new URL(r.url());if(u.hostname===target.hostname)network.push({path:u.pathname,status:r.status()});});context.on('page',popup=>{if(popup!==page)void popup.close();});page.on('dialog',d=>void d.dismiss());
  let status:number|null=null;
  page.on('response',r=>{if(r.request().isNavigationRequest()&&r.frame()===page.mainFrame())status=r.status();});
  await page.goto(url,{waitUntil:'commit',timeout:20000}).catch(()=>{});
  const started=Date.now();let lastCount=-1,stable=0,parsed:ReturnType<typeof htmlDocument>|null=null,html='';
  while(Date.now()-started<limit){
   signal?.throwIfAborted();
   const text=await page.locator('body').innerText({timeout:1500}).catch(()=>'');
   const challenge=page.frames().some(f=>/captcha-delivery\.com|challenges\.cloudflare\.com|\/captcha(?:\/|\?)/i.test(f.url()));
   if(classifyPage(status,text)||challenge)throw Error('Rendered menu access restricted (HTTP '+status+'); no challenge or login was attempted.');
   html=await page.content();parsed=htmlDocument(html,page.url(),true);
   const count=parsed.prices.length;stable=count>0&&count===lastCount?stable+1:0;lastCount=count;
   if(count>0&&stable>=2)break;
   await page.waitForTimeout(1000);
  }
  if(!parsed?.prices.length){
   if(process.env.MENU_BROWSER_DEBUG==='true'){await mkdir('.local/menu-browser',{recursive:true});await writeFile('.local/menu-browser/'+target.hostname+'.json',JSON.stringify({url,text:parsed?.text,blockedRequests,network,errors,html},null,2));}
   throw Error('Rendered menu did not expose supported dish/price cards before the time limit.');
  }
  const fetched_at=new Date().toISOString();
  return {url:page.url(),format:'html',...parsed,prices:includePrices?parsed.prices:[],date:extractDate(parsed.text),fetched_at,sha256:createHash('sha256').update(html).digest('hex'),extraction:'browser-dom'};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);await browser.close().catch(()=>{});}
}
