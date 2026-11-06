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
 assert.equal(rows.find(r=>r.platform==='grubhub'&&r.day==='Monday').diff_minutes,null);
 assert.equal(rows.find(r=>r.platform==='grubhub'&&r.day==='Monday').verdict,null);
 assert.match(rows.find(r=>r.platform==='grubhub'&&r.day==='Monday').reason,/timezone is unverified/);
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


test('Grubhub menu currency uses explicit restaurant currencyCode without inventing categories',async()=>{
 const {structuredMenu}=await import('../dist/backend/menu-audit/providers.js');
 const record={platform:'grubhub',found:true,matched:true,url:'https://www.grubhub.com/restaurant/demo/123',name:'Demo Cafe',address:'1 Main St, New York, NY 10001',phone:'2125550101'};
 const raw={status:'success',actor:'fixture/menu',run_id:'fixture',collected_at:'2026-11-05T00:00:00Z',items:[{name:record.name,url:record.url,address:record.address,phone:record.phone,currencyCode:'USD',menuItems:[{name:'Soup',price:{pickup:12,delivery:13}},{name:'Imported tea',price:4,currency:'CAD'}]}]};
 const result=structuredMenu('grubhub',raw,record,true);
 assert.equal(result.menu.items[0].currency,'USD');assert.equal(result.prices[0].currency,'USD');assert.equal(result.menu.items[0].category,null);assert.equal(result.menu.items[1].currency,'CAD');
 const missing=structuredMenu('grubhub',{...raw,items:[{...raw.items[0],currencyCode:undefined}]},record,true);assert.equal(missing.menu.items[0].currency,null);
});


