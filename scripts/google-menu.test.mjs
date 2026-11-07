import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {isGoogleMapsMenuUrl,visibleGoogleMenuRows,collectGoogleMenu} from '../dist/backend/menu-audit/google.js';
import {collectMenuAudit} from '../dist/backend/menu-audit/public.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function browserCase(fn){const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});try{const page=await b.newPage();await fn(page);}finally{await b.close();}}
const fixture=`<main role="main"><h1>Synthetic restaurant fixture</h1>
<button id="global" onclick="throw Error('Global menu must not be clicked')">Menu</button>
<div role="tablist"><button role="tab" id="entry" aria-selected="false">Menu</button><button role="tab">Overview</button><button role="tab">Reviews</button></div>
<div id="content" style="display:none"><div role="tablist" id="categories"><button role="tab" aria-selected="true">Overview</button><button role="tab" aria-selected="false">PREMIUM DIM SUM 精品点心</button><button role="tab" aria-selected="false">Soup Dumplings</button></div>
<div role="tabpanel" id="panel" style="height:180px;overflow-y:auto;position:relative"></div></div>
<script>
const groups={
 'PREMIUM DIM SUM 精品点心':[['Corn & Pork Dumplings (8pc) 玉米猪肉饺子 8PC','$9.95'],['Chive & Pork Dumplings (8pc) 韭菜猪肉饺子 8PC','$9.95'],['Vegetable Fried Rice 素菜炒饭','$14.99'],['Egg Fried Rice 蛋炒饭','$15.99'],['Chicken Fried Rice 鸡肉炒饭','$17.99']],
 'Soup Dumplings':[['Synthetic soup dumplings','$8.25'],['Synthetic soup bowl','$12.00']]};
let active='';entry.onclick=()=>{content.style.display='block';entry.setAttribute('aria-selected','true');panel.innerHTML='<a href="https://www.yelp.com/">External menu overview</a>'};
function draw(){const list=groups[active]||[],start=Math.floor(panel.scrollTop/100);panel.innerHTML='<div style="height:'+list.length*100+'px">'+list.slice(start,start+2).map(([n,p],i)=>'<div style="position:absolute;top:'+((start+i)*100)+'px;height:100px;display:flex"><div>'+n+'</div><span>'+p+'</span></div>').join('')+'</div>';}
for(const b of categories.querySelectorAll('[role="tab"]')) b.onclick=()=>{for(const x of categories.children)x.setAttribute('aria-selected',String(x===b));active=b.textContent;panel.scrollTop=0;draw()};
panel.addEventListener('scroll',draw);
</script>`;

test('Google menu routing accepts merchant Maps URLs, rejects redirects and non-merchant Google pages',()=>{
 assert.equal(isGoogleMapsMenuUrl('https://www.google.com/maps/search/?api=1&query_place_id=abc'),true);
 assert.equal(isGoogleMapsMenuUrl('https://www.google.com/maps/place/Example/data=!123'),true);
 for(const url of ['https://www.google.com/goto?url=x','https://www.google.com/maps','https://www.google.com/maps/search/?query=restaurants','https://www.google.com.evil.test/maps/place/x','https://user@google.com/maps/place/x','http://google.com/maps/place/x'])assert.equal(isGoogleMapsMenuUrl(url),false);
});

test('Google DOM reader visits categories beyond Overview and accumulates virtualized rows',async()=>browserCase(async page=>{
 await page.setContent(fixture);const result=await collectGoogleMenu(page,undefined,Date.now()+20000);
 assert.equal(result.collection.complete,true);assert.equal(result.prices.length,7);
 assert.deepEqual(result.collection.categories_read,['PREMIUM DIM SUM 精品点心','Soup Dumplings']);
 assert.equal(result.prices.find(p=>p.name==='Egg Fried Rice 蛋炒饭').price,'$15.99');
 assert.equal(result.prices.find(p=>p.name==='Chicken Fried Rice 鸡肉炒饭').category,'PREMIUM DIM SUM 精品点心');
 assert.equal(result.prices.filter(p=>p.name==='Synthetic soup bowl').length,1);
 assert.ok(result.collection.scrolls>4);
}));

test('Google visible row parsing does not pair neighbouring prices or read hidden/overview content',async()=>browserCase(async page=>{
 await page.setContent('<main><div><div>Dish A</div><span>$9.95</span></div><div><div>Dish B</div><span>$14.99</span></div><div hidden><div>Hidden dish</div><span>$99.00</span></div><button>Order online</button></main>');
 const rows=await page.locator('main').evaluate(visibleGoogleMenuRows,'Dim sum');
 assert.deepEqual(rows.map(x=>[x.name,x.price]),[['Dish A','$9.95'],['Dish B','$14.99']]);
}));

test('Google category parse failure preserves earlier dishes and marks collection partial',async()=>browserCase(async page=>{
 await page.setContent(fixture);await page.evaluate(()=>{groups['Soup Dumplings']=[]});
 const result=await collectGoogleMenu(page,undefined,Date.now()+20000);
 assert.equal(result.collection.complete,false);assert.equal(result.prices.length,5);
 assert.match(result.collection.reason,/no supported dish/);
 assert.deepEqual(result.collection.categories_read,['PREMIUM DIM SUM 精品点心']);
}));

test('partial Google menu remains incomplete in exported coverage and does not invent menu dates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'google-menu-'));
 try{
 const result=await collectMenuAudit({store_id:'fixture',name:'Fixture',address:'1 Test St',records:[],sources:[{platform:'google_maps',channel:'google_menu',url:'https://www.google.com/maps/place/Fixture',identity_verified:true}]},{root,platforms:['google_maps'],read:async url=>({url,format:'html',menuEvidence:true,text:'Fixture Dish $9.95',links:[],prices:[{name:'Fixture Dish',category:'Dim sum',price:'$9.95',variant:null,currency:null,evidence:'fixture'}],date:{menu_date:null,date_source:'unknown',date_text:null},fetched_at:new Date().toISOString(),sha256:'fixture',extraction:'google-maps-menu-dom',collection:{complete:false,reason:'Fixture category limit',categories_discovered:['Dim sum','Soup'],categories_read:['Dim sum'],scrolls:3}})});
 assert.equal(result.menus[0].menu_date,null);assert.equal(result.menus[0].collection.complete,false);
 assert.equal(result.coverage.find(c=>c.channel==='google_menu').status,'incomplete');
 assert.equal(result.summary.coverage_complete,false);assert.equal(result.prices.length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('Google limited view is reported as unavailable, without using the global Menu button',async()=>browserCase(async page=>{
 await page.setContent('<button onclick="document.body.dataset.clicked=1">Menu</button><main role="main"><h1>Fixture</h1><p>You are seeing a limited view of Google Maps.</p></main>');
 await assert.rejects(collectGoogleMenu(page,undefined,Date.now()+500),/limited view.*availability is unknown/);
 assert.equal(await page.locator('body').getAttribute('data-clicked'),null);
}));


test('Google scrolling section menus retain the actual category instead of relabelling every visible dish',async()=>browserCase(async page=>{
 await page.setContent('<main><h2>Dim sum</h2><div><div>Dumplings</div><span>$9.95</span></div><h2>Rice</h2><div><div>Fried rice</div><span>$14.99</span></div></main>');
 const rows=await page.locator('main').evaluate(visibleGoogleMenuRows,{category:'Rice',categories:['Dim sum','Rice']});
 assert.deepEqual(rows.map(x=>[x.category,x.name,x.price]),[['Rice','Fried rice','$14.99']]);
}));
