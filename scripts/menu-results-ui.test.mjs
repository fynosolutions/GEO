import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
test('menu dashboard separates verified menus, blocked sources and unverified candidates',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{
  const page=await browser.newPage();
  const job={input:{name:'Fixture',platforms:['yelp','doordash','tripadvisor']},status:'partial',records:[],menu_mode:'links',menu_status:'partial',menu_result:{menus:[],coverage:[{channel:'yelp_menu',status:'incomplete',attempts:[{platform:'yelp',status:'unverified',url:'https://www.yelp.com/menu/fixture',error:'Identity unverified'}]},{channel:'delivery_menu',status:'incomplete',attempts:[{platform:'doordash',status:'error',url:'https://www.doordash.com/store/fixture',error:'Resource HTTP 403.'}]}],summary:{unsupported_platforms:['tripadvisor']}}};
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path.startsWith('/api/audits/'))return route.fulfill({json:job});
   return route.fulfill({body:await readFile(path.startsWith('/js/')||path.startsWith('/css/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://geo.test/results?id=fixture');await page.getByText('No verified menus retrieved',{exact:true}).waitFor();
  assert.equal(await page.locator('.menu-platform-card').count(),3);
  assert.equal(await page.locator('.menu-status').allTextContents().then(x=>x.join('|')),'Needs verification|Access blocked|Not supported');
  assert.equal(await page.getByRole('link',{name:'Review candidate · unverified'}).getAttribute('href'),'https://www.yelp.com/menu/fixture');
  await page.setViewportSize({width:390,height:844});
  const metrics=await page.locator('.menu-panel').boundingBox();assert.ok(metrics.width<=390);
  await page.locator('.menu-attempts summary').first().click();await page.getByText('A candidate page was found, but its connection to this branch is not verified.').waitFor();
 }finally{await browser.close();}
});