test('all-channel audit follows dated public menu images and compares verified website hours',async()=>{
 const root=await mkdtemp(join(tmpdir(),'all-channels-'));const queries=[];
 const record={platform:'google_maps',found:true,matched:true,name:'Demo Cafe',address:'1 Main St',phone:null,hours:{Monday:'10:00-22:00'},url:'https://google.com/maps/demo',fetched_at:'2026-11-05T00:00:00Z'};
 const before=JSON.stringify(record);
 const doc=url=>({url,format:'html',text:'Demo Cafe 1 Main St Menu',menuEvidence:true,links:[],prices:[],date:extractDate(''),fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:'html'});
 try{
  const result=await collectMenuAudit({store_id:'demo',name:'Demo Cafe',address:'1 Main St',website:'https://demo.example/',website_verified:true,records:[record]},{root,discover:true,runProvider:async(_platform,target)=>{
   queries.push(target.queries);const domain=target.queries.match(/site:([^ ]+)/)?.[1];
   return {status:'success',items:[{organicResults:['resy.com','instagram.com'].includes(domain)?[{url:'https://'+domain+'/demo-menu'}]:[]}],collected_at:'2026-11-05T00:00:00Z'};
  },read:async url=>url==='https://demo.example/'?{...doc(url),hours:[{day:'Monday',opens:'10:00',closes:'21:00'}],menuMedia:[{url:'https://cdn.example/menu.png',upload_date:'2024-03-01'}]}:url.includes('menu.png')?{...doc(url),format:'image',text:'Demo Cafe menu',date:extractDate(''),prices:[{name:'Soup',category:'Soups',variant:null,price:'$5',currency:null,evidence:'Soup $5'}]}:doc(url)});
  assert.equal(result.coverage.length,7);assert.ok(result.coverage.every(c=>c.status!=='not_checked'));
  const image=result.menus.find(m=>m.format==='image');assert.equal(image.date_source,'upload_date');assert.equal(image.menu_date,'2024-03-01');assert.equal(image.freshness,'stale');assert.equal(image.items[0].category,'Soups');
  assert.ok(queries.some(q=>q.includes('resy.com')));assert.ok(queries.some(q=>q.includes('instagram.com')));
  const hours=result.hours.find(r=>r.platform==='official'&&r.day==='Monday');assert.equal(hours.verdict,'不一致');assert.equal(hours.diff_minutes,-60);assert.equal(hours.url,'https://demo.example/');assert.equal(JSON.stringify(record),before);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('public HTML metadata discovers menu media dates and branch-specific structured hours',()=>{
 const schema={'@type':'Restaurant',name:'Demo Cafe',address:{streetAddress:'1 Main St'},openingHoursSpecification:[{dayOfWeek:['Monday','Tuesday'],opens:'10:00',closes:'22:00'}],image:{'@type':'ImageObject',name:'Menu photo',contentUrl:'https://cdn.example/menu.jpg',uploadDate:'2024-04-01'}};
 const html='<script type="application/ld+json">'+JSON.stringify(schema)+'</script><figure><img src="/menu2.png" alt="Dinner menu"><time datetime="2024-05-01"></time></figure><img src="/logo.png" alt="Logo">';
 const parsed=htmlDocument(html,'https://demo.example',false);
 assert.equal(parsed.identities[0].name,'Demo Cafe');assert.equal(parsed.hours.length,2);assert.equal(parsed.menuMedia.length,2);assert.equal(parsed.menuMedia.find(m=>m.url.endsWith('menu2.png')).upload_date,'2024-05-01');assert.deepEqual(parsed.prices,[]);
});


test('official structured hours remain associated with the matched branch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'branch-hours-'));
 try{
  const identities=[{name:'Demo Cafe',address:'9 Other St',phone:null,hours:[{day:'Monday',opens:'08:00',closes:'18:00'}]},{name:'Demo Cafe',address:'1 Main St',phone:null,hours:[{day:'Monday',opens:'10:00',closes:'22:00'}]}];
  const google={platform:'google_maps',found:true,matched:true,name:'Demo Cafe',address:'1 Main St',hours:{Monday:'10:00-22:00'},url:'https://google.com/maps/demo',fetched_at:'2026-11-05T00:00:00Z'};
  const result=await collectMenuAudit({store_id:'branch',name:'Demo Cafe',address:'1 Main St',website:'https://example.com',website_verified:true,records:[google]},{root,read:async url=>({url,format:'html',text:'Menu',menuEvidence:true,links:[],prices:[],identities,hours:null,date:extractDate(''),sha256:'fixture',extraction:'html',fetched_at:'2026-11-05T00:00:00Z'})});
  assert.equal(result.hours.find(r=>r.platform==='official'&&r.day==='Monday').verdict,'一致');
 }finally{await rm(root,{recursive:true,force:true});}
});


test('verified Yelp photo pages can queue labelled CDN menu images with upload dates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'yelp-photo-'));const visited=[];
 try{
  const record={platform:'yelp',found:true,matched:true,name:'Demo',address:'1 Main St',url:'https://www.yelp.com/biz/demo',fetched_at:'2026-11-05T00:00:00Z'};
  const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[record],sources:[{platform:'yelp',channel:'yelp_menu',url:'https://www.yelp.com/biz_photos/demo',identity_verified:false}]},{root,platforms:['yelp'],read:async url=>{
   visited.push(url);const image=url.includes('cdn.example');return {url,format:image?'image':'html',text:'Menu',links:[],prices:[],date:extractDate(''),menuMedia:image?[]:[{url:'https://cdn.example/opaque-photo',upload_date:'2024-06-01'}],fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:image?'ocr':'html'};
  }});
  const image=result.menus.find(m=>m.format==='image');assert.ok(image);assert.equal(image.menu_date,'2024-06-01');assert.equal(image.date_source,'upload_date');assert.ok(visited.includes('https://cdn.example/opaque-photo'));
 }finally{await rm(root,{recursive:true,force:true});}
});


