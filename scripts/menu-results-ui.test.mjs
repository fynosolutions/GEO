import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
test('menu dashboard separates verified menus, blocked sources and unverified candidates',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{
  const page=await browser.newPage();
  const job={input:{name:'Fixture',platforms:['yelp','doordash','tripadvisor']},status:'partial',records:[],menu_mode:'links',menu_status:'partial',menu_result:{hours:[{platform:'yelp',day:'Monday',open:'10:00',close:'22:30',google_open:'10:00',google_close:'22:30',diff_minutes:0,verdict:'一致',url:'https://www.yelp.com/biz/fixture',google_url:'https://maps.google.com'},{platform:'doordash',day:'Monday',open:null,close:null,google_open:'10:00',google_close:'22:30',diff_minutes:null,verdict:null,reason:'Missing hours'}],menus:[],coverage:[{channel:'yelp_menu',status:'incomplete',attempts:[{platform:'yelp',status:'unverified',url:'https://www.yelp.com/menu/fixture',error:'Identity unverified'}]},{channel:'delivery_menu',status:'incomplete',attempts:[{platform:'doordash',status:'error',url:'https://www.doordash.com/store/fixture',error:'Resource HTTP 403.'}]}],summary:{unsupported_platforms:['tripadvisor']}}};
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path.startsWith('/api/audits/'))return route.fulfill({json:job});
   return route.fulfill({body:await readFile(path.startsWith('/js/')||path.startsWith('/css/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://geo.test/results?id=fixture');await page.getByText('No verified menus retrieved',{exact:true}).waitFor();
  assert.equal(await page.locator('.menu-platform-card').count(),3);
  assert.equal(await page.locator('.result-section > summary h2').first().textContent(),'Restaurant information');
  await page.getByRole('heading',{name:'Opening hours comparison'}).waitFor();
  assert.equal(await page.locator('.hours-analysis tbody tr').count(),2);
  await page.getByLabel('Filter opening hours by platform').selectOption('yelp');assert.equal(await page.locator('.hours-analysis tbody tr').count(),1);assert.equal(await page.locator('.hours-analysis tbody').getByText('Aligned',{exact:true}).count(),1);
  // Each major section folds independently and retains its state during a data refresh.
  await page.locator('#menus-section > summary').click();
  assert.equal(await page.locator('.menu-platform-grid').isVisible(),false);
  assert.equal(await page.locator('.hours-analysis').isVisible(),true);
  await page.locator('#restaurant-section > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#comparison').isVisible(),false);
  const refresh=page.waitForResponse('http://geo.test/api/audits/fixture');await page.getByRole('button',{name:'Refresh results',exact:true}).click();await refresh;
  await page.waitForFunction(()=>document.querySelector('#hours-panel select')?.value==='yelp');
  assert.equal(await page.locator('#menus-section').getAttribute('open'),null);
  assert.equal(await page.locator('#restaurant-section').getAttribute('open'),null);
  await page.getByRole('button',{name:'Collapse all',exact:true}).click();
  assert.equal(await page.locator('.result-section[open]').count(),0);
  await page.getByRole('button',{name:'Expand all',exact:true}).click();
  assert.equal(await page.locator('.result-section[open]').count(),4);
  assert.equal(await page.locator('.menu-platform-card .menu-status').allTextContents().then(x=>x.join('|')),'Needs verification|Access blocked|Not supported');
  assert.equal(await page.getByRole('link',{name:'Review candidate · unverified'}).getAttribute('href'),'https://www.yelp.com/menu/fixture');
  await page.setViewportSize({width:390,height:844});
  const metrics=await page.locator('.menu-panel').boundingBox();assert.ok(metrics.width<=390);
  await page.locator('.menu-attempts summary').first().click();await page.getByText('A candidate page was found, but its connection to this branch is not verified.').waitFor();
  job.menu_mode='full';job.menu_result.menus=[{platform:'doordash',url:'https://www.doordash.com/store/fixture',format:'html',menu_date:null,date_source:'unknown',items:[{name:'Soup Dumplings(6pc)',price:{display:'$13.20',amount:13.2,currency:'USD'},currency:'USD',category:'Dim sum',variant:null},{name:'Tea',price:null,currency:null,variant:null}]}];
  await page.reload();await page.getByText('Dishes & prices (2)',{exact:true}).waitFor();await page.getByText('Soup Dumplings(6pc)',{exact:true}).waitFor();assert.equal(await page.getByText('$13.20 (USD)',{exact:true}).count(),1);
  assert.deepEqual(await page.locator('.menu-dishes-scroll th').allTextContents(),['Dish name','Category','Price']);
  assert.equal(await page.getByRole('cell',{name:'Dim sum',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('cell',{name:'Not available',exact:true}).isVisible(),true);
  await page.getByText('Dishes & prices (2)',{exact:true}).click();assert.equal(await page.getByText('Soup Dumplings(6pc)',{exact:true}).isVisible(),false);
  job.menu_mode='links';job.menu_result.menus[0].items=[];
  await page.reload();await page.getByText('Dish names and prices were not saved in this links-only run.',{exact:false}).waitFor();
 }finally{await browser.close();}
});
