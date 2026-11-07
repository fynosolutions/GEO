import type {Page} from 'playwright';
import type {Price} from './extract.js';
import {classifyPage} from '../browser.js';

export function isGoogleMapsMenuUrl(value:string):boolean {
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(www\.)?google\.com$/.test(u.hostname)&&(/^\/maps\/place\/[^/]+/.test(u.pathname)||/^\/maps\/search\/?$/.test(u.pathname)&&!!u.searchParams.get('query_place_id'));}catch{return false;}
}
export type GoogleMenuCollection={complete:boolean;reason:string|null;categories_discovered:string[];categories_read:string[];scrolls:number};

/** Read only visible menu rows. Never infer dish prices from reviews, scripts or external links. */
export function visibleGoogleMenuRows(root:HTMLElement,input:string|{category:string;categories:string[]}):Price[]{
 const {category,categories}=typeof input==='string'?{category:input,categories:[input]}:input;
 const money=/^\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s*[-–]\s*\$?\d+(?:\.\d{1,2})?)?\s*(?:[+⁺])?$/;
 const visible=(el:HTMLElement)=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.getClientRects().length>0;};
 const clean=(s:string)=>s.replace(/[\uE000-\uF8FF]/g,'').replace(/\s+/g,' ').trim();
 const headings=Array.from(root.querySelectorAll<HTMLElement>('h2,h3,h4,[role="heading"]')).filter(n=>categories.includes(clean(n.innerText||''))&&!n.closest('[role="tablist"],nav'));
 const prices:Price[]=[],seen=new Set<string>();
 for(const el of Array.from(root.querySelectorAll<HTMLElement>('span,div,td,p'))){
  const price=clean(el.innerText||'');
  const section=headings.filter(h=>Boolean(h.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
  if(headings.length&&(!section||clean(section.innerText)!==category))continue;
  if(!visible(el)||!money.test(price)||Array.from(el.children).some(c=>money.test(clean((c as HTMLElement).innerText||''))))continue;
  let row=el.parentElement;
  for(let depth=0;row&&row!==root&&depth<5;depth++,row=row.parentElement){
   if(row.matches('nav,[role="tablist"],button,[role="button"]')&&row.querySelector('[role="tab"]'))break;
   const text=clean(row.innerText||'');
   if(text===price)continue;
   // Stop before a shared container can pair a dish with its neighbour's price.
   const distinct=Array.from(row.querySelectorAll<HTMLElement>('span,div,td,p')).filter(n=>visible(n)&&money.test(clean(n.innerText||''))&&!Array.from(n.children).some(c=>money.test(clean((c as HTMLElement).innerText||''))));
   if(distinct.length!==1)break;
   const nameBlocks=Array.from(row.children).filter(n=>!n.contains(el)&&visible(n as HTMLElement)).map(n=>clean((n as HTMLElement).innerText||'')).filter(Boolean);
   const heading=row.querySelector<HTMLElement>('h2,h3,h4,[role="heading"]');
   const name=heading?clean(heading.innerText):nameBlocks[0]||clean(text.slice(0,text.lastIndexOf(price)));
   if(!name||name.length>250||name===category||money.test(name)||/\$\s*\d/.test(name)||/^(?:reserve a table|order online|overview|reviews|菜单|概览)$/i.test(name))continue;
   const key=JSON.stringify([name,category,price]);if(!seen.has(key)){seen.add(key);prices.push({name,category,price,currency:null,variant:null,evidence:JSON.stringify({name,category,price,visible_text:text})});}
   break;
  }
 }
 return prices;
}


function scrollMenu(el:Element,reset:boolean){
 const ancestors:Element[]=[];for(let p=el.parentElement;p&&ancestors.length<5;p=p.parentElement){ancestors.push(p);if(p.getAttribute('role')==='main')break;}
 const candidates=[el,...ancestors,...Array.from(el.querySelectorAll('*'))].filter(n=>{const x=n as HTMLElement;return x.scrollHeight>x.clientHeight+2&&x.clientHeight>100&&/auto|scroll/.test(getComputedStyle(x).overflowY);}) as HTMLElement[];
 const target=candidates.sort((a,b)=>b.clientHeight-a.clientHeight)[0]||el as HTMLElement;
 if(reset)target.scrollTop=0;
 const top=target.scrollTop,height=target.scrollHeight,view=target.clientHeight,bottom=top+view>=height-3;
 if(!reset&&!bottom)target.scrollTop=Math.min(height,top+Math.max(100,view*0.75));
 return {top,height,view,bottom};
}

/** Interaction state machine shared by live Maps and browser fixtures. Bounds are total, not per category. */
export async function collectGoogleMenu(page:Page,signal:AbortSignal|undefined,deadline:number){
 const collection:GoogleMenuCollection={complete:false,reason:null,categories_discovered:[],categories_read:[],scrolls:0};
 const check=()=>{signal?.throwIfAborted();if(Date.now()>=deadline)throw Error('Google Maps menu time limit reached.');};
 const main=page.locator('[role="main"]').first();
 try{await main.waitFor({state:'visible',timeout:Math.max(1,Math.min(60000,deadline-Date.now()))});}catch{
  const body=await page.locator('body').innerText({timeout:1500}).catch(()=>'');
  if(classifyPage(null,body))throw Error('Google Maps menu access restricted; no login or challenge attempted.');
  throw Error('Google Maps merchant panel did not load within the bounded wait; menu availability is unknown.');
 }
 // Only merchant-scoped tabs: the global Maps hamburger is also called Menu.
 const menu=main.getByRole('tab').filter({hasText:/^(?:Menu|菜单|菜單)$/i}).first();
 try{await menu.waitFor({state:'visible',timeout:Math.max(1,Math.min(15000,deadline-Date.now()))});}
 catch{
  const body=await page.locator('body').innerText({timeout:1500}).catch(()=>'');
  if(classifyPage(null,body))throw Error('Google Maps menu access restricted; no login or challenge attempted.');
  if(/limited view of Google Maps|仅展示.*Google.*部分信息|Google 地图的部分信息/i.test(body))throw Error('Google Maps limited view: restaurant Menu categories are not exposed in this anonymous session; menu availability is unknown.');
  throw Error('Google Maps restaurant Menu tab was not exposed; menu availability is unknown.');
 }
 check();await menu.click({timeout:5000});
 // The category row contains its own Overview, distinct from the merchant navigation row.
 const row=main.locator('[role="tablist"]').filter({has:page.getByRole('tab',{name:/^(?:Overview|概览|總覽|概覽)$/i})}).filter({hasNot:page.getByRole('tab',{name:/^(?:Reviews|About|评价|評論|简介)$/i})}).last();
 await row.waitFor({state:'visible',timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
 const controls=row.getByRole('tab');
 const labels=await controls.allTextContents();
 const names=[...new Set(labels.map(s=>s.trim()).filter(s=>s&&!/^(?:Overview|概览|總覽|概覽)$/i.test(s)))];
 if(!names.length)throw Error('Google Maps Menu overview has no readable dish category tabs; external menu links are not Google dish records.');
 collection.categories_discovered=names;
 const prices:Price[]=[],seen=new Set<string>();
 // Browser fixtures exercise this same visible-row parser and scrolling state machine.
 try{
  for(const category of names.slice(0,40)){
   check();const previousCategory=collection.categories_read.at(-1);
   const previousRows=previousCategory?await main.evaluate(visibleGoogleMenuRows as (root:HTMLElement|SVGElement,input:{category:string;categories:string[]})=>Price[],{category:previousCategory,categories:names}):[];
   const previousSignature=JSON.stringify(previousRows.map(p=>[p.name,p.price]));
   const tab=controls.filter({hasText:new RegExp('^'+category.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).first();
   await tab.click({timeout:5000});
   // Do not read stale rows from the previously selected category.
   await page.waitForFunction(({category})=>Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).some(n=>(n.textContent||'').trim()===category),{category},{timeout:5000});
   await page.waitForTimeout(350);
   const scope=main.locator('[role="tabpanel"]:visible').last();
   const root=await scope.count()?scope:main;
   await root.evaluate(scrollMenu,true);await page.waitForTimeout(250);
   let ready=false,lastRows='',stableRows=0;
   const readyUntil=Math.min(deadline,Date.now()+6000);
   while(Date.now()<readyUntil){
    check();const rows=await root.evaluate(visibleGoogleMenuRows as (root:HTMLElement|SVGElement,input:{category:string;categories:string[]})=>Price[],{category,categories:names});
    const signature=JSON.stringify(rows.map(p=>[p.name,p.price]));
    const anchored=await root.locator('h2,h3,h4,[role="heading"]').filter({hasText:new RegExp('^'+category.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).count();
    const loading=await root.locator('[aria-busy="true"],[role="progressbar"]:visible').count();
    stableRows=rows.length&&!loading&&signature===lastRows?stableRows+1:0;lastRows=signature;
    if(stableRows>=2&&(!previousRows.length||signature!==previousSignature||anchored>0)){ready=true;break;}
    await page.waitForTimeout(250);
   }
   if(!ready)throw Error('Google Maps category exposed no supported dish rows or did not finish updating: '+category);
   let bottomStable=0,previous='',finished=false;
   for(let step=0;step<60;step++){
    check();
    const rows=await root.evaluate(visibleGoogleMenuRows as (root:HTMLElement|SVGElement,input:{category:string;categories:string[]})=>Price[],{category,categories:names});
    for(const item of rows){const key=JSON.stringify([item.category,item.name,item.price]);if(!seen.has(key)){seen.add(key);prices.push(item);}}
    const state=await root.evaluate(scrollMenu,false);
    collection.scrolls++;
    const signature=JSON.stringify([rows.map(x=>[x.name,x.price]),state.height,state.top]);
    bottomStable=state.bottom&&signature===previous?bottomStable+1:0;previous=signature;
    if(bottomStable>=2){finished=true;break;}
    await page.waitForTimeout(250);
   }
   if(!finished)throw Error('Google Maps category scroll limit reached: '+category);
   if(!prices.some(p=>p.category===category))throw Error('Google Maps category exposed no supported dish/price rows: '+category);
   collection.categories_read.push(category);
  }
  if(names.length>40)throw Error('Google Maps category limit reached.');
  collection.complete=true;
 }catch(error){if(signal?.aborted)throw error;collection.reason=error instanceof Error?error.message:'Google Maps menu incomplete.';}
 if(!prices.length)throw Error(collection.reason||'Google Maps Menu categories exposed no readable dish/price rows.');
 return {prices,collection,text:prices.map(p=>p.category+'\n'+p.name+' '+p.price).join('\n')};
}