test('menu URL fragments do not duplicate outputs or consume the document read limit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'menu-fragments-'));const visited=[];
 try{
  const source=url=>({channel:'official_html',platform:'official',url,identity_verified:true});
  const sources=Array.from({length:65},(_,i)=>source('https://demo.example/store-menu#section-'+i));sources.push(source('https://demo.example/dinner-package.html'),source('https://demo.example/lunch-menu?lang=en'));
  const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[],sources},{root,platforms:['official'],read:async url=>{
   visited.push(url);return {url,format:'html',text:'Menu Dinner Demo',menuEvidence:!url.includes('package'),links:[url+'#contentarea'],prices:[],date:extractDate(''),fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:'html'};
  }});
  assert.equal(visited.length,3);assert.equal(result.menus.length,2);assert.ok(visited.every(url=>!url.includes('#')));assert.ok(visited.includes('https://demo.example/lunch-menu?lang=en'));assert.ok(!result.coverage.flatMap(c=>c.attempts).some(a=>a.status==='not_checked'));assert.ok(!result.menus.some(m=>m.url.includes('package')));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('menu comparison URLs retain meaningful parameters and deduplicate redirect aliases',async()=>{
 const {menuUrlKey}=await import('../dist/backend/menu-audit/sources.js');
 assert.equal(menuUrlKey('https://demo.example/menu?lang=en&utm_source=test#content'),'https://demo.example/menu?lang=en');
 assert.notEqual(menuUrlKey('https://demo.example/menu?lang=en'),menuUrlKey('https://demo.example/menu?lang=es'));
 const root=await mkdtemp(join(tmpdir(),'menu-redirect-'));
 try{
  const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[],sources:['https://demo.example/old-menu','https://demo.example/menu'].map(url=>({channel:'official_html',platform:'official',url,identity_verified:true}))},{root,platforms:['official'],read:async()=>({url:'https://demo.example/menu',format:'html',text:'Menu',menuEvidence:true,links:[],prices:[],date:extractDate(''),fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:'html'})});
  assert.equal(result.menus.length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('DOM menu categories are extracted while product navigation and menusifu logos are excluded',()=>{
 const html='<nav class="menu-item">Menu</nav><section class="menu-section"><header><h2>Hot Sandwiches</h2></header><article class="menu-item"><h3>Pastrami</h3><span class="price">$30.95</span></article></section><img src="https://website-cdn.menusifu.com/public/images/Transparent+Logo.png"><img src="https://cdn.example/dinner-menu.png" alt="Dinner menu">';
 const doc=htmlDocument(html,'https://demo.example/store-menu');assert.equal(doc.prices[0].category,'Hot Sandwiches');assert.equal(doc.menuEvidence,true);assert.equal(doc.menuMedia.length,1);assert.ok(doc.menuMedia[0].url.endsWith('dinner-menu.png'));
 const product=htmlDocument('<nav><a href="/store-menu">Menu</a></nav><h1>Dinner Package</h1><p>Soup to dessert dinner $99</p>','https://demo.example/dinner-package');assert.equal(product.menuEvidence,false);
});

test('Uber Eats weekday ranges, split hours and explicit end-of-day minutes remain comparable',async()=>{
 const {week}=await import('../dist/backend/menu-audit/hours.js');
 const raw=[{dayRange:'Monday - Thursday',sectionHours:[{startTime:480,endTime:1290}]},{dayRange:'Friday',sectionHours:[{startTime:480,endTime:1439}]},{dayRange:'Saturday',sectionHours:[{startTime:0,endTime:1440}]},{dayRange:'Sunday',sectionHours:[{startTime:0,endTime:165},{startTime:720,endTime:1290}]}];
 const before=JSON.stringify(raw),parsed=week(raw);assert.ok(parsed.every(Boolean));assert.equal(parsed[0][0].close,'21:30');assert.equal(parsed[3][0].open,'08:00');assert.equal(parsed[4][0].close,'23:59');assert.equal(parsed[5][0].close,'24:00');assert.equal(parsed[6].length,2);assert.equal(JSON.stringify(raw),before);
 const wrapped=week([{dayRange:'Friday - Monday',sectionHours:[{startTime:600,endTime:1200}]}]);assert.ok(wrapped[0]);assert.equal(wrapped[1],null);assert.ok(wrapped[4]);
 assert.equal(week([{dayRange:'Unknown',sectionHours:[{startTime:1,endTime:2}]}])[0],null);
});

test('configured official website and Google ordering website are both checked without granting configured identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'official-sites-'));const visited=[];
 try{
  const out=await collectMenuAudit({store_id:'demo',name:'Demo Cafe',address:'1 Main St',records:[],website:'https://demo.example/',websites:[{url:'https://demo.example/',verified:false},{url:'https://ordering.example/123',verified:true}]},{root,platforms:['official'],read:async url=>{
   visited.push(url);return {url,format:'html',text:'Menu',menuEvidence:true,identities:url.includes('demo.example')?[{name:'Other Cafe',address:'2 Main St',phone:null}]:[],links:[],prices:[],date:extractDate(''),fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:'html'};
  }});
  assert.deepEqual(visited,['https://demo.example/','https://ordering.example/123']);
  assert.equal(out.menus.length,1);assert.equal(out.menus[0].url,'https://ordering.example/123');
  assert.equal(out.coverage.find(c=>c.channel==='official_html').attempts[0].status,'unverified');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('empty menu search and dynamic HTML never establish platform-wide menu absence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'unknown-menu-'));
 try{
  const out=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[],sources:[{channel:'delivery_menu',platform:'uber_eats',url:'https://www.ubereats.com/store/demo',identity_verified:true}]},{root,discover:true,platforms:['uber_eats'],runProvider:async()=>({status:'empty',items:[],collected_at:'2026-11-05T00:00:00Z',note:''}),read:async url=>({url,format:'html',text:'Enable JavaScript',menuEvidence:false,links:[],prices:[],date:extractDate(''),fetched_at:'2026-11-05T00:00:00Z',sha256:'fixture',extraction:'html'})});
  assert.equal(out.coverage.find(c=>c.channel==='delivery_menu').status,'incomplete');
  assert.ok(out.coverage.find(c=>c.channel==='delivery_menu').attempts.every(a=>a.status==='unverified'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('menu-card prices are extracted while dish photography is excluded from menu OCR',()=>{
 const doc=htmlDocument('<body><article class="menu-card" data-cat="burgers"><img src="/images/menu-chicken-burger-440.webp" alt="Chicken burger"><div class="menu-card-title">Chicken Burger</div><span class="menu-card-price">$10.95</span></article><img src="/dinner-menu2.png" alt="Dinner menu"></body>','https://example.com/menu.html');
 assert.equal(doc.prices[0].name,'Chicken Burger');assert.equal(doc.prices[0].category,'burgers');assert.equal(doc.prices[0].price,'$10.95');assert.equal(doc.menuEvidence,true);
 assert.equal(doc.menuMedia.length,1);assert.ok(!doc.links.some(x=>x.includes('chicken-burger')));
});

test('unverified configured HTTPS source cannot suppress a verified HTTP redirect to that same document',async()=>{
 const root=await mkdtemp(join(tmpdir(),'official-redirect-'));
 try{
  const result=await collectMenuAudit({store_id:'demo',name:'Long Google alias',address:'1 Main St',records:[],websites:[{url:'https://example.com/',verified:false},{url:'http://example.com/',verified:true}]},{root,platforms:['official'],read:async()=>({url:'https://example.com/',format:'html',text:'Menu',menuEvidence:true,identities:[],links:[],prices:[],date:extractDate(''),fetched_at:'2026-11-06T00:00:00Z',sha256:'fixture',extraction:'html'})});
  assert.equal(result.menus.length,1);assert.equal(result.menus[0].url,'https://example.com/');
  assert.equal(result.coverage[0].attempts[0].status,'unverified');assert.equal(result.coverage[0].attempts[1].status,'found');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('ordering menus preserve dish category, original name and displayed starting price',()=>{
 const chow=htmlDocument('<div class="MealWithCategorySection_main__fixture"><div class="MealWithCategorySection_categoryHeader__fixture">A La Carte 单点</div><div class="MealCard_main__fixture"><span class="MealCard_mealName__fixture">crispy chicken burger</span><span class="MealCard_mealForeignName__fixture">香脆鸡堡</span><span class="MealCard_mealPrice__fixture">$6.25⁺</span></div></div>','https://pos.chowbus.com/online-ordering/store/demo/123');
 assert.deepEqual(chow.prices.map(({name,category,price})=>({name,category,price})),[{name:'crispy chicken burger',category:'A La Carte 单点',price:'$6.25⁺'}]);
 const meal=htmlDocument('<div role="region"><div role="button"><span>外卖套餐 </span><span>(8)</span></div><div><h2><button data-menu-item-id="1">椰子鸡套餐</button></h2><div><span class="sr-only">价格：$20.00</span><div><div aria-hidden="true">$20.00</div><span aria-hidden="true">+</span></div></div></div></div><footer>©2026</footer>','https://order.mealkeyway.com/customer/release/index?mid=demo#/main');
 assert.deepEqual(meal.prices.map(({name,category,price})=>({name,category,price})),[{name:'椰子鸡套餐',category:'外卖套餐',price:'$20.00'}]);assert.equal(meal.menuEvidence,true);
 const yelp=htmlDocument('<section class="menu-section"><h2>Take Out Menu</h2><div class="menu-item"><h4>Soup</h4><ul class="menu-item-prices"><li>$12.00</li></ul></div></section>','https://www.yelp.com/menu/demo');
 assert.equal(yelp.prices[0].category,'Take Out Menu');assert.equal(yelp.prices[0].price,'$12.00');
});

test('official ordering link follows cross-domain only with independent branch evidence and keeps SPA route',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ordering-link-')),visited=[];
 try{
  const url='https://order.mealkeyway.com/customer/release/index?mid=demo#/main';
  const google={platform:'google_maps',matched:true,found:true,name:'Demo Restaurant',address:'1 Main St, New York, NY 10001',phone:'2125550100',hours:null,url:'https://www.google.com/maps/demo',fetched_at:'2026-11-06T00:00:00Z'};
  const result=await collectMenuAudit({store_id:'demo',name:google.name,address:google.address,website:'https://example.com',website_verified:true,records:[google]},{root,platforms:['official'],read:async value=>{
   visited.push(value);return {url:value,format:'html',text:value.includes('mealkeyway')?'1 Main Street, New York, NY 10001 212-555-0100':'Official site',links:value.includes('mealkeyway')?[]:[url,'https://other.example/menu'],prices:value.includes('mealkeyway')?[{name:'Soup',category:'Lunch',price:'$12',variant:null,currency:null,evidence:'Soup $12'}]:[],menuEvidence:value.includes('mealkeyway'),date:extractDate(''),fetched_at:google.fetched_at,sha256:'fixture',extraction:'html'};
  }});
  assert.ok(visited.includes(url));assert.ok(!visited.includes('https://other.example/menu'));assert.equal(result.menus.length,1);assert.equal(result.menus[0].discovered_from,'https://example.com/');assert.equal(result.menus[0].items[0].price,'$12');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Yelp dedicated menu is attempted even if business page is blocked',async()=>{
 const root=await mkdtemp(join(tmpdir(),'yelp-menu-route-'));
 try{
 const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[{platform:'yelp',matched:true,found:true,name:'Demo',address:'1 Main St',hours:null,url:'https://www.yelp.com/biz/demo'}]},{root,platforms:['yelp'],read:async url=>{
  if(url.includes('/biz/'))throw Error('Resource HTTP 403.');return {url,format:'html',text:'Take Out Menu',prices:[{name:'Soup',category:'Lunch',price:'$12',variant:null,currency:null,evidence:'Soup $12'}],links:[],menuEvidence:true,date:extractDate(''),fetched_at:'2026-11-06T00:00:00Z',sha256:'fixture',extraction:'html'};
 }});
 assert.equal(result.menus.length,1);assert.equal(result.menus[0].url,'https://www.yelp.com/menu/demo');assert.ok(result.coverage.find(c=>c.channel==='yelp_menu').attempts.some(a=>a.status==='error'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('ordering source keys retain routing and merchant identity but reject malformed Yelp hosts',async()=>{
 const {menuUrlKey,validMenuCandidate}=await import('../dist/backend/menu-audit/sources.js');
 assert.equal(menuUrlKey('https://order.mealkeyway.com/customer/release/index?mid=demo&utm_source=test#/main'),'https://order.mealkeyway.com/customer/release/index?mid=demo#/main');
 assert.notEqual(menuUrlKey('https://order.mealkeyway.com/customer/release/index?mid=a#/main'),menuUrlKey('https://order.mealkeyway.com/customer/release/index?mid=b#/main'));
 assert.equal(validMenuCandidate('https://www.www.yelp.com/biz_photos/demo','yelp'),false);
});

test('shared menu destinations are read once but source date evidence stays channel-specific',async()=>{
 const root=await mkdtemp(join(tmpdir(),'menu-shared-'));let reads=0;
 try{
 const url='https://example.com/menu.png';
 const result=await collectMenuAudit({store_id:'demo',name:'Demo',address:'1 Main St',records:[],sources:[{channel:'official_file',platform:'official',url,identity_verified:true,upload_date:'2024-01-01',discovered_from:'https://example.com'},{channel:'google_menu',platform:'google_maps',url,identity_verified:true,upload_date:'2026-01-01',discovered_from:'https://www.google.com/maps/demo'}]},{root,read:async()=>{reads++;return {url,format:'image',text:'Menu',prices:[],links:[],date:extractDate(''),fetched_at:'2026-11-06T00:00:00Z',sha256:'fixture',extraction:'ocr'};}});
 assert.equal(reads,1);assert.equal(result.menus.length,2);assert.equal(result.menus[0].menu_date,'2024-01-01');assert.equal(result.menus[1].menu_date,'2026-01-01');assert.notEqual(result.menus[0].discovered_from,result.menus[1].discovered_from);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('public menu initialization permits observed reads but rejects ordering and account mutations',async()=>{
 const {allowMenuRequest}=await import('../dist/backend/menu-audit/render.js');
 const host='order.mealkeyway.com';
 assert.equal(allowMenuRequest('POST','https://order.mealkeyway.com/member/getAllBusinessInfo',host),true);
 assert.equal(allowMenuRequest('POST','https://order.mealkeyway.com/member/getMerchantConfig',host),true);
 assert.equal(allowMenuRequest('POST','https://play.google.com/log',host),true);
 for(const path of ['/merchant/demo/order','/member/login','/member/register','/checkout','/payment'])assert.equal(allowMenuRequest('POST','https://order.mealkeyway.com'+path,host),false);
 assert.equal(allowMenuRequest('POST','https://order.mealkeyway.com/member/getMerchantConfig','www.yelp.com'),false);
 assert.equal(allowMenuRequest('DELETE','https://order.mealkeyway.com/merchant/demo/menu',host),false);
});
