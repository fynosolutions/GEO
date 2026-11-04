import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractDate,freshness,channelsOutOfSync,compareHours,collectMenuAudit} from '../dist/backend/menu-audit/public.js';
import {htmlDocument,pricesFromText} from '../dist/backend/menu-audit/extract.js';
import {menuObservations,menuChanges} from '../dist/backend/weekly/menus.js';
test('menu dates retain precision and choose evidence in order',()=>{
 assert.equal(extractDate('Menu 2024','2026-10-01').menu_date,'2024');
 assert.equal(extractDate('Spring 2026').menu_date,'Spring 2026');
 assert.equal(extractDate('Copyright 2026').date_source,'unknown');
 assert.equal(extractDate('Menu','2024-05-01','2025-01-01').date_source,'metadata');
 assert.equal(extractDate('Menu',null,'2024-05-01').date_source,'upload_date');
 assert.equal(extractDate('Updated 2024; Updated 2026').menu_date,null);
});
test('age thresholds use calendar months and uncertainty',()=>{
 assert.equal(freshness('2024','2026-11-04').freshness,'stale');
 assert.equal(freshness(null,'2026-11-04').freshness,'unknown_date');
 assert.equal(freshness('2025-11-04','2026-11-04').freshness,'fresh');
 assert.equal(freshness('2025','2026-11-04').freshness,'uncertain_date');
 assert.equal(freshness('2027','2026-11-04').freshness,'future_date');
 const a={channel:'yelp',url:'a',menu_date:'2024'},b={channel:'official',url:'b',menu_date:'2026'};
 assert.equal(channelsOutOfSync([a,b])[0].oldest_channel,'yelp');
});
test('hours compare delivery closing exceptions and opening times, overnight and missing',()=>{
 const record=(platform,hours)=>({platform,found:true,matched:true,hours,url:'https://example.com',fetched_at:'2026-11-04T00:00:00Z'});
 const rows=compareHours([record('google_maps',{Mon:'10:00-22:00',Tue:'6 PM-2 AM'}),record('doordash',{Mon:'10:00-21:30',Tue:'6 PM-1:30 AM'}),record('uber_eats',{Mon:'10:00-21:15'}),record('grubhub',{Mon:'11:00-21:30'}),record('yelp',{Mon:'10:00-21:30'})]);
 const get=(p,d='Monday')=>rows.find(r=>r.platform===p&&r.day===d);
 assert.equal(get('doordash').verdict,'外卖常规提前');assert.equal(get('doordash').diff_minutes,-30);
 assert.equal(get('uber_eats').verdict,'不一致');assert.equal(get('uber_eats').diff_minutes,-45);
 assert.equal(get('grubhub').verdict,'不一致');assert.equal(get('yelp').verdict,'不一致');
 assert.equal(get('doordash','Tuesday').verdict,'外卖常规提前');assert.equal(get('yelp','Wednesday').verdict,null);
});
test('HTML menus preserve structured prices and do not infer currency from dollar symbol',()=>{
 const html='<body><script type="application/ld+json">{"@type":"MenuItem","name":"Noodles","offers":{"price":"12.50","priceCurrency":"USD"}}</script><a href="/menu.pdf">Menu</a></body>';
 const doc=htmlDocument(html,'https://example.com');assert.equal(doc.prices[0].price,'12.50');assert.deepEqual(doc.links,['https://example.com/menu.pdf']);
 assert.equal(pricesFromText('Noodles $12.50')[0].currency,null);
});
test('seven channel coverage distinguishes collection failures and captures sourced menu prices',async()=>{
 const root=await mkdtemp(join(tmpdir(),'menu-audit-'));try{
 const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[],sources:[{channel:'official_html',platform:'official',url:'https://example.com/menu',identity_verified:true},{channel:'yelp_menu',platform:'yelp',url:'https://yelp.com/menu',identity_verified:true}]},{root,read:async url=>{
  if(url.includes('yelp'))throw Error('HTTP 403');return {url,format:'html',text:'Menu 2024',links:[],prices:[{name:'Noodles',variant:null,price:'$12.50',currency:null,evidence:'Noodles $12.50'}],date:extractDate('Menu 2024'),fetched_at:'2026-11-04T00:00:00Z',sha256:'fixture',extraction:'html'};
 }});
 assert.equal(result.coverage.length,7);assert.equal(result.coverage.find(c=>c.channel==='yelp_menu').status,'incomplete');assert.equal(result.menus[0].freshness,'stale');assert.equal(result.prices[0].url,'https://example.com/menu');assert.equal(result.menus[0].items[0].name,'Noodles');assert.equal(result.menus[0].items[0].price,'$12.50');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('weekly menu adapter accepts years and detects stable-ID URL replacement',()=>{
 const old={store_id:'a',channel:'official',source_url:'https://example.com/old.pdf',menu_date:'2024',date_source:'on_page',menu_id:'dinner'};
 assert.equal(menuObservations([old])[0].menu_date,'2024');
 const changes=menuChanges([{...old,source_url:'https://example.com/new.pdf',menu_date:'2026'}],[old]);assert.match(changes[0].note,/replaced/);
});

test('website vendor name does not create fake menu-image candidates',()=>{
 const doc=htmlDocument('<body><img src="https://menusifu.com/logo.png"><a href="https://menusifu.com">Powered by Menusifu</a><a href="/menu.pdf">Menu</a></body>','https://example.com');
 assert.deepEqual(doc.links,['https://example.com/menu.pdf']);
});

test('menu-item DOM binds dish name to its own price and ignores promotional tags',()=>{
 const doc=htmlDocument('<body><article class="menu-item"><div><span>Popular</span><h3>Pastrami</h3><p>Hand sliced</p></div><div class="price">$30.95</div></article></body>','https://example.com/menu');
 assert.equal(doc.prices[0].name,'Pastrami');assert.equal(doc.prices[0].price,'$30.95');
 assert.deepEqual(pricesFromText('$27 / $28 / $29'),[]);
});

test('web menu scope visits only selected platforms and links mode omits dish prices',async()=>{
 const root=await mkdtemp(join(tmpdir(),'menu-scope-'));const visited=[];
 try{
  const record=(platform,url)=>({platform,url,matched:true,found:true,name:'Demo',address:'1 Main St',hours:null,fetched_at:'2026-11-04T00:00:00Z'});
  const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[record('yelp','https://yelp.com/menu/demo'),record('doordash','https://doordash.com/menu')]},{root,platforms:['yelp'],mode:'links',read:async url=>{
   visited.push(url);return {url,format:'html',text:'Menu',links:[],prices:[{name:'Soup',price:'$5',currency:null,variant:null,evidence:'Soup $5'}],date:extractDate('Menu 2024'),fetched_at:'2026-11-04T00:00:00Z',sha256:'fixture',extraction:'html'};
  }});
  assert.deepEqual(visited,['https://yelp.com/menu/demo']);assert.equal(result.menus.length,1);assert.deepEqual(result.prices,[]);assert.equal(result.summary.mode,'links');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('real provider hour shapes preserve raw values and compare without assuming numeric weekday order',()=>{
 const record=(platform,hours)=>({platform,found:true,matched:true,hours,url:'https://example.com',fetched_at:'2026-11-04T00:00:00Z'});
 const google=record('google_maps',{Mon:'10 AM to 10:30 PM'});
 const yelp=record('yelp',[{dayOfWeekShort:'Mon',hours:['10:00 AM - 10:30 PM'],regularHours:['10:00 AM - 10:30 PM']}]);
 const uber=record('uber_eats',[{dayRange:'Every Day',sectionHours:[{startTime:660,endTime:1320}]}]);
 const grub=record('grubhub',Array.from({length:7},(_,i)=>({dayOfWeek:i+1,timeRanges:['16:00-03:00']})));
 const before=JSON.stringify([google,yelp,uber,grub]),rows=compareHours([google,yelp,uber,grub]);
 assert.equal(rows.find(r=>r.platform==='yelp'&&r.day==='Monday').verdict,'一致');
 assert.equal(rows.find(r=>r.platform==='uber_eats'&&r.day==='Monday').verdict,'不一致');
 assert.equal(rows.find(r=>r.platform==='grubhub'&&r.day==='Monday').diff_minutes,270);
 assert.equal(JSON.stringify([google,yelp,uber,grub]),before);
});

test('verified Yelp business slug establishes menu association without exact bilingual text match',async()=>{
 const root=await mkdtemp(join(tmpdir(),'menu-linked-'));
 try{
  const result=await collectMenuAudit({store_id:'linked',name:'Long bilingual restaurant name',address:'145 Mulberry St, New York, NY 10013',records:[{platform:'yelp',found:true,matched:true,url:'https://www.yelp.com/biz/easy-joy-new-york',name:'Easy Joy',hours:null}],sources:[{channel:'yelp_menu',platform:'yelp',url:'https://www.yelp.com/menu/easy-joy-new-york',identity_verified:false}]},{root,read:async url=>({url,format:'html',text:'Menu: Appetizers',prices:[],links:[],date:extractDate(''),fetched_at:'2026-11-04T00:00:00Z',sha256:'fixture',extraction:'html'})});
  assert.equal(result.menus.length,1);assert.equal(result.menus[0].url,'https://www.yelp.com/menu/easy-joy-new-york');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Apify menus are reused only for a matched branch and links mode excludes prices',async()=>{
 const {structuredMenu}=await import('../dist/backend/menu-audit/providers.js');
 const record={platform:'uber_eats',found:true,matched:true,url:'https://www.ubereats.com/store/demo/123',name:'Demo Cafe',address:'1 Main St, New York, NY 10001',phone:'2125550101'};
 const raw={status:'unverified',actor:'fixture/menu',run_id:'fixture',collected_at:'2026-11-04T00:00:00Z',items:[{name:record.name,url:record.url,address:record.address,phone:record.phone,menuItems:[{name:'Noodles',price:'12.50',currency:'USD'}]}]};
 const menu=structuredMenu('uber_eats',raw,record,false);assert.equal(menu.menu.item_count,1);assert.deepEqual(menu.prices,[]);assert.deepEqual(menu.menu.items,[]);assert.equal(menu.menu.items_collected,false);
 assert.equal(structuredMenu('uber_eats',raw,{...record,matched:false},true),null);
 assert.equal(structuredMenu('uber_eats',{...raw,items:[{...raw.items[0],name:'Other Cafe',address:'9 Other St'}]},record,true),null);
 const full=structuredMenu('uber_eats',raw,record,true);assert.equal(full.prices[0].price,'12.50');assert.equal(full.menu.items[0].name,'Noodles');assert.equal(full.menu.items[0].price,'12.50');assert.equal(full.menu.items[0].url,record.url);assert.equal(full.menu.items_collected,true);
});

test('partial delivery success cannot hide another selected platform failure',async()=>{
 const {summarizePlatforms,validMenuCandidate}=await import('../dist/backend/menu-audit/sources.js');
 const states=summarizePlatforms(['doordash','uber_eats','grubhub'],[{platform:'doordash',status:'found'},{platform:'uber_eats',status:'found'},{platform:'grubhub',status:'error'}],[{platform:'doordash'},{platform:'uber_eats'}],()=>true);
 assert.deepEqual(states.map(v=>v.status),['found','found','incomplete']);
 assert.equal(validMenuCandidate('https://www.yelp.com/reservations/fixture','yelp'),false);
 assert.equal(validMenuCandidate('https://www.facebook.com/groups/fixture/posts/1','facebook'),false);
 assert.equal(validMenuCandidate('https://www.yelp.com/menu/fixture','yelp'),true);
});

test('embedded menu items preserve price objects and explicit unknown prices for auditing',async()=>{
 const {structuredMenu}=await import('../dist/backend/menu-audit/providers.js');
 const record={platform:'grubhub',found:true,matched:true,url:'https://www.grubhub.com/restaurant/demo/123',name:'Demo Cafe',address:'1 Main St, New York, NY 10001',phone:'2125550101'};
 const price={pickup:12,delivery:13.5};
 const raw={status:'unverified',actor:'fixture/menu',run_id:'fixture',collected_at:'2026-11-04T00:00:00Z',items:[{name:record.name,url:record.url,address:record.address,phone:record.phone,menuItems:[{name:'Soup',price},{name:'Market special'}]}]};
 const menu=structuredMenu('grubhub',raw,record,true).menu;
 assert.deepEqual(menu.items[0].price,price);assert.equal(menu.items[1].price,null);assert.equal(menu.items.length,2);
});


test('DoorDash group categories survive deduplication and stay separate from variants',async()=>{
 const {structuredMenu}=await import('../dist/backend/menu-audit/providers.js');
 const record={platform:'doordash',found:true,matched:true,url:'https://www.doordash.com/store/demo-123',name:'Demo Cafe',address:'1 Main St, New York, NY 10001',phone:'2125550101'};
 const dish={id:'soup',name:'Soup',variant:'Large',price:{display:'$12.50',amount:12.5,currency:'USD'}};
 const raw={status:'success',actor:'fixture/menu',run_id:'fixture',collected_at:'2026-11-04T00:00:00Z',items:[{name:record.name,url:record.url,address:record.address,phone:record.phone,item_list:{name:'Popular',items:[dish]},item_list_2:{name:'Soups',items:[dish,null,{id:'tea',name:'Tea',category:'Drinks',price:0}]}}]};
 const result=structuredMenu('doordash',raw,record,true);
 assert.equal(result.menu.items.length,2);assert.equal(result.menu.items[0].category,'Soups');assert.equal(result.menu.items[0].variant,'Large');assert.deepEqual(result.menu.items[0].price,dish.price);
 assert.equal(result.menu.items[1].category,'Drinks');assert.equal(result.menu.items[1].price,0);assert.equal(result.prices[0].category,'Soups');
});

test('HTML menu sections propagate categories without interpreting offer variants as categories',()=>{
 const data={'@type':'Menu',hasMenuSection:[{'@type':'MenuSection',name:'Dim sum',hasMenuItem:[{'@type':'MenuItem',name:'Dumplings',offers:{name:'Six pieces',price:13.2,priceCurrency:'USD'}}]},{'@type':'MenuItem',name:'Tea',offers:{name:'Large',price:4}}]};
 const result=htmlDocument('<script type="application/ld+json">'+JSON.stringify(data)+'</script>','https://example.com/menu');
 assert.equal(result.prices[0].category,'Dim sum');assert.equal(result.prices[0].variant,'Six pieces');assert.equal(result.prices[1].category,null);assert.equal(result.prices[1].variant,'Large');
});
