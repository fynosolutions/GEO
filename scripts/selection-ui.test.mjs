import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('form combines name/address and submits only checked platforms',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{
  const page=await browser.newPage();const submissions=[];
  await page.route('http://geo.test/**',async route=>{const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path==='/api/check'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{message:'Fixture received.'}});}
   const file=path.startsWith('/js/')||path.startsWith('/css/')?'dist/public'+path:'dist/public/index.html';return route.fulfill({body:await readFile(file),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://geo.test/');assert.equal(await page.locator('input[name=platforms]').count(),8);
  await page.locator('#website').fill('Fixture Cafe');await page.locator('#target-address').fill('123 Main St');
  assert.equal(await page.locator('#search-preview').textContent(),'Google Maps search: Fixture Cafe — 123 Main St');
  for(const checkbox of await page.locator('input[name=platforms]').all())await checkbox.uncheck();
  await page.locator('#submit-button').click();await page.getByText('Select at least one platform.',{exact:true}).waitFor();assert.equal(submissions.length,0);
  await page.getByLabel('Yelp',{exact:true}).check();await page.locator('#submit-button').click();await page.getByText('Fixture received.',{exact:true}).waitFor();
  assert.deepEqual(submissions,[{name:'Fixture Cafe',platforms:['yelp'],target_address:'123 Main St'}]);
  await page.locator('#collect-menus').check();assert.equal(await page.locator('#menu-options').isVisible(),true);
  await Promise.all([page.waitForRequest(r=>r.url().endsWith('/api/check')),page.locator('#submit-button').click()]);await page.getByText('Fixture received.',{exact:true}).waitFor();
  assert.equal(submissions.at(-1).menu_mode,'links');
  await page.locator('#menu-mode').selectOption('full');await Promise.all([page.waitForRequest(r=>r.url().endsWith('/api/check')),page.locator('#submit-button').click()]);await page.getByText('Fixture received.',{exact:true}).waitFor();assert.equal(submissions.at(-1).menu_mode,'full');
 }finally{await browser.close();}
});
