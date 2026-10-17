import {test} from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument } from '../restaurant_collector/extract.mjs';
import { searchCandidates } from '../restaurant_collector/browser.mjs';
import {collectGoogle} from '../restaurant_collector/google.mjs';
import {inferPane,normalizeCapture} from '../extensions/google-maps-collector/content.mjs';

const modulePath = process.env.GEO_PLAYWRIGHT_MODULE;
test('Google DOM identifies the menu subcategory and extracts priced cards from its visible pane', {skip:!modulePath},async()=>{
  const {chromium}=await import(modulePath);
  const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.GEO_BROWSER_EXECUTABLE ? {executablePath:process.env.GEO_BROWSER_EXECUTABLE} : {})});
  try{
    const page=await browser.newPage();
    await page.setContent(`<div role="main"><h1>Fixture Restaurant</h1>
      <button role="tab" aria-selected="true" aria-label="Menu of Fixture Restaurant">Menu</button>
      <button role="tab" aria-selected="true">Lunch menu</button>
      <div role="listitem"><h3>Salmon Lunch</h3><p>Grilled salmon</p><p>$13.99</p></div>
      <div role="listitem"><h3>Steak Lunch</h3><p>With sauce</p><p>$10.99</p></div></div>`);
    const raw=await page.evaluate(extractDocument,'google_maps');
    assert.equal(raw.menuCategory,'Lunch menu');
    const pane=inferPane('https://www.google.com/maps/place/Fixture',raw.selectedTabs);
    assert.equal(pane,'menu');
    const data=normalizeCapture(raw,pane,raw.menuCategory);
    assert.deepEqual(data.menu.items.map(i=>i.name),['Salmon Lunch','Steak Lunch']);
    assert.equal(data.description,'');
    await page.getByRole('tab',{name:'Lunch menu',exact:true}).evaluate(el=>el.textContent='Overview');
    assert.equal((await page.evaluate(extractDocument,'google_maps')).menuCategory,'Overview');
  }finally{await browser.close();}
});
test('browser extracts only evidenced listing fields and explicitly featured dishes', {skip:!modulePath}, async () => {
  const {chromium} = await import(modulePath);
  const browser = await chromium.launch({headless:true,...(process.env.GEO_BROWSER_EXECUTABLE ? {executablePath:process.env.GEO_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage();
    await page.setContent(`<h1>Easy Joy</h1>
      <script type="application/ld+json">${JSON.stringify({'@type':'Restaurant',name:'Easy Joy',address:{streetAddress:'145 Mulberry St',addressLocality:'New York',addressRegion:'NY'},telephone:'+1 212 555 0100'})}</script>
      <section><h2>About the Business</h2><p>Fixture merchant description.</p></section>
      <section><h2>Popular dishes</h2><h3>Fixture Hot Pot</h3><h3>Fixture Dumplings</h3></section>
      <section><h2>Reviews</h2><p>Try an invented dish.</p></section>`);
    const yelp = await page.evaluate(extractDocument,'yelp');
    assert.equal(yelp.name,'Easy Joy');
    assert.equal(yelp.address,'145 Mulberry St, New York, NY');
    assert.equal(yelp.description,'Fixture merchant description.');
    assert.deepEqual(yelp.dishes,['Fixture Hot Pot','Fixture Dumplings']);
    await page.setContent(`<h1>Easy Joy</h1><button data-item-id="address" aria-label="Address: 145 Mulberry St, New York, NY"></button>
      <button data-item-id="phone:tel:2125550100" aria-label="Phone: (212) 555-0100"></button>
      <div class="PYvSYb">Fixture editorial description.</div><h2>Menu</h2><h3>Ordinary menu item</h3>`);
    const google = await page.evaluate(extractDocument,'google_maps');
    assert.equal(google.phone,'(212) 555-0100');
    assert.equal(google.descriptionKind,'platform_summary');
    assert.deepEqual(google.dishes,[]);
    await page.setContent(`<h1>Unknown listing</h1><script type="application/ld+json">${JSON.stringify([
      {'@type':'Restaurant',name:'Branch A',address:'1 Main St'},
      {'@type':'Restaurant',name:'Branch B',address:'2 Main St'}])}</script>`);
    assert.equal((await page.evaluate(extractDocument,'yelp')).address,'');
  } finally { await browser.close(); }
});

test('search follows candidate listing pages and reports blocked responses', {skip:!modulePath}, async () => {
  const {chromium} = await import(modulePath);
  const browser = await chromium.launch({headless:true,...(process.env.GEO_BROWSER_EXECUTABLE ? {executablePath:process.env.GEO_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => {
      const url = route.request().url();
      const body = url.includes('/search?') ? '<a href="https://www.yelp.com/biz/easy-joy">Easy Joy</a>' :
        '<h1>Easy Joy</h1><address>145 Mulberry St, New York, NY</address>';
      return route.fulfill({status:200,contentType:'text/html',body});
    });
    const candidates = await searchCandidates(page,'yelp','Easy Jiy','146 Mulberry St, New York, NY',3);
    assert.equal(candidates.length,1);
    assert.equal(candidates[0].name,'Easy Joy');
    await page.unroute('**/*');
    await page.route('**/*',route => route.fulfill({status:403,body:'Forbidden'}));
    await assert.rejects(searchCandidates(page,'yelp','Easy Joy','New York',3),/HTTP 403/);
  } finally { await browser.close(); }
});

test('Google workflow reads About and Menu panes without treating review mentions as specialties', {skip:!modulePath}, async()=>{
  const {chromium}=await import(modulePath);
  const browser=await chromium.launch({headless:true,...(process.env.GEO_BROWSER_EXECUTABLE ? {executablePath:process.env.GEO_BROWSER_EXECUTABLE} : {})});
  try {
    const page=await browser.newPage();
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<h1>Easy Joy</h1>
      <div role="main" style="height:300px;overflow:auto"><button data-item-id="address" aria-label="Address: 145 Mulberry St, New York, NY"></button>
      <button role="tab" aria-label="About Easy Joy" onclick="document.querySelector('#about').style.display='block'">About</button>
      <button role="tab" aria-label="Menu Easy Joy" onclick="document.querySelector('#menu').style.display='block'">Menu</button>
      <div id="about" style="display:none" data-testid="business-description">Fixture confirmed merchant introduction.</div>
      <section id="menu" style="display:none"><h2>Popular dishes</h2><h3>Fixture Dumplings</h3></section>
      <section><h2>Reviews</h2><p>Some reviewer mentions pizza.</p></section></div>`}));
    const captures=[];
    const result=await collectGoogle(page,{name:'Easy Joy',location:'145 Mulberry St, New York, NY'},
      {limit:1,delayMs:0,capture:async(_,label)=>captures.push(label)});
    assert.equal(result.status,'matched');
    assert.equal(result.selected.description,'Fixture confirmed merchant introduction.');
    assert.equal(result.selected.descriptionKind,'business_description');
    assert.deepEqual(result.selected.dishes,['Fixture Dumplings']);
    assert.ok(captures.includes('about') && captures.includes('menu'));
  } finally {await browser.close();}
});
